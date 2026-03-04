import { Injectable, Logger, Scope } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import { ComposeMessage, EmailAddress } from '../../interfaces/canonical.types';
import { withRetry, RetryOptions } from '../../../../../common/utils';

/**
 * Microsoft Send Operations Service
 *
 * Handles send/draft/move/delete operations for Microsoft driver.
 * Extracted from microsoft.driver.ts as part of Phase 5 driver split.
 *
 * Wave 2 extraction - send operations extracted after message operations
 * to maintain dependency order (send operations need message operations).
 */
@Injectable({ scope: Scope.TRANSIENT })
export class MicrosoftSendService {
  private readonly logger = new Logger(MicrosoftSendService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private client: AxiosInstance | null = null;

  // Folder ID resolution callback (set by facade)
  // Uses callback pattern to avoid circular dependency on folder service
  private resolveFolderIdFn: ((folder: string) => Promise<string>) | null = null;

  initialize(
    client: AxiosInstance,
    resolveFolderId: (folder: string) => Promise<string>
  ): void {
    this.client = client;
    this.resolveFolderIdFn = resolveFolderId;
  }

  clear(): void {
    this.client = null;
    this.resolveFolderIdFn = null;
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('MicrosoftSendService not initialized - call initialize() first');
    }
  }

  private async resolveFolderId(folder: string): Promise<string> {
    if (!this.resolveFolderIdFn) {
      throw new Error('resolveFolderId callback not configured');
    }
    return this.resolveFolderIdFn(folder);
  }

  // ============================================
  // Send Operations
  // ============================================

  async sendMessage(message: ComposeMessage): Promise<string> {
    this.ensureInitialized();

    const graphMessage = this.composeToGraphMessage(message);

    // BUG-3 FIX: Microsoft Graph's /me/sendMail returns 202 Accepted with no body
    // Use save-then-send pattern to get the message ID:
    // 1. Create draft in Drafts folder (returns message ID)
    // 2. Send the draft (moves to Sent Items)
    const draftResponse = await this.executeWithRetry(
      () => this.client!.post('/me/messages', graphMessage),
      'sendMessage:createDraft',
    );
    const messageId = draftResponse.data.id;

    // Send the draft
    await this.executeWithRetry(
      () => this.client!.post(`/me/messages/${messageId}/send`),
      'sendMessage:send',
    );

    return messageId;
  }

  async saveDraft(message: ComposeMessage, existingDraftId?: string): Promise<string> {
    this.ensureInitialized();

    const graphMessage = this.composeToGraphMessage(message);

    if (existingDraftId) {
      await this.executeWithRetry(
        () => this.client!.patch(`/me/messages/${existingDraftId}`, graphMessage),
        'saveDraft:update',
      );
      return existingDraftId;
    }

    const response = await this.executeWithRetry(
      () => this.client!.post('/me/messages', graphMessage),
      'saveDraft:create',
    );
    return response.data.id;
  }

  async sendDraft(draftId: string): Promise<void> {
    this.ensureInitialized();

    await this.executeWithRetry(
      () => this.client!.post(`/me/messages/${draftId}/send`),
      'sendDraft',
    );
  }

  // ============================================
  // Move/Copy/Delete Operations
  // ============================================

  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureInitialized();

    const destinationId = await this.resolveFolderId(targetFolder);

