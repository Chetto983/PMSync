import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ProviderConfig } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { AttachmentStorageService } from './attachment.storage';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { EmailSendQueueService } from '../../email-sync/services/email-send-queue.service';
import { EmailDriverFactory } from '../../email-sync/drivers/driver.factory';
import type { ComposeMessage } from '../../email-sync/drivers/interfaces/canonical.types';
import type { DriverCredentials } from '../../email-sync/drivers/interfaces/email-driver.interface';

export interface SendEmailDto {
  tenantId: string;
  providerId: string;
  threadId?: string;
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
  /** Optional scheduled send time (ISO string) - if set, email will be queued for later */
  scheduledAt?: string;
}

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private attachmentStorage: AttachmentStorageService,
    private providerTokenService: ProviderTokenService,
    @Inject(forwardRef(() => EmailSendQueueService))
    private emailSendQueue: EmailSendQueueService,
    private driverFactory: EmailDriverFactory,
  ) {}

  /**
   * Queue email for async sending via BullMQ worker.
   * Use this for non-blocking sends where you don't need immediate feedback.
   *
   * @returns Job ID for tracking send status
   */
  async queueSend(data: SendEmailDto): Promise<{ jobId: string }> {
    const provider = await this.getActiveEmailProvider(data.tenantId, data.providerId);
    const providerType = provider.providerType === 'generic' ? 'imap' : provider.providerType;

    // Convert attachments to base64 for queue serialization
    const attachmentsForQueue = data.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content.toString('base64'),
      contentType: att.contentType,
      size: att.content.length,
    }));

    const jobId = await this.emailSendQueue.enqueueSend({
      tenantId: data.tenantId,
      providerId: provider.id,
      providerType: providerType as 'google' | 'microsoft' | 'imap',
      email: {
        to: data.to.map((email) => ({ email })),
        cc: data.cc?.map((email) => ({ email })),
        bcc: data.bcc?.map((email) => ({ email })),
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        attachments: attachmentsForQueue,
        inReplyTo: data.inReplyTo,
        threadId: data.threadId,
      },
      priority: 'high',
      requestedAt: new Date().toISOString(),
    });

    this.logger.log(`Email queued for async send: ${jobId}`);

    return { jobId };
  }

  /**
   * Get status of a queued email send job.
   */
  async getQueuedSendStatus(jobId: string): Promise<{
    state: string;
    result?: { success: boolean; messageId?: string; error?: string };
  } | null> {
    return this.emailSendQueue.getJobStatus(jobId);
  }

  /**
   * Send email via Email Driver Factory (Driver-only pattern)
   */
  async sendEmail(data: SendEmailDto): Promise<{ success: boolean; messageId: string }> {
    const provider = await this.getActiveEmailProvider(data.tenantId, data.providerId);
    const providerType = provider.providerType === 'generic' ? 'imap' : provider.providerType;

    type ConnectedDriver = Awaited<ReturnType<EmailDriverFactory['createConnectedDriver']>>;
    let driver: ConnectedDriver | null = null;

    try {
      // Process attachments first
      const uploadedAttachments =
        data.attachments && data.attachments.length > 0
          ? await Promise.all(
              data.attachments.map((att) =>
                this.attachmentStorage.uploadAttachment(data.tenantId, provider.id, {
                  filename: att.filename,
                  content: att.content,
                  contentType: att.contentType,
                }),
              ),
            )
          : [];

      // Get access token (SMTP password for IMAP, OAuth token for others)
      const isImapProvider = providerType === 'imap';
      const accessToken = isImapProvider
        ? await this.getSmtpPassword(provider)
        : await this.getAccessToken(provider);

      // Create driver credentials
      const credentials: DriverCredentials = isImapProvider
        ? {
            type: 'basic',
            username: provider.email,
            password: accessToken,
            imapHost: provider.imapHost || undefined,
            imapPort: provider.imapPort || undefined,
            imapTls: provider.imapUseTls ?? true,
            smtpHost: provider.smtpHost || undefined,
            smtpPort: provider.smtpPort || undefined,
            smtpTls: provider.smtpUseTls ?? true,
          }
        : {
            type: 'oauth2',
            accessToken,
            emailHint: provider.email,
          };

      // Create connected driver
      driver = await this.driverFactory.createConnectedDriver(
        providerType as 'google' | 'microsoft' | 'imap',
        credentials,
      );

      // Prepare compose message for driver
      // BUG FIX B-1: Drivers expect base64 content, not storage path
      // Use original attachment Buffers converted to base64
      const composeMessage: ComposeMessage = {
        to: data.to.map(email => ({ email, name: '' })),
        cc: data.cc?.map(email => ({ email, name: '' })),
        bcc: data.bcc?.map(email => ({ email, name: '' })),
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        attachments: data.attachments?.map((att, index) => ({
          id: `att-${index}-${Date.now()}`,
          filename: att.filename,
          mimeType: att.contentType,
          size: att.content.byteLength,
          isInline: false,
          content: att.content.toString('base64'), // Driver expects base64 content
        })),
      };

      if (data.inReplyTo) {
        composeMessage.inReplyTo = data.inReplyTo;
        composeMessage.references = data.references;
      }

      // Send via driver interface
      const messageId = await driver.sendMessage(composeMessage);

      this.logger.log(`Email sent successfully via ${provider.providerType}: ${messageId}`);

      // Save to database
      await this.saveSentEmail(data, messageId, provider.id, uploadedAttachments);

      return { success: true, messageId };
    } catch (error) /* istanbul ignore next */ {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to send email via ${provider.providerType}: ${message}`, stack);
      throw new BadRequestException(`Failed to send email: ${message}`);
    } finally {
      if (driver) {
        try {
          await driver.disconnect();
        } catch (disconnectError) {
          this.logger.warn(
            `Failed to disconnect email driver for ${provider.providerType}: ${
              disconnectError instanceof Error ? disconnectError.message : String(disconnectError)
            }`,
          );
        }
      }
    }
  }



  /**
   * Save sent email to database
   */
  private async saveSentEmail(
    data: SendEmailDto,
    messageId: string,
    providerId: string,
    uploadedAttachments: {
      storageType: 's3';
      storagePath: string;
      contentHash: string;
      dedupHit: boolean;
      size: number;
      mimeType: string;
      filename: string;
    }[],
  ) {
    // Get the actual sent folder name for this provider
    const sentFolder = await this.getSentFolderName(providerId);

    await this.prisma.email.create({
      data: {
        tenantId: data.tenantId,
        providerId,
        externalId: messageId,
        threadId: data.threadId,
        messageId,
        from: '', // Will be filled in by next sync
        to: data.to,
        cc: data.cc || [],
        bcc: data.bcc || [],
        subject: data.subject,
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        folder: sentFolder,
        labels: [],
        isRead: true,
        isStarred: false,
        isFlagged: false,
        isDraft: false,
        isDeleted: false,
        sentAt: new Date(),
        receivedAt: new Date(),
        inReplyTo: data.inReplyTo,
        references: data.references,
        attachments:
          uploadedAttachments.length > 0
            ? {
                create: uploadedAttachments.map((att) => ({
                  filename: att.filename,
                  mimeType: att.mimeType,
                  size: att.size,
                  storageType: att.storageType,
                  storagePath: att.storagePath,
                  contentHash: att.contentHash,
                  isInline: false,
                })),
              }
            : undefined,
      },
    });
  }

  /**
   * Get decrypted access token from provider
   */
  private async getAccessToken(provider: ProviderConfig): Promise<string> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(provider.id);
    return accessToken;
  }

  /**
   * Get decrypted SMTP password for IMAP/generic providers
   * Falls back to IMAP password if SMTP password not set
   */
  private async getSmtpPassword(provider: ProviderConfig): Promise<string> {
    // Try SMTP password first
    if (provider.smtpPassword && provider.smtpEncryptionIv) {
      return this.crypto.decrypt(provider.smtpPassword, provider.smtpEncryptionIv);
    }
    // Fall back to IMAP password (common for same-server setups)
    if (provider.imapPassword && provider.imapEncryptionIv) {
      return this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
    }
    // CRITICAL FIX (BUG-002): Throw descriptive error instead of empty string
    throw new BadRequestException(
      `SMTP password not configured for provider ${provider.id}. ` +
        'Please update provider settings with SMTP credentials.',
    );
  }

  /**
   * Ensure provider belongs to tenant, is active, and supports email.
   */
  private async getActiveEmailProvider(tenantId: string, providerId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
        isActive: true,
        supportsEmail: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or inactive');
    }

    return provider;
  }

  /**
   * Get the actual sent folder path for a provider
   * Returns the real folder path from the provider (e.g., 'Posta Inviata', 'Sent Items')
   * using RFC 6154 specialUse attribute instead of hardcoded folder names
   */
  private async getSentFolderName(providerId: string): Promise<string> {
    // Look up the sent folder by specialUse attribute (RFC 6154)
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        specialUse: { equals: 'SENT', mode: 'insensitive' },
      },
      select: { path: true, name: true },
    });

    // Return actual folder path, or fallback to 'SENT' for providers that use standard names (Gmail)
    return folder?.path || folder?.name || 'SENT';
  }

  /**
   * Reply to an email
   */
  async replyToEmail(
    emailId: string,
    tenantId: string,
    data: Omit<SendEmailDto, 'tenantId' | 'providerId' | 'inReplyTo' | 'references'>,
  ): Promise<{ success: boolean; messageId: string }> {
    const originalEmail = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
    });

    if (!originalEmail) {
      throw new NotFoundException('Original email not found');
    }

    // Build references chain
    const references = originalEmail.references
      ? `${originalEmail.references} ${originalEmail.messageId}`
      : originalEmail.messageId || '';

    return this.sendEmail({
      ...data,
      tenantId,
      providerId: originalEmail.providerId,
      threadId: originalEmail.threadId ?? undefined,
      inReplyTo: originalEmail.messageId || undefined,
      references,
    });
  }

  /**
   * Forward an email
   */
  async forwardEmail(
    emailId: string,
    tenantId: string,
    data: Omit<SendEmailDto, 'tenantId' | 'providerId' | 'subject' | 'bodyHtml' | 'bodyText'>,
  ): Promise<{ success: boolean; messageId: string }> {
    const originalEmail = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
    });

    if (!originalEmail) {
      throw new NotFoundException('Original email not found');
    }

    // Prepare forwarded content
    const subject = originalEmail.subject.startsWith('Fwd:')
      ? originalEmail.subject
      : `Fwd: ${originalEmail.subject}`;

    const bodyHtml = `
      <p><br></p>
      <p>---------- Forwarded message ---------</p>
      <p><strong>From:</strong> ${originalEmail.from}</p>
      <p><strong>Date:</strong> ${originalEmail.sentAt.toLocaleString()}</p>
      <p><strong>Subject:</strong> ${originalEmail.subject}</p>
      <p><strong>To:</strong> ${originalEmail.to.join(', ')}</p>
      <p><br></p>
      ${originalEmail.bodyHtml || ''}
    `;

    const bodyText = `
---------- Forwarded message ---------
From: ${originalEmail.from}
Date: ${originalEmail.sentAt.toLocaleString()}
Subject: ${originalEmail.subject}
To: ${originalEmail.to.join(', ')}

${originalEmail.bodyText || ''}
    `;

    return this.sendEmail({
      ...data,
      tenantId,
      providerId: originalEmail.providerId,
      threadId: originalEmail.threadId ?? undefined,
      subject,
      bodyHtml,
      bodyText,
    });
  }
}
