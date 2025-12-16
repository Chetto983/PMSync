/**
 * CRM Backfill Job Processor (P1.7)
 *
 * BullMQ processor for backfilling contact interactions from existing emails.
 * This job scans historical emails and creates ContactInteraction records
 * to populate relationship intelligence data.
 *
 * Safety Features:
 * - Tenant isolation via tenantId in all queries
 * - Idempotent via emailId unique constraint (no duplicates)
 * - Rate limited to avoid database overload
 * - Progress tracking via job progress API
 *
 * Usage:
 * - Queue a job per tenant after P1.7 migration
 * - Can be re-run safely (skips existing interactions)
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RelationshipIntelligenceService } from '../services/relationship-intelligence.service';

// Job data interface
export interface CrmBackfillJobData {
  tenantId: string;
  userId: string;
  batchSize?: number;
  startDate?: string; // ISO date string - only process emails after this date
}

// Job result interface
export interface CrmBackfillResult {
  processed: number;
  interactions: number;
  errors: number;
  duration: number;
}

const QUEUE_NAME = 'crm-backfill';

@Injectable()
export class CrmBackfillProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmBackfillProcessor.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly relationshipService: RelationshipIntelligenceService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured, CRM backfill jobs disabled');
      return;
    }

    try {
      this.redis = new Redis(redisUrl);

      // Create queue
      this.queue = new Queue(QUEUE_NAME, {
        connection: this.redis.duplicate(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      // Create worker
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => this.processBackfillJob(job),
        {
          connection: this.redis.duplicate(),
          concurrency: 1, // Sequential to avoid database overload
          limiter: {
            max: 1,
            duration: 60000, // 1 job per minute max
          },
        },
      );

      this.worker.on('completed', (job, result) => {
        this.logger.log(`Backfill job ${job.id} completed: ${JSON.stringify(result)}`);
      });

      this.worker.on('failed', (job, error) => {
        this.logger.error(`Backfill job ${job?.id} failed:`, error);
      });

      this.logger.log('CRM backfill processor initialized');
    } catch (error) {
      this.logger.error('Failed to initialize CRM backfill processor:', error);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.redis?.quit();
  }

  /**
   * Queue a backfill job for a tenant
   */
  async queueBackfill(data: CrmBackfillJobData): Promise<string> {
    if (!this.queue) {
      throw new Error('CRM backfill queue not initialized');
    }

    const job = await this.queue.add('backfill', data, {
      jobId: `backfill-${data.tenantId}-${Date.now()}`,
    });

    this.logger.log(`Queued backfill job ${job.id} for tenant ${data.tenantId}`);
    return job.id!;
  }

  /**
   * Process a backfill job
   */
  private async processBackfillJob(job: Job<CrmBackfillJobData>): Promise<CrmBackfillResult> {
    const { tenantId, userId, batchSize = 100, startDate } = job.data;
    const startTime = Date.now();

    this.logger.log(`Starting backfill for tenant ${tenantId}`);

    let processed = 0;
    let interactions = 0;
    let errors = 0;
    let cursor: string | undefined;

    // Get user's providers to find emails
    const providers = await this.prisma.providerConfig.findMany({
      where: { tenantId, userId },
      select: { id: true, email: true },
    });

    if (providers.length === 0) {
      this.logger.warn(`No providers found for tenant ${tenantId}, user ${userId}`);
      return { processed: 0, interactions: 0, errors: 0, duration: 0 };
    }

    const providerEmails = new Set(providers.map((p) => p.email.toLowerCase()));

    // Process emails in batches
    do {
      const emails = await this.prisma.email.findMany({
        where: {
          tenantId,
          ...(startDate && { receivedAt: { gte: new Date(startDate) } }),
        },
        select: {
          id: true,
          from: true,
          to: true,
          cc: true,
          bcc: true,
          receivedAt: true,
          subject: true,
        },
        orderBy: { receivedAt: 'asc' },
        take: batchSize,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
      });

      if (emails.length === 0) break;

      for (const email of emails) {
        try {
          await this.processEmailForInteractions(
            tenantId,
            userId,
            {
              id: email.id,
              from: email.from,
              to: email.to,
              cc: email.cc,
              bcc: email.bcc,
              receivedAt: email.receivedAt,
              subject: email.subject,
            },
            providerEmails,
          );
          interactions++;
        } catch (err) {
          this.logger.error(`Error processing email ${email.id}:`, err);
          errors++;
        }
        processed++;
      }

      cursor = emails[emails.length - 1].id;

      // Update progress
      const progress = Math.round((processed / 1000) * 100); // Estimate
      await job.updateProgress(Math.min(progress, 99));

      // Small delay to avoid database overload
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (true);

    // Recalculate all scores after backfill
    this.logger.log(`Recalculating relationship scores for tenant ${tenantId}`);
    await this.relationshipService.recalculateAllScores(tenantId);

    const duration = Date.now() - startTime;
    return { processed, interactions, errors, duration };
  }

  /**
   * Process a single email to create contact interactions
   */
  private async processEmailForInteractions(
    tenantId: string,
    userId: string,
    email: {
      id: string;
      from: string;
      to: string[];
      cc: string[];
      bcc: string[];
      receivedAt: Date;
      subject: string;
    },
    providerEmails: Set<string>,
  ): Promise<void> {
    const from = email.from.toLowerCase();
    const toAddrs = email.to.map((e) => e.toLowerCase());
    const ccAddrs = email.cc.map((e) => e.toLowerCase());
    const bccAddrs = email.bcc.map((e) => e.toLowerCase());

    // Determine if this is sent or received
    const isSent = providerEmails.has(from);

    // Get the contact email (the other party)
    let contactEmail: string | null = null;
    if (isSent) {
      // We sent this email - contact is in To/Cc/Bcc
      contactEmail = toAddrs[0] || ccAddrs[0] || bccAddrs[0] || null;
    } else {
      // We received this email - contact is the sender
      contactEmail = from;
    }

    if (!contactEmail) return;

    // Find matching contact
    const contact = await this.findContactByEmail(tenantId, contactEmail);
    if (!contact) return;

    // Record the interaction (idempotent via emailId)
    await this.relationshipService.recordEmailInteraction(
      tenantId,
      userId,
      contact.id,
      isSent ? 'EMAIL_SENT' : 'EMAIL_RECEIVED',
      email.receivedAt,
      {
        emailId: email.id,
        summary: email.subject?.slice(0, 200),
        contactEmail,
      },
    );
  }

  /**
   * Find a contact by email address
   */
  private async findContactByEmail(
    tenantId: string,
    email: string,
  ): Promise<{ id: string } | null> {
    // Search in unified contacts using JSON contains (emails array)
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
      },
      select: { id: true, emails: true },
      take: 100, // Reasonable limit
    });

    // Find contact with matching email
    const normalizedEmail = email.toLowerCase();
    for (const contact of contacts) {
      if (this.contactHasEmail(contact.emails, normalizedEmail)) {
        return { id: contact.id };
      }
    }

    return null;
  }

  /**
   * Check if contact has a specific email
   */
  private contactHasEmail(emails: unknown, targetEmail: string): boolean {
    if (!emails || !Array.isArray(emails)) return false;

    return emails.some((e) => {
      if (typeof e === 'object' && e !== null && 'value' in e) {
        return (e as { value: string }).value.toLowerCase() === targetEmail;
      }
      return false;
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.queue) {
      return { enabled: false };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      enabled: true,
      waiting,
      active,
      completed,
      failed,
    };
  }
}
