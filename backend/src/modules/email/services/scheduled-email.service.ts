import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSendService, SendEmailDto } from './email-send.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';

export interface ScheduleEmailDto {
  tenantId: string;
  providerId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
  scheduledAt: Date;
}

@Injectable()
export class ScheduledEmailService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledEmailService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private emailSendService: EmailSendService,
    private scheduledJobsQueue: ScheduledJobsQueueService,
  ) {}

  /**
   * Register handlers for scheduled email jobs with BullMQ
   */
  async onModuleInit() {
    // Register handler for processing scheduled emails (every minute)
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.SCHEDULED_EMAIL_PROCESS,
      async () => this.processScheduledEmails(),
    );

    // Register handler for cleanup (daily at midnight)
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.SCHEDULED_EMAIL_CLEANUP,
      async () => this.cleanupOldScheduledEmails(),
    );

    this.logger.log('ScheduledEmailService registered with BullMQ scheduler');
  }

  /**
   * Schedule an email for later delivery
   */
  async scheduleEmail(data: ScheduleEmailDto): Promise<{ id: string; scheduledAt: Date }> {
    const scheduled = await this.prisma.scheduledEmail.create({
      data: {
        tenantId: data.tenantId,
        providerId: data.providerId,
        to: data.to,
        cc: data.cc || [],
        bcc: data.bcc || [],
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        inReplyTo: data.inReplyTo,
        references: data.references,
        attachments: data.attachments ? JSON.stringify(data.attachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          contentBase64: att.content.toString('base64'),
        }))) : undefined,
        scheduledAt: data.scheduledAt,
        status: 'pending',
      },
    });

    this.logger.log(`Email scheduled for ${data.scheduledAt.toISOString()}: ${scheduled.id}`);

    return {
      id: scheduled.id,
      scheduledAt: scheduled.scheduledAt,
    };
  }

  /**
   * Cancel a scheduled email
   */
  async cancelScheduledEmail(id: string, tenantId: string): Promise<boolean> {
    const email = await this.prisma.scheduledEmail.findFirst({
      where: { id, tenantId, status: 'pending' },
    });

    if (!email) {
      return false;
    }

    await this.prisma.scheduledEmail.delete({
      where: { id },
    });

    this.logger.log(`Scheduled email cancelled: ${id}`);
    return true;
  }

  /**
   * Get all scheduled emails for a tenant
   */
  async getScheduledEmails(tenantId: string): Promise<{
    id: string;
    to: string[];
    subject: string;
    scheduledAt: Date;
    status: string;
  }[]> {
    const emails = await this.prisma.scheduledEmail.findMany({
      where: { tenantId },
      select: {
        id: true,
        to: true,
        subject: true,
        scheduledAt: true,
        status: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return emails;
  }

  /**
   * Process scheduled emails - triggered by BullMQ every minute
   * RACE CONDITION FIX RC-1: Uses atomic claim to prevent duplicate sends
   *
   * The fix uses UPDATE ... WHERE status='pending' RETURNING pattern
   * to atomically claim emails before processing. This prevents multiple
   * instances from claiming the same email.
   */
  async processScheduledEmails(): Promise<void> {
    // Prevent concurrent processing within same instance
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = new Date();

      // RACE CONDITION FIX RC-1: Atomically claim pending emails
      // This UPDATE returns only the rows that were successfully claimed by this instance
      // Other concurrent instances will get different rows (or none if all claimed)
      const claimedEmails = await this.prisma.$queryRaw<Array<{
        id: string;
        tenantId: string;
        providerId: string;
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        bodyHtml: string;
        bodyText: string;
        inReplyTo: string | null;
        references: string | null;
        attachments: unknown;
        retryCount: number;
      }>>`
        UPDATE "scheduled_emails"
        SET "status" = 'processing', "updatedAt" = NOW()
        WHERE "id" IN (
          SELECT "id" FROM "scheduled_emails"
          WHERE "status" = 'pending'
            AND "scheduledAt" <= ${now}
          ORDER BY "scheduledAt" ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "tenantId", "providerId", "to", "cc", "bcc",
                  "subject", "bodyHtml", "bodyText", "inReplyTo",
                  "references", "attachments", "retryCount"
      `;

      if (claimedEmails.length === 0) {
        return;
      }

      this.logger.log(`Processing ${claimedEmails.length} scheduled emails (atomically claimed)`);

      for (const scheduled of claimedEmails) {
        await this.processOneEmail(scheduled);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error processing scheduled emails: ${message}`, stack);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single scheduled email
   */
  private async processOneEmail(scheduled: {
    id: string;
    tenantId: string;
    providerId: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    bodyHtml: string;
    bodyText: string;
    inReplyTo: string | null;
    references: string | null;
    attachments: unknown;
    retryCount: number;
  }): Promise<void> {
    try {
      // Mark as processing
      await this.prisma.scheduledEmail.update({
        where: { id: scheduled.id },
        data: { status: 'processing' },
      });

      // Parse attachments if present (with error handling for malformed JSON)
      let attachments: SendEmailDto['attachments'] = undefined;
      if (scheduled.attachments) {
        try {
          const parsed = JSON.parse(scheduled.attachments as string) as {
            filename: string;
            contentType: string;
            contentBase64: string;
          }[];
          attachments = parsed.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            content: Buffer.from(att.contentBase64, 'base64'),
          }));
        } catch (parseError) {
          this.logger.warn(
            `Invalid attachments JSON for scheduled email ${scheduled.id}: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          );
          // Continue without attachments rather than failing the entire send
          attachments = undefined;
        }
      }

      // Send the email
      await this.emailSendService.sendEmail({
        tenantId: scheduled.tenantId,
        providerId: scheduled.providerId,
        to: scheduled.to,
        cc: scheduled.cc.length > 0 ? scheduled.cc : undefined,
        bcc: scheduled.bcc.length > 0 ? scheduled.bcc : undefined,
        subject: scheduled.subject,
        bodyHtml: scheduled.bodyHtml,
        bodyText: scheduled.bodyText,
        inReplyTo: scheduled.inReplyTo || undefined,
        references: scheduled.references || undefined,
        attachments,
      });

      // Mark as sent
      await this.prisma.scheduledEmail.update({
        where: { id: scheduled.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      this.logger.log(`Scheduled email sent successfully: ${scheduled.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send scheduled email ${scheduled.id}: ${message}`);

      // Update with error and increment retry count
      const newRetryCount = scheduled.retryCount + 1;
      const maxRetries = 3;

      await this.prisma.scheduledEmail.update({
        where: { id: scheduled.id },
        data: {
          status: newRetryCount >= maxRetries ? 'failed' : 'pending',
          errorMessage: message,
          retryCount: newRetryCount,
        },
      });
    }
  }

  /**
   * Clean up old sent/failed scheduled emails - triggered by BullMQ daily at midnight
   * BullMQ guarantees only one instance runs cleanup
   */
  async cleanupOldScheduledEmails(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deleted = await this.prisma.scheduledEmail.deleteMany({
      where: {
        OR: [
          { status: 'sent', sentAt: { lt: thirtyDaysAgo } },
          { status: 'failed', updatedAt: { lt: thirtyDaysAgo } },
        ],
      },
    });

    if (deleted.count > 0) {
      this.logger.log(`Cleaned up ${deleted.count} old scheduled emails`);
    }
  }
}
