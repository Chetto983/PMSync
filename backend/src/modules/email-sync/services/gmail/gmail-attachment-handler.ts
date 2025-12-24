/**
 * Gmail Attachment Handler
 *
 * Provider-specific implementation extending BaseAttachmentHandler.
 * Uses GoogleDriver for attachment download operations.
 *
 * DC-6 Refactoring: Updated to use driver pattern
 * Shares processing logic with Microsoft and IMAP handlers via BaseAttachmentHandler
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
import { GoogleDriver } from '../../drivers/google/google.driver';

/**
 * Gmail-specific attachment handler
 * Extends BaseAttachmentHandler for shared processing logic
 */
@Injectable()
export class GmailAttachmentHandler extends BaseAttachmentHandler {
  protected readonly providerType: AttachmentProviderType = 'gmail';

  constructor(
    prisma: PrismaService,
    attachmentStorage: AttachmentStorageService,
    icsParser: IcsParserService,
  ) {
    super(prisma, attachmentStorage, icsParser);
  }

  // ==================== Provider-Specific: Download ====================

  /**
   * Download attachment data from Gmail API via driver
   *
   * @param context - Download context with message and attachment IDs
   * @param driver - Google driver instance
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadAttachment(
    context: DownloadContext,
    driver: GoogleDriver,
  ): Promise<Buffer | null> {
    try {
      const attachmentData = await driver.getAttachment(
        context.messageId,
        context.attachmentId,
      );

      if (!attachmentData?.content) {
        return null;
      }

      // Google driver returns base64-encoded content
      return Buffer.from(attachmentData.content, 'base64');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${context.attachmentId} for message ${context.messageId}: ${err.message}`,
      );
      return null;
    }
  }

  // ==================== Convenience Method for Gmail Sync Service ====================

  /**
   * Process attachments for a Gmail message
   * Wraps the base class method with Gmail-specific download logic
   *
   * @param driver - Google driver instance
   * @param emailId - Internal email ID (database)
   * @param externalId - Gmail message ID
   * @param attachments - Attachment metadata (already in canonical format from driver)
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async processGmailAttachments(
    driver: GoogleDriver,
    emailId: string,
    externalId: string,
    attachments: AttachmentMeta[],
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    // Create download function closure with Google driver
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
