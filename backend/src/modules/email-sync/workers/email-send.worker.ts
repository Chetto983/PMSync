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
import * as nodemailer from 'nodemailer';
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
import { CryptoService } from '../../../common/services/crypto.service';
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
    private readonly cryptoService: CryptoService,
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

      // AUDIT FIX #7: Verify provider type matches job data
      // This prevents a malicious or corrupted job from operating on wrong provider type
      if (provider.providerType !== providerType) {
        throw new Error(
          `Provider type mismatch: job claims '${providerType}' but provider is '${provider.providerType}'`,
        );
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

  /**
   * Send email via Microsoft Graph API
   * AUDIT FIX #3: Now includes attachments support
   */
  private async sendViaMicrosoft(
    provider: any,
    accessToken: string,
    email: EmailSendJobData['email'],
  ): Promise<{ messageId?: string; threadId?: string }> {
    // Build message payload
    const message: any = {
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
    };

    // Handle reply thread
    if (email.inReplyTo) {
      message.conversationId = email.threadId;
    }

    // AUDIT FIX #3: Add attachments to the message
    // Microsoft Graph API supports file attachments up to 3MB inline
    // For larger files, we'd need to use upload sessions
    if (email.attachments && email.attachments.length > 0) {
      message.attachments = email.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        contentBytes: att.content, // Already base64 encoded
      }));
    }

    const messagePayload = {
      message,
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
    // BUG FIX B-2 & B-7: Use proper SMTP credential fields from ProviderConfig schema
    // Not accessToken (OAuth) or metadata, but smtpHost/smtpPort/smtpPassword/smtpUsername
    const smtpHost = provider.smtpHost;
    const smtpPort = provider.smtpPort || 587;
    const smtpSecure = provider.smtpUseTls !== false;

    if (!smtpHost) {
      throw new Error(
        `IMAP email sending requires SMTP configuration. ` +
          `Configure SMTP settings (smtpHost, smtpPort) for provider ${provider.email} to enable sending.`,
      );
    }

    // BUG FIX B-2: Decrypt smtpPassword (not accessToken) for IMAP SMTP auth
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
    const smtpUsername = provider.smtpUsername || provider.email;

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUsername,
        pass: password,
      },
      // Connection timeout settings
      connectionTimeout: 30000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
    });

    // Build mail options
    const mailOptions: nodemailer.SendMailOptions = {
      from: provider.email,
      to: email.to.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', '),
      subject: email.subject,
      text: email.bodyText,
      html: email.bodyHtml,
    };

    // Add CC if present
    if (email.cc?.length) {
      mailOptions.cc = email.cc.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ');
    }

    // Add BCC if present
    if (email.bcc?.length) {
      mailOptions.bcc = email.bcc.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ');
    }

    // Add reply headers if replying
    if (email.inReplyTo) {
      mailOptions.inReplyTo = email.inReplyTo;
      mailOptions.references = email.inReplyTo;
    }

    // Add attachments if present
    if (email.attachments?.length) {
      mailOptions.attachments = email.attachments.map((att) => ({
        filename: att.filename,
        content: att.content ? Buffer.from(att.content, 'base64') : undefined,
        contentType: att.contentType,
      }));
    }

    // Send email
    const result = await transporter.sendMail(mailOptions);

    this.logger.log(`IMAP/SMTP email sent: messageId=${result.messageId}`);

    return {
      messageId: result.messageId || undefined,
      threadId: email.threadId,
    };
  }

  /**
   * Build RFC 2822 compliant message for Gmail API
   * AUDIT FIX #3: Now includes BCC header and attachment support
   */
  private buildRfc2822Message(from: string, email: EmailSendJobData['email']): string {
    const lines: string[] = [];
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const hasAttachments = email.attachments && email.attachments.length > 0;

    // Headers
    lines.push(`From: ${from}`);
    lines.push(`To: ${email.to.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ')}`);

    if (email.cc?.length) {
      lines.push(`Cc: ${email.cc.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ')}`);
    }

    // AUDIT FIX #3: Add BCC header (was missing!)
    if (email.bcc?.length) {
      lines.push(`Bcc: ${email.bcc.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ')}`);
    }

    lines.push(`Subject: ${this.encodeRfc2047(email.subject)}`);
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

    // AUDIT FIX #3: Handle attachments with multipart MIME
    if (hasAttachments) {
      lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      lines.push('');

      // Body part
      lines.push(`--${boundary}`);
      if (email.bodyHtml) {
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(email.bodyHtml);
      } else {
        lines.push('Content-Type: text/plain; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(email.bodyText || '');
      }

      // Attachment parts
      for (const att of email.attachments!) {
        lines.push(`--${boundary}`);
        lines.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
        lines.push('');
        // Split base64 content into 76-char lines per RFC 2045
        if (att.content) {
          const base64Content = att.content;
          for (let i = 0; i < base64Content.length; i += 76) {
            lines.push(base64Content.substring(i, i + 76));
          }
        }
      }

      // End boundary
      lines.push(`--${boundary}--`);
    } else {
      // Simple message without attachments
      if (email.bodyHtml) {
        lines.push('Content-Type: text/html; charset=utf-8');
      } else {
        lines.push('Content-Type: text/plain; charset=utf-8');
      }

      // Empty line before body
      lines.push('');

      // Body
      lines.push(email.bodyHtml || email.bodyText || '');
    }

    return lines.join('\r\n');
  }

  /**
   * Encode string using RFC 2047 if it contains non-ASCII characters
   */
  private encodeRfc2047(text: string): string {
    if (!/[^\x00-\x7F]/.test(text)) {
      return text;
    }
    return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`;
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
    this.logger.log('Shutting down email send worker (graceful drain)...');

    try {
      if (this.worker) {
        // Graceful shutdown: close with drain (waits for active jobs)
        // BullMQ worker.close() already waits for running jobs by default
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
