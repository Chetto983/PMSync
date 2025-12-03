import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';

/**
 * Attachment metadata from Gmail message
 */
export interface GmailAttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  contentId?: string;
  isInline: boolean;
}

/**
 * Gmail-specific attachment handler
 * Handles downloading and processing Gmail attachments with intelligent strategy
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class GmailAttachmentHandler {
  private readonly logger = new Logger(GmailAttachmentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: AttachmentStorageService,
  ) {}

  /**
   * Download attachment data from Gmail API
   *
   * @param gmail - Gmail API client
   * @param messageId - Gmail message ID
   * @param attachmentId - Gmail attachment ID
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadGmailAttachment(
    gmail: gmail_v1.Gmail,
    messageId: string,
    attachmentId: string,
  ): Promise<Buffer | null> {
    try {
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      if (!response.data.data) {
        return null;
      }

      // Gmail returns base64url-encoded data, need to convert to Buffer
      return Buffer.from(response.data.data, 'base64');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${attachmentId} for message ${messageId}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Process and store attachments for an email using intelligent strategy:
   * - Inline images: skip (already in HTML)
   * - Small documents (<5MB): download + store + queue for embeddings
   * - Everything else: metadata-only (on-demand download)
   *
   * @param gmail - Gmail API client
   * @param emailId - Internal email ID (database)
   * @param externalId - Gmail message ID
   * @param attachments - Attachment metadata from Gmail
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async processEmailAttachments(
    gmail: gmail_v1.Gmail,
    emailId: string,
    externalId: string,
    attachments: GmailAttachmentMeta[],
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    if (!attachments.length) {
      return;
    }

    try {
      // Delete existing attachments for this email (in case of re-sync)
      await this.prisma.emailAttachment.deleteMany({
        where: { emailId },
      });

      // Process each attachment with intelligent strategy
      for (const attachment of attachments) {
        try {
          // Convert to provider-agnostic metadata
          const metadata = {
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            size: attachment.size,
            isInline: attachment.isInline,
            contentId: attachment.contentId,
            externalId: attachment.attachmentId,
            externalMessageId: externalId,
          };

          // Determine processing strategy
          const strategy = this.attachmentStorage.getProcessingStrategy(metadata);

          if (strategy === 'skip') {
            this.logger.debug(
              `Skipping inline image ${attachment.filename} for email ${emailId}`,
            );
            continue;
          }

          if (strategy === 'embeddings') {
            // Small document: download + store + queue for embeddings
            const data = await this.downloadGmailAttachment(
              gmail,
              externalId,
              attachment.attachmentId,
            );

            if (!data) {
              this.logger.warn(
                `Failed to download document ${attachment.filename}, storing metadata only`,
              );
              // Fall back to metadata-only
              const stored = this.attachmentStorage.storeAttachmentMetadata(providerId, metadata);
              await this.prisma.emailAttachment.create({
                data: {
                  emailId,
                  filename: stored.filename,
                  mimeType: stored.mimeType,
                  size: stored.size,
                  contentId: stored.contentId,
                  storageType: stored.storageType,
                  storagePath: stored.storagePath,
                  isInline: stored.isInline,
                },
              });
              continue;
            }

            // Upload to S3/MinIO
            const uploaded = await this.attachmentStorage.uploadAttachment(tenantId, providerId, {
              filename: attachment.filename,
              content: data,
              contentType: attachment.mimeType,
            });

            // Save to database with s3 storage
            await this.prisma.emailAttachment.create({
              data: {
                emailId,
                filename: uploaded.filename,
                mimeType: uploaded.mimeType,
                size: uploaded.size,
                contentId: attachment.contentId,
                storageType: uploaded.storageType,
                storagePath: uploaded.storagePath,
                contentHash: uploaded.contentHash,
                isInline: uploaded.isInline,
              },
            });

            this.logger.debug(
              `Downloaded document ${attachment.filename} (${(attachment.size / 1024 / 1024).toFixed(2)}MB) for embeddings`,
            );

            // Embeddings will be processed automatically by KnowledgeBaseService
            // which extracts text from PDF/Office files via AttachmentContentExtractorService
          } else {
            // metadata-only: save reference for on-demand download
            const stored = this.attachmentStorage.storeAttachmentMetadata(providerId, metadata);

            await this.prisma.emailAttachment.create({
              data: {
                emailId,
                filename: stored.filename,
                mimeType: stored.mimeType,
                size: stored.size,
                contentId: stored.contentId,
                storageType: stored.storageType,
                storagePath: stored.storagePath,
                isInline: stored.isInline,
              },
            });

            this.logger.debug(
              `Stored metadata-only for ${attachment.filename} (${(attachment.size / 1024 / 1024).toFixed(2)}MB)`,
            );
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `Failed to process attachment ${attachment.filename} for email ${emailId}: ${error.message}`,
          );
          // Continue processing other attachments
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to process attachments for email ${emailId}: ${error.message}`,
      );
    }
  }
}
