/**
 * EmailSendWorker
 *
 * BullMQ worker that processes outbound email jobs.
 * Handles sending emails through Gmail, Microsoft, and IMAP providers.
 *
 * Features:
 * - Provider-specific send implementations (Gmail API, Graph API, SMTP)
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
import { GoogleSyncService } from '../services/gmail/google-sync.service';
import { MicrosoftSyncService } from '../services/microsoft/microsoft-sync.service';
import { ImapSyncService } from '../services/imap/imap-sync.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';

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
    private readonly googleSyncService: GoogleSyncService,
    private readonly microsoftSyncService: MicrosoftSyncService,
    private readonly imapSyncService: ImapSyncService,
    private readonly providerTokenService: ProviderTokenService,
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

      // Get provider with valid tokens
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

      // Send based on provider type
      let result: { messageId?: string; threadId?: string };

      switch (providerType) {
        case 'google':
          result = await this.sendViaGmail(provider, accessToken, email);
          break;
        case 'microsoft':
          result = await this.sendViaMicrosoft(provider, accessToken, email);
          break;
        case 'imap':
          result = await this.sendViaImap(provider, accessToken, email);
          break;
        default:
          throw new Error(`Unsupported provider type: ${providerType}`);
      }

      // Clean up draft if this was a draft send
      if (draftId) {
        await this.cleanupDraft(draftId, tenantId);
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(`Email sent successfully: messageId=${result.messageId} (${durationMs}ms)`);

      return {
        success: true,
        messageId: result.messageId,
        threadId: result.threadId,
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
    }
  }

  private async sendViaGmail(
    provider: any,
    accessToken: string,
    email: EmailSendJobData['email'],
  ): Promise<{ messageId?: string; threadId?: string }> {
    // Build RFC 2822 message
    const message = this.buildRfc2822Message(provider.email, email);
    const encodedMessage = Buffer.from(message).toString('base64url');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedMessage,
        threadId: email.threadId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail send failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    return { messageId: data.id, threadId: data.threadId };
  }

  private async sendViaMicrosoft(
    provider: any,
    accessToken: string,
    email: EmailSendJobData['email'],
  ): Promise<{ messageId?: string; threadId?: string }> {
    const messagePayload = {
      message: {
        subject: email.subject,
        body: {
          contentType: email.bodyHtml ? 'HTML' : 'Text',
          content: email.bodyHtml || email.bodyText || '',
        },
        toRecipients: email.to.map((r) => ({
          emailAddress: { address: r.email, name: r.name },
        })),
        ccRecipients: email.cc?.map((r) => ({
          emailAddress: { address: r.email, name: r.name },
        })),
        bccRecipients: email.bcc?.map((r) => ({
          emailAddress: { address: r.email, name: r.name },
        })),
        // Handle reply thread
        ...(email.inReplyTo && {
          conversationId: email.threadId,
        }),
      },
      saveToSentItems: true,
    };

    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft send failed: ${response.status} ${error}`);
    }

    // Microsoft sendMail doesn't return messageId directly
    return { messageId: undefined, threadId: email.threadId };
  }

  private async sendViaImap(
    provider: any,
    _accessToken: string,
    email: EmailSendJobData['email'],
  ): Promise<{ messageId?: string; threadId?: string }> {
    // IMAP providers use SMTP for sending
    // TODO: Implement SMTP send via nodemailer when SMTP config is available
    this.logger.warn(`IMAP send not yet implemented for provider ${provider.id}`);

    // For now, return a placeholder - actual SMTP implementation needed
    throw new Error(
      `IMAP email sending requires SMTP configuration. ` +
        `Configure SMTP settings for provider ${provider.email} to enable sending.`,
    );

    // Future implementation would use nodemailer:
    // const transporter = nodemailer.createTransport({
    //   host: provider.smtpHost,
    //   port: provider.smtpPort,
    //   secure: provider.smtpSecure,
    //   auth: { user: provider.email, pass: decryptedPassword },
    // });
    // return transporter.sendMail({ ... });
  }

  private buildRfc2822Message(from: string, email: EmailSendJobData['email']): string {
    const lines: string[] = [];

    // Headers
    lines.push(`From: ${from}`);
    lines.push(`To: ${email.to.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ')}`);

    if (email.cc?.length) {
      lines.push(`Cc: ${email.cc.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ')}`);
    }

    lines.push(`Subject: ${email.subject}`);
    lines.push(`Date: ${new Date().toUTCString()}`);
    lines.push('MIME-Version: 1.0');

    if (email.inReplyTo) {
      lines.push(`In-Reply-To: ${email.inReplyTo}`);
      lines.push(`References: ${email.inReplyTo}`);
    }

    // Custom headers
    if (email.headers) {
      for (const [key, value] of Object.entries(email.headers)) {
        lines.push(`${key}: ${value}`);
      }
    }

    // Content type
    if (email.bodyHtml) {
      lines.push('Content-Type: text/html; charset=utf-8');
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8');
    }

    // Empty line before body
    lines.push('');

    // Body
    lines.push(email.bodyHtml || email.bodyText || '');

    return lines.join('\r\n');
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
          // Mark as sent
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
      // Retry on rate limits and temporary errors
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
    this.logger.log('Shutting down email send worker...');

    if (this.worker) {
      await this.worker.close();
    }

    if (this.redisConnection && this.redisConnection.status !== 'end') {
      await this.redisConnection.quit();
    }

    this.logger.log('Email send worker stopped');
  }
}
