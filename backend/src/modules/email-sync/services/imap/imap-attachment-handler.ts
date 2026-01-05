/**
 * IMAP Attachment Handler
 *
 * Provider-specific implementation extending BaseAttachmentHandler.
 * Uses IMAPDriver for attachment download operations.
 *
 * DUP-1 Refactoring:
 * New file: ~60 lines (only provider-specific code)
 * Shares processing logic with Gmail and Microsoft handlers
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';
import { IcsParserService } from '../../../calendar/services/ics-parser.service';
import {
  BaseAttachmentHandler,
  AttachmentMeta,
  AttachmentProviderType,
  DownloadContext,
} from '../base-attachment-handler';
import { IMAPDriver } from '../../drivers/imap/imap.driver';

/**
 * IMAP-specific attachment handler
 * Extends BaseAttachmentHandler for shared processing logic
 */
@Injectable()
export class ImapAttachmentHandler extends BaseAttachmentHandler {
  protected readonly providerType: AttachmentProviderType = 'imap';

  constructor(
    prisma: PrismaService,
    attachmentStorage: AttachmentStorageService,
    icsParser: IcsParserService,
  ) {
    super(prisma, attachmentStorage, icsParser);
  }

  // ==================== Provider-Specific: Download ====================

  /**
   * Download attachment data from IMAP server via driver
   *
   * @param context - Download context with message and attachment IDs
   * @param driver - IMAP driver instance
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadAttachment(
    context: DownloadContext,
    driver: IMAPDriver,
  ): Promise<Buffer | null> {
    try {
      const attachmentData = await driver.getAttachment(
        context.messageId,
        context.attachmentId,
      );

      if (!attachmentData?.content) {
        return null;
      }

      // IMAP driver returns base64-encoded content OR stream
      if (attachmentData.contentStream) {
        return attachmentData.contentStream;
      }
      return attachmentData.content ? Buffer.from(attachmentData.content, 'base64') : null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${context.attachmentId} for message ${context.messageId}: ${err.message}`,
      );
      return null;
    }
  }

  // ==================== Convenience Method for IMAP Sync Service ====================

  /**
   * Process attachments for an IMAP message
   * Wraps the base class method with IMAP-specific download logic
   *
   * @param driver - IMAP driver instance
   * @param emailId - Internal email ID (database)
   * @param externalId - IMAP message ID
   * @param attachments - Attachment metadata (already in canonical format from driver)
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async processImapAttachments(
    driver: IMAPDriver,
    emailId: string,
    externalId: string,
    attachments: AttachmentMeta[],
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    // Create download function closure with IMAP driver
    const downloadFn = async (attachmentId: string): Promise<Buffer | null> => {
      return this.downloadAttachment(
        { messageId: externalId, attachmentId },
        driver,
      );
    };

    // Use base class processing logic
    await this.processEmailAttachments(
      emailId,
      externalId,
      attachments,
      tenantId,
      providerId,
      downloadFn,
    );
  }
}
