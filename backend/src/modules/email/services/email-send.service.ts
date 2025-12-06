import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProviderConfig } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { AttachmentStorageService } from './attachment.storage';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { ProviderFactory } from '../../providers/factory/provider.factory';
import type { ProviderConfig as ProviderConfigType } from '../../providers/interfaces/email-provider.interface';
import type { SendEmailData } from '../../providers/interfaces/email-provider.interface';

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
  ) {}

  /**
   * Schedule email for later (called when scheduledAt is provided)
   */
  async scheduleEmail(data: SendEmailDto): Promise<{ id: string; scheduledAt: Date }> {
    if (!data.scheduledAt) {
      throw new BadRequestException('scheduledAt is required for scheduling');
    }

    const scheduledAt = new Date(data.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    const provider = await this.getActiveEmailProvider(data.tenantId, data.providerId);

    const scheduled = await this.prisma.scheduledEmail.create({
      data: {
        tenantId: data.tenantId,
        providerId: provider.id,
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
        scheduledAt,
        status: 'pending',
      },
    });

    this.logger.log(`Email scheduled for ${scheduledAt.toISOString()}: ${scheduled.id}`);

    return {
      id: scheduled.id,
      scheduledAt: scheduled.scheduledAt,
    };
  }

  /**
   * Send email via Provider Factory (Zero-inspired pattern)
   */
  async sendEmail(data: SendEmailDto): Promise<{ success: boolean; messageId: string }> {
    const provider = await this.getActiveEmailProvider(data.tenantId, data.providerId);

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

      // Create provider factory config (Zero createDriver pattern)
      // For IMAP/generic providers, include SMTP configuration in metadata
      const isImapProvider = provider.providerType === 'imap' || provider.providerType === 'generic';

      // For IMAP providers, use SMTP password (falls back to IMAP password)
      const accessToken = isImapProvider
        ? await this.getSmtpPassword(provider)
        : await this.getAccessToken(provider);

      const providerConfig: ProviderConfigType = {
        userId: data.tenantId,
        providerId: provider.id,
        providerType: provider.providerType as 'google' | 'microsoft' | 'imap',
        email: provider.email,
        accessToken,
        refreshToken: '', // Token refresh is delegated to OAuth service layer
        ...(isImapProvider && {
          metadata: {
            imapHost: provider.imapHost,
            imapPort: provider.imapPort,
            imapSecure: provider.imapUseTls,
            smtpHost: provider.smtpHost,
            smtpPort: provider.smtpPort,
            smtpSecure: provider.smtpUseTls,
          },
        }),
      };

      // Use Provider Factory to create provider instance
      const emailProvider = ProviderFactory.create(provider.providerType, providerConfig);

      // Prepare data for provider interface
      const sendData: SendEmailData = {
        to: data.to.map(email => ({ email })),
        cc: data.cc?.map(email => ({ email })),
        bcc: data.bcc?.map(email => ({ email })),
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        attachments: uploadedAttachments.map(att => ({
          id: '', // Will be generated
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          data: att.storagePath, // Send storage path instead of buffer
        })),
      };

      if (data.inReplyTo) {
        sendData.inReplyTo = data.inReplyTo;
        sendData.references = data.references;
      }

      // Send via provider interface
      const result = await emailProvider.sendEmail(sendData);

      this.logger.log(`Email sent successfully via ${provider.providerType}: ${result.id}`);

      // Save to database
      await this.saveSentEmail(data, result.id, provider.id, uploadedAttachments);

      return { success: true, messageId: result.id };
    } catch (error) /* istanbul ignore next */ {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to send email via ${provider.providerType}: ${message}`, stack);
      throw new BadRequestException(`Failed to send email: ${message}`);
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
    // Fall back to IMAP password
    if (provider.imapPassword && provider.imapEncryptionIv) {
      return this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
    }
    return '';
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
