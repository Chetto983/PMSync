import { Injectable, Logger } from '@nestjs/common';
import { MicrosoftFolderService } from './microsoft-folder.service';

/**
 * Parsed Microsoft message data
 */
export interface ParsedMicrosoftMessage {
  externalId: string;
  threadId?: string | null;
  messageIdHeader?: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  folder: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isDeleted: boolean;
  sentAt: Date;
  receivedAt: Date;
  size?: number | null;
  metadataStatus: 'active' | 'deleted';
  hasAttachments: boolean;
  attachmentIds: string[];
}

/**
 * Microsoft-specific message parser
 * Handles parsing Microsoft Graph API message objects into normalized format
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific implementation for Microsoft message structure
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class MicrosoftMessageParser {
  private readonly logger = new Logger(MicrosoftMessageParser.name);

  constructor(private readonly microsoftFolderService: MicrosoftFolderService) {}

  /**
   * Parse a Microsoft Graph message into normalized format
   *
   * @param message - Microsoft Graph API message object
   * @param providerId - Provider config ID
   * @param truncateText - Function to truncate text (from BaseEmailSyncService)
   * @returns Parsed message data or null if invalid
   */
  async parseMicrosoftMessage(
    message: any,
    providerId: string,
    truncateText: (text: string, maxLength: number) => string,
  ): Promise<ParsedMicrosoftMessage | null> {
    const externalId = message.id;
    if (!externalId) return null;

    const from = message.from?.emailAddress?.address || '';
    const to = (message.toRecipients || [])
      .map((r: any) => r.emailAddress?.address)
      .filter(Boolean);
    const cc = (message.ccRecipients || [])
      .map((r: any) => r.emailAddress?.address)
      .filter(Boolean);
    const bcc = (message.bccRecipients || [])
      .map((r: any) => r.emailAddress?.address)
      .filter(Boolean);

    const subject = message.subject || '(No Subject)';
    const bodyText = message.body?.contentType === 'text' ? message.body.content : '';
    const bodyHtml =
      message.body?.contentType === 'html' ? message.body.content : message.body?.content || '';
    const snippet = message.bodyPreview || truncateText(bodyText, 200);
    const sentAt = message.sentDateTime ? new Date(message.sentDateTime) : new Date();
    const receivedAt = message.receivedDateTime ? new Date(message.receivedDateTime) : new Date();
    const labels = message.categories || [];
    const isRead = !!message.isRead;
    const isStarred = message.flag?.flagStatus === 'flagged';
    const isFlagged = message.importance === 'high';
    const folder = await this.microsoftFolderService.determineFolderFromParentId(
      message.parentFolderId,
      providerId,
      message.isDraft || false,
    );
    const isDeleted = folder === 'TRASH';
    const hasAttachments = !!message.hasAttachments;

    // Extract attachment IDs if present (attachments are provided as @odata.type objects)
    const attachmentIds: string[] = [];
    if (hasAttachments && message.attachments && Array.isArray(message.attachments)) {
      attachmentIds.push(...message.attachments.map((a: any) => a.id).filter(Boolean));
    }

    return {
      externalId,
      threadId: message.conversationId,
      messageIdHeader: message.internetMessageId,
      from,
      to,
      cc,
      bcc,
      subject,
      bodyText,
      bodyHtml,
      snippet,
      folder,
      labels,
      isRead,
      isStarred,
      isFlagged,
      isDeleted,
      sentAt,
      receivedAt,
      size: message.size,
      metadataStatus: isDeleted ? 'deleted' : 'active',
      hasAttachments,
      attachmentIds,
    };
  }
}
