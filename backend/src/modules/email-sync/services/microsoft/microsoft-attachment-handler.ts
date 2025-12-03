import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';

/**
 * Microsoft Graph API attachment metadata
 */
export interface MicrosoftAttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
}

/**
 * Microsoft-specific attachment handler
 * Handles all Microsoft Graph API attachment operations
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation for Microsoft Graph API
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class MicrosoftAttachmentHandler {
  private readonly logger = new Logger(MicrosoftAttachmentHandler.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: AttachmentStorageService,
  ) {}

  /**
   * Fetch attachment metadata from Microsoft Graph API
   *
   * @param accessToken - Microsoft access token
   * @param messageId - External message ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   * @returns Array of attachment metadata
   */
  async fetchMicrosoftAttachments(
    accessToken: string,
    messageId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<MicrosoftAttachmentMeta[]> {
    try {
      const response = await msRequestWithRetry(() =>
        axios.get(`${this.GRAPH_API_BASE}/me/messages/${messageId}/attachments`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { $select: 'id,name,contentType,size,isInline,contentId' },
        }),
      );

      const attachments = response.data?.value || [];
      return attachments.map((att: any) => ({
        id: att.id,
        name: att.name || 'unnamed',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        isInline: !!att.isInline,
        contentId: att.contentId,
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to fetch attachments for message ${messageId}: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Download attachment data from Microsoft Graph API
   *
   * @param accessToken - Microsoft access token
   * @param messageId - External message ID
   * @param attachmentId - Attachment ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   * @returns Attachment data as Buffer or null if failed
   */
  async downloadMicrosoftAttachment(
    accessToken: string,
    messageId: string,
    attachmentId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<Buffer | null> {
    try {
      const response = await msRequestWithRetry(() =>
        axios.get(
          `${this.GRAPH_API_BASE}/me/messages/${messageId}/attachments/${attachmentId}/$value`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer',
          },
        ),
      );

      return Buffer.from(response.data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${attachmentId} for message ${messageId}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Process and store attachments for a Microsoft email using intelligent strategy:
   * - Inline images: skip (already in HTML)
   * - Small documents (<5MB): download + store + queue for embeddings
   * - Everything else: metadata-only (on-demand download)
   *
   * @param accessToken - Microsoft access token
   * @param emailId - Database email ID
   * @param externalId - External message ID
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   */
  async processEmailAttachments(
    accessToken: string,
    emailId: string,
    externalId: string,
    tenantId: string,
    providerId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<void> {
    try {
      // Fetch attachment metadata
      const attachments = await this.fetchMicrosoftAttachments(
        accessToken,
        externalId,
        msRequestWithRetry,
      );

      if (!attachments.length) {
        return;
      }

      // Delete existing attachments for this email (in case of re-sync)
      await this.prisma.emailAttachment.deleteMany({
        where: { emailId },
      });

      // Process each attachment with intelligent strategy
      for (const attachment of attachments) {
        try {
          // Convert to provider-agnostic metadata
          const metadata = {
            filename: attachment.name,
            mimeType: attachment.contentType,
            size: attachment.size,
            isInline: attachment.isInline,
            contentId: attachment.contentId,
            externalId: attachment.id,
            externalMessageId: externalId,
          };

          // Determine processing strategy
          const strategy = this.attachmentStorage.getProcessingStrategy(metadata);

          if (strategy === 'skip') {
            this.logger.debug(`Skipping inline image ${attachment.name} for email ${emailId}`);
            continue;
          }

          if (strategy === 'embeddings') {
            // Small document: download + store + queue for embeddings
            const data = await this.downloadMicrosoftAttachment(
              accessToken,
              externalId,
              attachment.id,
              msRequestWithRetry,
            );

            if (!data) {
              this.logger.warn(
                `Failed to download document ${attachment.name}, storing metadata only`,
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
              filename: attachment.name,
              content: data,
              contentType: attachment.contentType,
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
              `Downloaded document ${attachment.name} (${(attachment.size / 1024 / 1024).toFixed(2)}MB) for embeddings`,
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
              `Stored metadata-only for ${attachment.name} (${(attachment.size / 1024 / 1024).toFixed(2)}MB)`,
            );
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `Failed to process attachment ${attachment.name} for email ${emailId}: ${error.message}`,
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