    await this.executeWithRetry(
      () => this.client!.post(`/me/messages/${messageId}/move`, {
        destinationId,
      }),
      'moveMessage',
    );
  }

  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureInitialized();

    const destinationId = await this.resolveFolderId(targetFolder);

    const response = await this.executeWithRetry(
      () => this.client!.post(`/me/messages/${messageId}/copy`, {
        destinationId,
      }),
      'copyMessage',
    );

    return response.data.id;
  }

  async deleteMessage(messageId: string, permanent = false): Promise<void> {
    this.ensureInitialized();

    if (permanent) {
      await this.executeWithRetry(
        () => this.client!.delete(`/me/messages/${messageId}`),
        'deleteMessage:permanent',
      );
    } else {
      // Move to deleted items
      const trashId = await this.resolveFolderId('TRASH');
      await this.executeWithRetry(
        () => this.client!.post(`/me/messages/${messageId}/move`, {
          destinationId: trashId,
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

    const destinationId = await this.resolveFolderId(targetFolder);

    const requests = messageIds.map((id, index) => ({
      id: String(index),
      method: 'POST',
      url: `/me/messages/${id}/move`,
      body: { destinationId },
      headers: { 'Content-Type': 'application/json' },
    }));

    const BATCH_SIZE = 20;
    const failedIds: Array<{ id: string; status: number; error: string }> = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const response = await this.client!.post('/$batch', { requests: batch });

      // Validate batch responses and track failures
      const responses = (response as any).data?.responses || [];
      for (const resp of responses) {
        if (resp.status >= 400) {
          const originalIdx = i + parseInt(resp.id, 10);
          failedIds.push({
            id: messageIds[originalIdx] || resp.id,
            status: resp.status,
            error: resp.body?.error?.message || `HTTP ${resp.status}`,
          });
        }
      }
    }

    // Log failures and throw if >20% failed
    if (failedIds.length > 0) {
      const failRate = failedIds.length / messageIds.length;
      this.logger.warn(`batchMoveMessages: ${failedIds.length}/${messageIds.length} failed (${(failRate * 100).toFixed(1)}%)`);
      if (failRate > 0.2) {
        throw new Error(`batchMoveMessages failed: ${failedIds.length}/${messageIds.length} operations failed (>20% threshold)`);
      }
    }
  }

  async batchDeleteMessages(messageIds: string[], permanent = false): Promise<void> {
    this.ensureInitialized();

    if (permanent) {
      const requests = messageIds.map((id, index) => ({
        id: String(index),
        method: 'DELETE',
        url: `/me/messages/${id}`,
      }));

      const BATCH_SIZE = 20;
      const failedIds: Array<{ id: string; status: number; error: string }> = [];

      for (let i = 0; i < requests.length; i += BATCH_SIZE) {
        const batch = requests.slice(i, i + BATCH_SIZE);
        const response = await this.client!.post('/$batch', { requests: batch });

        // Validate batch responses and track failures
        const responses = (response as any).data?.responses || [];
        for (const resp of responses) {
          if (resp.status >= 400) {
            const originalIdx = i + parseInt(resp.id, 10);
            failedIds.push({
              id: messageIds[originalIdx] || resp.id,
              status: resp.status,
              error: resp.body?.error?.message || `HTTP ${resp.status}`,
            });
          }
        }
      }

      // Log failures and throw if >20% failed
      if (failedIds.length > 0) {
        const failRate = failedIds.length / messageIds.length;
        this.logger.warn(`batchDeleteMessages: ${failedIds.length}/${messageIds.length} failed (${(failRate * 100).toFixed(1)}%)`);
        if (failRate > 0.2) {
          throw new Error(`batchDeleteMessages failed: ${failedIds.length}/${messageIds.length} operations failed (>20% threshold)`);
        }
      }
    } else {
      // Non-permanent uses batchMoveMessages which has its own validation
      await this.batchMoveMessages(messageIds, 'TRASH');
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Convert ComposeMessage to Microsoft Graph message format
   */
  private composeToGraphMessage(message: ComposeMessage): any {
    const graphMessage: any = {
      subject: message.subject,
      body: {
        contentType: 'html',
        content: message.bodyHtml,
      },
      toRecipients: message.to.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.email },
      })),
      ccRecipients: message.cc?.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.email },
      })),
      bccRecipients: message.bcc?.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.email },
      })),
      replyTo: message.replyTo
        ? [
          {
            emailAddress: { name: message.replyTo.name, address: message.replyTo.email },
          },
        ]
        : undefined,
    };

    // Add attachments if present (per Microsoft Graph API spec)
    if (message.attachments?.length) {
      graphMessage.attachments = message.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.mimeType,
        contentBytes: att.content, // Already base64 encoded
      }));
    }

    // Threading
    if (message.inReplyTo) {
      graphMessage.internetMessageHeaders = [
        { name: 'In-Reply-To', value: message.inReplyTo },
        ...(message.references ? [{ name: 'References', value: message.references }] : []),
      ];
    }

    return graphMessage;
  }

  /**
   * Execute Microsoft Graph API operation with retry logic
   * Handles 429 rate limits and auth errors with exponential backoff
   */
  private executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    return withRetry(operation, {
      provider: 'microsoft',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      ...options,
    });
  }
}
