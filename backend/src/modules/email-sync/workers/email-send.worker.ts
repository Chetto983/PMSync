/**
 * EmailSendWorker
 *
 * BullMQ worker that processes outbound email jobs.
 * Uses driver abstraction for sending emails through Gmail, Microsoft, and IMAP.
 *
 * CONSOLIDATION DC-2: Now uses EmailDriverFactory instead of inline implementations.
 * This eliminates ~200 lines of duplicated send logic and ensures consistency
 * with the rest of the driver-based architecture.
 *
 * Features:
 * - Unified driver-based send implementation
 * - Draft cleanup after successful send
 * - Delivery status tracking
 * - Rate limiting per provider
 * - Error handling with DLQ integration
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EmailSendJobData,
  EmailSendJobResult,
  EmailSendQueueService,
} from '../services/email-send-queue.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { EmailDriverFactory } from '../drivers/driver.factory';
import { DriverCredentials, IEmailDriver } from '../drivers/interfaces/email-driver.interface';
import { ComposeMessage, AttachmentData, EmailAddress, ProviderType } from '../drivers/interfaces/canonical.types';

@Injectable()
export class EmailSendWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailSendWorker.name);
  private redisConnection: Redis;
  private worker: Worker<EmailSendJobData, EmailSendJobResult>;

  private readonly CONCURRENCY = 3; // Lower concurrency to avoid rate limits

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EmailSendQueueService))
    private readonly queueService: EmailSendQueueService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly cryptoService: CryptoService,
    private readonly driverFactory: EmailDriverFactory,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('EMAIL_SEND_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';

    if (!workersEnabled) {
      this.logger.warn('Email send workers disabled via EMAIL_SEND_WORKERS_ENABLED=false');
      return;
    }

    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.worker = new Worker<EmailSendJobData, EmailSendJobResult>(
      QUEUE_NAMES.EMAIL_SEND,
      async (job: Job<EmailSendJobData>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: this.CONCURRENCY,
        limiter: {
          max: 10, // Max 10 sends per minute per worker
          duration: 60000,
        },
        lockDuration: 120000, // 2 minutes for send operations
        stalledInterval: 60000,
      },
    );

    this.worker.on('completed', (job, result) => {
      this.logger.log(`Email send job ${job.id} completed: messageId=${result.messageId}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Email send job ${job?.id} failed: ${error.message}`);
    });

    this.worker.on('error', (error) => {
      this.logger.error(`Email send worker error: ${error.message}`);
    });

    this.logger.log('Email send worker started');
  }

  private async processJob(job: Job<EmailSendJobData>): Promise<EmailSendJobResult> {
    const startTime = Date.now();
    const { tenantId, providerId, providerType, email, draftId } = job.data;

    this.logger.log(
      `Processing email send: to=${email.to.map((r) => r.email).join(',')} provider=${providerType}`,
    );

    let driver: IEmailDriver | null = null;

    try {
      // Get provider configuration
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      if (provider.tenantId !== tenantId) {
        throw new Error('Provider does not belong to tenant');
      }

      // AUDIT FIX #7: Verify provider type matches job data
      if (provider.providerType !== providerType) {
        throw new Error(
          `Provider type mismatch: job claims '${providerType}' but provider is '${provider.providerType}'`,
        );
      }

      // Build driver credentials and create connected driver
      const credentials = await this.buildDriverCredentials(provider, providerType as ProviderType);
      driver = await this.driverFactory.createConnectedDriver(providerType as ProviderType, credentials);

      // Convert job email data to ComposeMessage format
      const composeMessage = this.convertToComposeMessage(email, provider.email);

      // Send via driver (DC-2: unified send through driver abstraction)
      const messageId = await driver.sendMessage(composeMessage);

      // Clean up draft if this was a draft send
      if (draftId) {
        await this.cleanupDraft(draftId, tenantId);
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(`Email sent successfully: messageId=${messageId} (${durationMs}ms)`);

      return {
        success: true,
        messageId: messageId || undefined,
        threadId: email.threadId,
        sentAt: new Date().toISOString(),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Email send failed: ${errorMessage}`);

      // Check if retryable
      if (this.isRetryableError(error)) {
        throw error; // BullMQ will retry
      }

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    } finally {
      // Disconnect driver to release resources
      if (driver) {
        try {
          await driver.disconnect();
        } catch (err) {
          this.logger.debug(`Driver disconnect error: ${err}`);
        }
      }
    }
  }

  /**
   * Build DriverCredentials from ProviderConfig
   * DC-2 CONSOLIDATION: Centralizes credential building for all provider types
   */
  private async buildDriverCredentials(
    provider: any,
    providerType: ProviderType,
  ): Promise<DriverCredentials> {
    if (providerType === 'google' || providerType === 'microsoft') {
      // OAuth providers: get refreshed access token
      const { accessToken } = await this.providerTokenService.getProviderWithToken(provider.id);

      return {
        type: 'oauth2',
        accessToken,
        refreshToken: provider.refreshToken,
        emailHint: provider.email,
      };
    }

    // IMAP provider: use SMTP credentials
    // BUG FIX B-2 & B-7: Use proper SMTP credential fields from ProviderConfig
    if (!provider.smtpHost) {
      throw new Error(
        `IMAP email sending requires SMTP configuration. ` +
          `Configure SMTP settings (smtpHost, smtpPort) for provider ${provider.email} to enable sending.`,
      );
    }

    if (!provider.smtpPassword || !provider.smtpEncryptionIv) {
      throw new Error(
        `IMAP email sending requires SMTP password. ` +
          `Configure SMTP credentials for provider ${provider.email} to enable sending.`,
      );
    }

    let password: string;
    try {
      password = this.cryptoService.decrypt(provider.smtpPassword, provider.smtpEncryptionIv);
    } catch {
      throw new Error('Failed to decrypt SMTP password for IMAP authentication');
    }

    // BUG FIX B-7: Use smtpUsername if available, fallback to provider.email
    const username = provider.smtpUsername || provider.email;

    return {
      type: 'basic',
      username,
      password,
      imapHost: provider.imapHost || provider.smtpHost.replace('smtp.', 'imap.'),
      imapPort: provider.imapPort || 993,
      imapTls: provider.imapUseTls !== false,
      smtpHost: provider.smtpHost,
      smtpPort: provider.smtpPort || 587,
      smtpTls: provider.smtpUseTls !== false,
    };
  }

  /**
   * Convert EmailSendJobData email to ComposeMessage format
   * DC-2 CONSOLIDATION: Single conversion point for driver compatibility
   */
  private convertToComposeMessage(
    email: EmailSendJobData['email'],
    fromEmail: string,
  ): ComposeMessage {
    // Convert EmailRecipient[] to EmailAddress[]
    const toEmailAddress = (recipients: Array<{ email: string; name?: string }> | undefined): EmailAddress[] => {
      if (!recipients) return [];
      return recipients.map((r) => ({ email: r.email, name: r.name }));
    };

    // Convert attachments to AttachmentData format
    const attachments: AttachmentData[] | undefined = email.attachments?.map((att) => ({
      id: att.attachmentId || `att-${Date.now()}`,
      filename: att.filename,
      mimeType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      isInline: false,
      content: att.content || '',
    }));

    return {
      to: toEmailAddress(email.to),
      cc: toEmailAddress(email.cc),
      bcc: toEmailAddress(email.bcc),
      subject: email.subject,
      bodyHtml: email.bodyHtml || email.bodyText || '',
      bodyText: email.bodyText,
      attachments,
      inReplyTo: email.inReplyTo,
      threadId: email.threadId,
      fromEmail,
    };
  }

  private async cleanupDraft(draftId: string, tenantId: string): Promise<void> {
    try {
      await this.prisma.email.updateMany({
        where: {
          id: draftId,
          tenantId,
          isDraft: true,
        },
        data: {
          isDraft: false,
        },
      });
      this.logger.debug(`Cleaned up draft ${draftId}`);
    } catch (error) {
      this.logger.warn(`Failed to cleanup draft ${draftId}: ${error}`);
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('timeout') ||
        message.includes('econnreset')
      );
    }
    return false;
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down email send worker (graceful drain)...');

    try {
      if (this.worker) {
        this.logger.log('Email send worker closing, waiting for in-flight jobs...');
        await this.worker.close();
      }

      if (this.redisConnection && this.redisConnection.status !== 'end') {
        await this.redisConnection.quit();
      }
    } catch (error) {
      this.logger.warn(
        `Email send worker shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    }

    this.logger.log('Email send worker stopped');
  }
}
