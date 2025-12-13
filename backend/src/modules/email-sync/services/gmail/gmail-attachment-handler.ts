/**
 * Gmail Attachment Handler
 *
 * Provider-specific implementation extending BaseAttachmentHandler.
 * Only contains Gmail-specific download logic.
 *
 * DUP-1 Refactoring:
 * Before: 377 lines (duplicated processing logic)
 * After: ~80 lines (only provider-specific code)
 * Savings: ~297 lines (-79%)
 */

import { Injectable } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';
import { IcsParserService } from '../../../calendar/services/ics-parser.service';
import {
  BaseAttachmentHandler,
  AttachmentMeta,
  AttachmentProviderType,
  DownloadContext,
} from '../base-attachment-handler';

/**
 * Gmail-specific attachment metadata (for internal use)
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
   * Download attachment data from Gmail API
   *
   * @param context - Download context with message and attachment IDs
   * @param gmail - Gmail API client
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadAttachment(
    context: DownloadContext,
    gmail: gmail_v1.Gmail,
  ): Promise<Buffer | null> {
    try {
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: context.messageId,
        id: context.attachmentId,
      });

      if (!response.data.data) {
        return null;
      }

      // Gmail returns base64url-encoded data, need to convert to Buffer
      return Buffer.from(response.data.data, 'base64');
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
   * @param gmail - Gmail API client
   * @param emailId - Internal email ID (database)
   * @param externalId - Gmail message ID
   * @param attachments - Gmail attachment metadata
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   */
  async processGmailAttachments(
    gmail: gmail_v1.Gmail,
    emailId: string,
    externalId: string,
    attachments: GmailAttachmentMeta[],
    tenantId: string,
    providerId: string,
  ): Promise<void> {
    // Convert Gmail-specific metadata to provider-agnostic format
    const normalizedAttachments: AttachmentMeta[] = attachments.map((att) => ({
      id: att.attachmentId,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      isInline: att.isInline,
      contentId: att.contentId,
    }));

    // Create download function closure with Gmail API client
    const downloadFn = async (attachmentId: string): Promise<Buffer | null> => {
      return this.downloadAttachment(
        { messageId: externalId, attachmentId },
        gmail,
      );
    };

    // Use base class processing logic
    await this.processEmailAttachments(
      emailId,
      externalId,
      normalizedAttachments,
      tenantId,
      providerId,
      downloadFn,
    );
  }
}
