import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { ChangesResult } from '../../interfaces/email-driver.interface';
import { ProviderChange } from '../../interfaces/canonical.types';
import { withRetry, RetryOptions } from '../../../../../common/utils';

/**
 * Gmail Sync Service
 *
 * Handles delta/incremental sync operations for Gmail using the History API.
 * Extracted from GoogleDriver as part of Phase 5 (Plan 05-03).
 *
 * CRITICAL: Preserves all error handling for Gmail History API:
 * - 404: historyId expired → return fullSyncRequired: true
 * - 403: quota exceeded → throw retriable error with retryAfter
 * - 429: rate limited → throw retriable error with retryAfter from header
 * - 5xx: server error → throw retriable error with 5s retry
 */
@Injectable()
export class GmailSyncService {
  private readonly logger = new Logger(GmailSyncService.name);
  private gmail: gmail_v1.Gmail | null = null;

  /**
   * Initialize the sync service with Gmail API client
   */
  initialize(gmail: gmail_v1.Gmail): void {
    this.gmail = gmail;
  }

  /**
   * Clear the Gmail API client (on disconnect)
   */
  clear(): void {
    this.gmail = null;
  }

  /**
   * Ensure the service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.gmail) {
      throw new Error('GmailSyncService not initialized. Call initialize() first.');
    }
  }

  // ============================================
  // Sync Operations
  // ============================================

  /**
   * Get initial sync token for delta sync
   * Returns the current historyId from user profile
   */
  async getInitialSyncToken(): Promise<string> {
    this.ensureInitialized();

    const response = await this.gmail!.users.getProfile({ userId: 'me' });
    return response.data.historyId || '';
  }

  /**
   * Get changes since last sync using Gmail History API
   *
   * PRESERVES ALL ERROR HANDLING (from lines 1010-1079 of google.driver.ts):
   * - 404: historyId expired → return fullSyncRequired: true
   * - 403: quota exceeded → throw retriable error with retryAfter
   * - 429: rate limited → throw retriable error with retryAfter from header
   * - 5xx: server error → throw retriable error with 5s retry
   *
   * PRESERVES MEMORY LIMITS:
   * - MAX_PAGES = 25
   * - MAX_CHANGES = 10000
   *
   * PRESERVES CHANGE PARSING:
   * - messagesAdded → type: 'added'
   * - labelsAdded/labelsRemoved → type: 'modified' (deduplicated)
   * - messagesDeleted → type: 'deleted'
   */
  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    this.ensureInitialized();

    const startHistoryId = syncToken;

    // Get current historyId to check if there are changes
    const profile = await this.executeWithRetry(
      () => this.gmail!.users.getProfile({ userId: 'me' }),
      'getProfile',
    );
    const currentHistoryId = profile.data.historyId!;

    if (currentHistoryId === startHistoryId) {
      // No changes
      return {
        changes: [],
        newSyncToken: currentHistoryId,
        hasMore: false,
      };
    }

    const changes: ProviderChange[] = [];
    let pageToken: string | undefined;
    let pagesFetched = 0;
    const MAX_PAGES = 25; // Prevent runaway pagination
    const MAX_CHANGES = 10000; // MEMORY FIX: Prevent unbounded array growth
    let hasMore = false;

