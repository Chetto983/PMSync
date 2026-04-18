import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailService } from '../../../email/services/email.service';
import {
  getSharedRedisConnection,
  getSharedWorkerConnection,
  releaseSharedRedisConnection,
  releaseSharedWorkerConnection,
  scaleForReplicas,
} from '../../../../common/config/queue.config';
import { getConfiguration } from '../../../../config/configuration';

/** Default delay before sending CSAT email: 1 hour (ms) */
const CSAT_DELAY_MS = 60 * 60 * 1000;
const QUEUE_NAME = 'csat-email';

interface CsatJobData {
  ticketId: string;
  tenantId: string;
}

/**
 * CSAT Email Service
 *
 * When a ticket is resolved, schedules a delayed BullMQ job.
 * When the job fires, it creates a CSATSurvey record and sends
 * a survey email via SendGrid to the ticket's contact or senderEmail.
 */
@Injectable()
export class CsatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CsatService.name);
  private queue: Queue<CsatJobData> | null = null;
  private worker: Worker<CsatJobData> | null = null;
  private redisConnection: Redis | null = null;
  private workerConnection: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // D-12: CRM module-level worker toggle. When CRM_WORKERS_ENABLED=false
    // this instance serves HTTP only and does not consume CSAT survey jobs.
    const crmWorkersEnabled =
      this.configService.get<string>('CRM_WORKERS_ENABLED') || 'true';
    if (crmWorkersEnabled.toLowerCase() === 'false') {
      this.logger.warn('CSAT workers disabled (CRM_WORKERS_ENABLED=false)');
      return;
    }

    // D-01: use shared producer connection
    this.redisConnection = getSharedRedisConnection();

    this.queue = new Queue<CsatJobData>(QUEUE_NAME, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      },
    });

    // D-01/D-02: use shared worker connection
    this.workerConnection = getSharedWorkerConnection();
    this.worker = new Worker<CsatJobData>(
      QUEUE_NAME,
      (job) => this.processCsatJob(job),
      {
        connection: this.workerConnection,
        concurrency: scaleForReplicas(3),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`CSAT job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('CSAT email service initialized');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    // D-01: release ref-counted shared connections instead of .quit().
    // Guards handle CRM_WORKERS_ENABLED=false early return (no ref acquired).
    if (this.redisConnection) {
      releaseSharedRedisConnection();
      this.redisConnection = null;
    }
    if (this.workerConnection) {
      releaseSharedWorkerConnection();
      this.workerConnection = null;
    }
  }

  /**
   * Schedule a CSAT survey email for a resolved ticket.
   * Skips if a survey already exists for this ticket.
   */
  async scheduleForTicket(ticketId: string, tenantId: string): Promise<void> {
    // Don't send duplicate surveys
    const existing = await this.prisma.cSATSurvey.findUnique({
      where: { ticketId },
    });
    if (existing) {
      this.logger.debug(`CSAT survey already exists for ticket ${ticketId}`);
      return;
    }

    // D-12: queue is null when CRM_WORKERS_ENABLED=false
    if (!this.queue) {
      this.logger.debug(
        `CSAT queue unavailable (CRM workers disabled) — skipping schedule for ticket ${ticketId}`,
      );
      return;
    }

    await this.queue.add(
      'send-csat',
      { ticketId, tenantId },
      {
        delay: CSAT_DELAY_MS,
        jobId: `csat-${ticketId}`,
      },
    );

    this.logger.log(
      `CSAT email scheduled for ticket ${ticketId} (delay: ${CSAT_DELAY_MS / 60_000}min)`,
    );
  }

  /**
   * Cancel a pending CSAT job (e.g. if ticket is reopened before job fires).
   */
  async cancelForTicket(ticketId: string): Promise<void> {
    if (!this.queue) return; // D-12: queue not initialized (CRM workers disabled)
    const jobId = `csat-${ticketId}`;
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.debug(`CSAT job cancelled for ticket ${ticketId}`);
    }
  }

  private async processCsatJob(job: Job<CsatJobData>): Promise<void> {
    const { ticketId, tenantId } = job.data;

    // Re-read ticket — may have been reopened since job was scheduled
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        contact: { select: { emails: true, firstName: true } },
      },
    });

    if (!ticket) {
      this.logger.warn(`Ticket ${ticketId} not found — skipping CSAT`);
      return;
    }

    // Only send if ticket is still resolved or closed
    if (!['resolved', 'closed'].includes(ticket.status)) {
      this.logger.debug(
        `Ticket ${ticketId} status is "${ticket.status}" — skipping CSAT`,
      );
      return;
    }

    // Extract primary email from contact's JSON emails field
    let contactEmail: string | null = null;
    if (ticket.contact?.emails) {
      const emails = ticket.contact.emails as Array<{ value?: string }>;
      contactEmail = emails[0]?.value ?? null;
    }

    // Determine recipient: contact email > portal senderEmail > skip
    const recipientEmail = contactEmail ?? ticket.senderEmail ?? null;

    if (!recipientEmail) {
      this.logger.warn(
        `Ticket ${ticketId} has no contact/sender email — skipping CSAT`,
      );
      return;
    }

    // Create survey record
    const token = nanoid(21);
    await this.prisma.cSATSurvey.create({
      data: {
        tenantId,
        ticketId,
        token,
      },
    });

    // Build survey URL
    const config = getConfiguration();
    const surveyUrl = `${config.frontendUrl}/portal/survey/${token}`;
    const contactName = ticket.contact?.firstName ?? '';

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>How was your support experience?</h2>
          ${contactName ? `<p>Hi ${contactName},</p>` : ''}
          <p>Your support request <strong>"${ticket.subject}"</strong> has been resolved.</p>
          <p>We'd love to hear your feedback. Please take a moment to rate your experience:</p>
          <a href="${surveyUrl}" style="background-color: #0097a7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px;">
            Rate Your Experience
          </a>
          <p style="margin-top: 16px; color: #666; font-size: 13px;">
            Or copy and paste this link: ${surveyUrl}
          </p>
        </body>
      </html>
    `;

    await this.emailService.sendEmail(
      recipientEmail,
      `How was your support? — "${ticket.subject}"`,
      html,
    );

    this.logger.log(
      `CSAT email sent to ${recipientEmail} for ticket ${ticketId}`,
    );
  }
}
