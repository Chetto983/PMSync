/**
 * Microsoft Attachment Handler
 *
 * Provider-specific implementation extending BaseAttachmentHandler.
 * Uses MicrosoftDriver for attachment download operations.
 *
 * DC-6 Refactoring: Updated to use driver pattern
 * Shares processing logic with Gmail and IMAP handlers via BaseAttachmentHandler
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
import { MicrosoftDriver } from '../../drivers/microsoft/microsoft.driver';

/**
 * Microsoft-specific attachment handler
 * Extends BaseAttachmentHandler for shared processing logic
 */
@Injectable()
export class MicrosoftAttachmentHandler extends BaseAttachmentHandler {
  protected readonly providerType: AttachmentProviderType = 'microsoft';

  constructor(
    prisma: PrismaService,
    attachmentStorage: AttachmentStorageService,
    icsParser: IcsParserService,
  ) {
    super(prisma, attachmentStorage, icsParser);
  }

  // ==================== Provider-Specific: Download ====================

  /**
   * Download attachment data from Microsoft Graph API via driver
   *
   * @param context - Download context with message and attachment IDs
   * @param driver - Microsoft driver instance
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadAttachment(
    context: DownloadContext,
    driver: MicrosoftDriver,
  ): Promise<Buffer | null> {
    try {
      const attachmentData = await driver.getAttachment(
        context.messageId,
        context.attachmentId,
      );

      if (!attachmentData?.content) {
        return null;
      }

      // Microsoft driver returns base64-encoded content
      return Buffer.from(attachmentData.content, 'base64');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to download attachment ${context.attachmentId} for message ${context.messageId}: ${err.message}`,
      );
      return null;
    }
  }

  // ==================== Convenience Method for Microsoft Sync Service ====================

  /**
   * Process attachments for a Microsoft email
   * Wraps the base class method with Microsoft-specific download logic
   *
   * @param driver - Microsoft driver instance
   * @param emailId - Database email ID
   * @param externalId - External message ID
   * @param attachments - Attachment metadata (already in canonical format from driver)
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async processMicrosoftAttachments(
    driver: MicrosoftDriver,
    emailId: string,
    externalId: string,
    attachments: AttachmentMeta[],
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    // Create download function closure with Microsoft driver
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