    try {
      do {
        const historyResponse = await this.executeWithRetry(
          () => this.gmail!.users.history.list({
            userId: 'me',
            startHistoryId,
            pageToken,
            historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
            maxResults: 500,
          }),
          'getHistory',
        );

        const history = historyResponse.data.history || [];

        for (const record of history) {
          const timestamp = new Date();

          // Process messagesAdded
          if (record.messagesAdded) {
            for (const added of record.messagesAdded) {
              const messageId = added.message?.id;
              if (!messageId) continue;

              changes.push({
                type: 'added',
                messageId,
                threadId: added.message?.threadId || undefined,
                timestamp,
              });
            }
          }

          // Process labelsAdded or labelsRemoved (indicates modification)
          if (record.labelsAdded || record.labelsRemoved) {
            const labelChanges = [
              ...(record.labelsAdded || []),
              ...(record.labelsRemoved || []),
            ];

            for (const labelChange of labelChanges) {
              const messageId = labelChange.message?.id;
              if (!messageId) continue;

              // Avoid duplicates (same message may have multiple label changes)
              if (!changes.find(c => c.messageId === messageId && c.type === 'modified')) {
                changes.push({
                  type: 'modified',
                  messageId,
                  threadId: labelChange.message?.threadId || undefined,
                  timestamp,
                });
              }
            }
          }

          // Process messagesDeleted
          if (record.messagesDeleted) {
            for (const deleted of record.messagesDeleted) {
              const messageId = deleted.message?.id;
              if (!messageId) continue;

              changes.push({
                type: 'deleted',
                messageId,
                threadId: deleted.message?.threadId || undefined,
                timestamp,
              });
            }
          }
        }

        pageToken = historyResponse.data.nextPageToken ?? undefined;
        pagesFetched += 1;

        // MEMORY FIX: Stop if we've accumulated too many changes
        if (changes.length >= MAX_CHANGES) {
          this.logger.warn(`Gmail changes limit reached (${MAX_CHANGES}). Stopping pagination.`);
          hasMore = true;
          break;
        }
      } while (pageToken && pagesFetched < MAX_PAGES);

      if (pageToken) {
        this.logger.warn(
          `Gmail history pagination truncated after ${pagesFetched} pages. Consider full sync.`,
        );
        hasMore = true;
      }

      return {
        changes,
        newSyncToken: currentHistoryId,
        hasMore,
      };
    } catch (error: any) {
      const errorCode = error?.code || error?.status;
      const errorMessage = error?.message || String(error);

      // LB-14 Fix: Comprehensive Gmail API error handling
      // Handle 404 errors (historyId expired) per Gmail API best practices
      if (errorCode === 404) {
        this.logger.warn(
          `Gmail history ID ${startHistoryId} is invalid or expired. Full sync required.`,
        );
        // Return clear signal for full sync
        return {
          changes: [],
          newSyncToken: currentHistoryId,
          hasMore: false,
          fullSyncRequired: true,
        };
      }

      // Handle 403 (permission denied / quota exceeded)
      if (errorCode === 403) {
        const isQuotaExceeded = errorMessage.includes('quotaExceeded') ||
          errorMessage.includes('userRateLimitExceeded') ||
          errorMessage.includes('dailyLimitExceeded');

        if (isQuotaExceeded) {
          this.logger.error(
            `Gmail API quota exceeded for history sync. Will retry later.`,
          );
          // Throw a retriable error for quota issues
          const quotaError = new Error(`Gmail quota exceeded: ${errorMessage}`);
          (quotaError as any).retriable = true;
          (quotaError as any).retryAfter = 60000; // Suggest 1 minute retry
          throw quotaError;
        }

        this.logger.error(
          `Gmail API permission denied for history sync: ${errorMessage}`,
        );
        throw new Error(`Gmail permission denied: ${errorMessage}`);
      }

      // Handle 429 (rate limit exceeded)
      if (errorCode === 429) {
        const retryAfter = error?.response?.headers?.['retry-after'];
        const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000;

        this.logger.warn(
          `Gmail API rate limited. Retry after ${retryMs}ms.`,
        );
        const rateLimitError = new Error(`Gmail rate limited: ${errorMessage}`);
        (rateLimitError as any).retriable = true;
        (rateLimitError as any).retryAfter = retryMs;
        throw rateLimitError;
      }

      // Handle 500/502/503/504 (server errors - retriable)
      if (errorCode >= 500 && errorCode < 600) {
        this.logger.warn(
          `Gmail API server error (${errorCode}): ${errorMessage}. Will retry.`,
        );
        const serverError = new Error(`Gmail server error: ${errorMessage}`);
        (serverError as any).retriable = true;
        (serverError as any).retryAfter = 5000; // 5 second retry for server errors
        throw serverError;
      }

      // Re-throw unhandled errors
      throw error;
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Execute Gmail API operation with retry logic
   * Uses consolidated common/utils/retry.utils.ts
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
