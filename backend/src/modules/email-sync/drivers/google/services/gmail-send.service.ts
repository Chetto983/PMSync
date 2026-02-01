import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { ComposeMessage } from '../../interfaces/canonical.types';
import { MimeBuilder, withRetry, RetryOptions } from '../../../../../common/utils';

/**
 * Gmail Send Operations Service
 *
 * Handles send/draft/move/delete operations for Gmail driver.
 * Extracted from google.driver.ts as part of Phase 5 driver split.
 *
 * Wave 2 extraction - send operations extracted after message operations
 * to maintain dependency order (send operations need message operations).
 */
@Injectable()
export class GmailSendService {
  private readonly logger = new Logger(GmailSendService.name);
  private gmail: gmail_v1.Gmail | null = null;

  initialize(gmail: gmail_v1.Gmail): void {
    this.gmail = gmail;
  }

  clear(): void {
    this.gmail = null;
  }

  private ensureInitialized(): void {
    if (!this.gmail) {
      throw new Error('GmailSendService not initialized - call initialize() first');
    }
  }

  // ============================================
  // Send Operations
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    this.ensureInitialized();

    const raw = await this.composeToRaw(message);

    const response = await this.executeWithRetry(
      () => this.gmail!.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: message.threadId,
        },
      }),
      'sendMessage',
    );

    return response.data.id || '';
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    this.ensureInitialized();

    const raw = await this.composeToRaw(message);

    if (existingDraftId) {
      const response = await this.executeWithRetry(
        () => this.gmail!.users.drafts.update({
          userId: 'me',
          id: existingDraftId,
          requestBody: {
            message: { raw, threadId: message.threadId },
          },
        }),
        'updateDraft',
      );
      return response.data.id || existingDraftId;
    }

    const response = await this.executeWithRetry(
      () => this.gmail!.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw, threadId: message.threadId },
        },
      }),
      'createDraft',
    );

    return response.data.id || '';
  }

  async sendDraft(draftId: string): Promise<void> {
    this.ensureInitialized();

    await this.executeWithRetry(
      () => this.gmail!.users.drafts.send({
        userId: 'me',
        requestBody: { id: draftId },
      }),
      'sendDraft',
    );
  }

  // ============================================
  // Move/Copy/Delete Operations
  // ============================================

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureInitialized();

    const upperTarget = targetFolder.toUpperCase();

    // FIX: SENT cannot be a move target - Gmail applies SENT label automatically when sending
    if (upperTarget === 'SENT') {
      this.logger.warn(`Cannot move message to SENT folder - Gmail applies this label automatically`);
      return; // Skip silently - this is expected behavior
    }

    // FIX: ARCHIVE in Gmail = remove INBOX label (not add a label)
    const isArchiveTarget = upperTarget === 'ARCHIVE' || upperTarget === 'ALL';

    const targetLabelId = isArchiveTarget ? null : this.canonicalToGmailLabel(targetFolder);

    // Get current labels
    const message = await this.executeWithRetry(
      () => this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'minimal',
      }),
      'moveMessage:get',
    );

    const currentLabels = message.data.labelIds || [];

    // Labels that cannot be removed (Gmail system labels that are immutable)
    // SENT, DRAFT labels are assigned by Gmail and cannot be removed
    const immutableLabels = ['UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT'];
    let labelsToRemove: string[];
    let labelsToAdd: string[];

    if (isArchiveTarget) {
      // Archive = remove INBOX label, keep other labels
      labelsToRemove = currentLabels.includes('INBOX') ? ['INBOX'] : [];
      labelsToAdd = [];
    } else {
      // Normal move = remove folder labels, add target label
      labelsToRemove = currentLabels.filter(
        (l) => !immutableLabels.includes(l) && l !== targetLabelId
      );
      labelsToAdd = targetLabelId ? [targetLabelId] : [];
    }

    // Only modify if there are changes to make
    if (labelsToRemove.length > 0 || labelsToAdd.length > 0) {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: labelsToAdd,
            removeLabelIds: labelsToRemove,
          },
        }),
        'moveMessage:modify',
      );
    }
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureInitialized();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Gmail doesn't have copy - we add the label instead
    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: targetLabelId ? [targetLabelId] : [],
        },
      }),
      'copyMessage:modify',
    );

    return messageId; // Same message, just with additional label
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    this.ensureInitialized();

    if (permanent) {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.delete({
          userId: 'me',
          id: messageId,
        }),
        'deleteMessage:permanent',
      );
    } else {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.trash({
          userId: 'me',
          id: messageId,
        }),
        'deleteMessage:trash',
      );
    }
  }

  // ============================================
  // Batch Operations
  // ============================================

  async batchMoveMessages(messageIds: string[], targetFolder: string): Promise<void> {
    this.ensureInitialized();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    await this.executeWithRetry(
      () => this.gmail!.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds: targetLabelId ? [targetLabelId] : [],
          // Note: This doesn't remove from source folder - Gmail uses labels
        },
      }),
      'batchMoveMessages',
    );
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    this.ensureInitialized();

    if (permanent) {
      await this.executeWithRetry(
        () => this.gmail!.users.messages.batchDelete({
          userId: 'me',
          requestBody: { ids: messageIds },
        }),
        'batchDeleteMessages:permanent',
      );
    } else {
      // Move to trash
      await this.executeWithRetry(
        () => this.gmail!.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids: messageIds,
            addLabelIds: ['TRASH'],
          },
        }),
        'batchDeleteMessages:trash',
      );
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Convert ComposeMessage to Gmail raw format (base64url encoded MIME)
   */
  private async composeToRaw(message: ComposeMessage): Promise<string> {
    const rawMessage = await MimeBuilder.build(message);
    return rawMessage.toString('base64url');
  }

  /**
   * Convert canonical folder name to Gmail label ID
   * Returns null for ARCHIVE (special handling required)
   */
  private canonicalToGmailLabel(canonical: string): string | null {
    const upper = canonical.toUpperCase();

    // Gmail canonical mappings
    const CANONICAL_TO_GMAIL: Record<string, string> = {
      'INBOX': 'INBOX',
      'SENT': 'SENT',
      'DRAFTS': 'DRAFT',
      'TRASH': 'TRASH',
      'SPAM': 'SPAM',
      'STARRED': 'STARRED',
      'IMPORTANT': 'IMPORTANT',
      'ARCHIVE': 'ARCHIVE', // Special: handled separately in moveMessage
      'ALL': 'ARCHIVE', // Alias for ARCHIVE
    };

    return CANONICAL_TO_GMAIL[upper] || canonical;
  }

  /**
   * Execute Gmail API operation with retry logic
   * Handles 429 rate limits and auth errors with exponential backoff
   */
  private executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    return withRetry(operation, {
      provider: 'google',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      ...options,
    });
  }
}
