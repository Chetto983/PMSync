/**
 * Microsoft Attachment Handler
 *
 * Provider-specific implementation extending BaseAttachmentHandler.
 * Only contains Microsoft Graph API-specific logic.
 *
 * DUP-1 Refactoring:
 * Before: 426 lines (duplicated processing logic)
 * After: ~130 lines (only provider-specific code)
 * Savings: ~296 lines (-69%)
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
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
 * Microsoft Graph API attachment metadata (for internal use)
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
 * Extends BaseAttachmentHandler for shared processing logic
 */
@Injectable()
export class MicrosoftAttachmentHandler extends BaseAttachmentHandler {
  protected readonly providerType: AttachmentProviderType = 'microsoft';
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    prisma: PrismaService,
    attachmentStorage: AttachmentStorageService,
    icsParser: IcsParserService,
  ) {
    super(prisma, attachmentStorage, icsParser);
  }

  // ==================== Provider-Specific: Fetch Attachment List ====================

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
        axios.get(
          `${this.GRAPH_API_BASE}/me/messages/${messageId}/attachments`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { $select: 'id,name,contentType,size,isInline,contentId' },
          },
        ),
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

  // ==================== Provider-Specific: Download ====================

  /**
   * Download attachment data from Microsoft Graph API
   *
   * @param context - Download context with message and attachment IDs
   * @param accessToken - Microsoft access token
   * @param msRequestWithRetry - Retry wrapper function
   * @returns Buffer with attachment data or null if download fails
   */
  async downloadAttachment(
    context: DownloadContext,
    accessToken: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<Buffer | null> {
    try {
      const response = await msRequestWithRetry(() =>
        axios.get(
          `${this.GRAPH_API_BASE}/me/messages/${context.messageId}/attachments/${context.attachmentId}/$value`,
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
        `Failed to download attachment ${context.attachmentId} for message ${context.messageId}: ${err.message}`,
      );
      return null;
    }
  }

  // ==================== Convenience Method for Microsoft Sync Service ====================

  /**
   * Process attachments for a Microsoft email
   * Wraps the base class method with Microsoft-specific logic
   *
   * @param accessToken - Microsoft access token
   * @param emailId - Database email ID
   * @param externalId - External message ID
   * @param tenantId - Tenant ID
   * @param providerId - Provider config ID
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   */
  async processMicrosoftAttachments(
    accessToken: string,
    emailId: string,
    externalId: string,
    tenantId: string,
    providerId: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<void> {
    // Fetch attachment metadata from Microsoft Graph API
    const msAttachments = await this.fetchMicrosoftAttachments(
      accessToken,
      externalId,
      msRequestWithRetry,
    );

    if (!msAttachments.length) {
      return;
    }

    // Convert Microsoft-specific metadata to provider-agnostic format
    const normalizedAttachments: AttachmentMeta[] = msAttachments.map(
      (att) => ({
        id: att.id,
        filename: att.name,
        mimeType: att.contentType,
        size: att.size,
        isInline: att.isInline,
        contentId: att.contentId,
      }),
    );

    // Create download function closure with Microsoft API context
    const downloadFn = async (attachmentId: string): Promise<Buffer | null> => {
      return this.downloadAttachment(
        { messageId: externalId, attachmentId },
        accessToken,
        msRequestWithRetry,
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
