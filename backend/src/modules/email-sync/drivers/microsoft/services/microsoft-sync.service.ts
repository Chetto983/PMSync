import { Injectable, Logger, Scope } from '@nestjs/common';
import { AxiosInstance, AxiosResponse } from 'axios';
import { ChangesResult } from '../../interfaces/email-driver.interface';
import { ProviderChange } from '../../interfaces/canonical.types';
import { withRetry, RetryOptions, microsoftGraphRateLimiter } from '../../../../../common/utils';

/**
 * Microsoft Sync Service
 *
 * Handles delta/incremental sync operations for Microsoft Graph API using Delta queries.
 * Extracted from MicrosoftDriver as part of Phase 5 (Plan 05-03).
 *
 * CRITICAL: Preserves multi-folder token management and error handling:
 * - Multi-folder token format: { INBOX: deltaLink, SENT: deltaLink, ... }
 * - Legacy single-URL backward compatibility
 * - 410 Gone error handling for expired delta tokens
 * - Delta link validation (graph.microsoft.com and delta in URL)
 * - MAX_PAGES = 50 limit per folder
 */
@Injectable({ scope: Scope.TRANSIENT })
export class MicrosoftSyncService {
  private readonly logger = new Logger(MicrosoftSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private client: AxiosInstance | null = null;
  /** MS-C1 FIX: Token refresh callback for 401 recovery */
  private onTokenRefresh?: () => Promise<void>;

  // Folder resolution callback (set by facade)
  private resolveFolderIdFn: ((folder: string) => Promise<string>) | null = null;

  /**
   * Initialize the sync service with Microsoft Graph API client and folder resolver
   */
  initialize(
    client: AxiosInstance,
    resolveFolderId: (folder: string) => Promise<string>,
  ): void {
    this.client = client;
    this.resolveFolderIdFn = resolveFolderId;
  }

  /** MS-C1 FIX: Set token refresh callback from driver facade */
  setTokenRefreshCallback(callback: () => Promise<void>): void {
    this.onTokenRefresh = callback;
  }

  /**
   * Clear the client and resolver (on disconnect)
   */
  clear(): void {
    this.client = null;
    this.resolveFolderIdFn = null;
    this.onTokenRefresh = undefined;
  }

  /**
   * Ensure the service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('MicrosoftSyncService not initialized. Call initialize() first.');
    }
  }

  /**
   * Resolve folder type to folder ID
   * Uses the callback provided by the driver
   */
  private async resolveFolderId(folder: string): Promise<string> {
    if (!this.resolveFolderIdFn) {
      throw new Error('resolveFolderId callback not configured');
    }
    return this.resolveFolderIdFn(folder);
  }

  // ============================================
  // Sync Operations
  // ============================================

  /**
   * Get initial sync token for delta sync
   *
   * MED-3 FIX (2025-01-05): Sync multiple folders
   * - foldersToSync = ['INBOX', 'SENT', 'DRAFTS', 'TRASH']
   * - Returns JSON.stringify(tokenMap) where tokenMap = { INBOX: deltaLink, ... }
   * - MAX_PAGES = 50 per folder to prevent runaway pagination
   */
  async getInitialSyncToken(): Promise<string> {
    this.ensureInitialized();

    // MED-3 FIX (2025-01-05): Sync multiple folders
    const foldersToSync = ['INBOX', 'SENT', 'DRAFTS', 'TRASH'];
    const tokenMap: Record<string, string> = {};

    for (const folderType of foldersToSync) {
      try {
        const folderId = await this.resolveFolderId(folderType);
        if (!folderId) continue;

        let nextUrl: string | null = `/me/mailFolders/${folderId}/messages/delta`;
        let params: Record<string, any> | undefined = { $select: 'id' };
        const MAX_PAGES = 50;

        for (let page = 0; nextUrl && page < MAX_PAGES; page += 1) {
          const isAbsolute = /^https?:/i.test(nextUrl);
          const response: AxiosResponse<any> = await this.client!.get(
            nextUrl,
            isAbsolute ? { baseURL: '' } : { params },
          );
          const deltaLink = response.data['@odata.deltaLink'];
          if (deltaLink) {
            tokenMap[folderType] = deltaLink;
            break;
          }
          nextUrl = response.data['@odata.nextLink'] || null;
          params = undefined;
        }
      } catch (error: any) {
        this.logger.warn(`Could not get delta link for ${folderType}: ${error.message}`);
      }
    }

    if (Object.keys(tokenMap).length === 0) {
      this.logger.warn('Could not resolve any delta links');
      return '';
    }

    return JSON.stringify(tokenMap);
  }

  /**
   * Get changes since last sync using Microsoft Delta query
   *
   * PRESERVES TOKEN PARSING:
   * - JSON format: { INBOX: deltaLink, SENT: deltaLink, ... }
   * - Legacy format: single URL (assume INBOX)
   * - Invalid format: return getInitialSyncToken()
   *
   * PRESERVES CHANGE TYPES:
   * - @removed → type: 'deleted'
   * - else → type: 'modified'
   *
   * PRESERVES TOKEN MANAGEMENT:
   * - @odata.deltaLink → new token for folder
   * - @odata.nextLink → hasMore = true
   *
   * PRESERVES ERROR HANDLING:
   * - 410 Gone → fullSyncRequired: true
   * - Invalid delta link validation (must contain 'graph.microsoft.com' and 'delta')
   */
  async getChangesSince(syncToken: string): Promise<ChangesResult> {
    this.ensureInitialized();

    let tokenMap: Record<string, string> = {};
    const changes: ProviderChange[] = [];
    let hasMoreGlobal = false;

    // Parse token - handle legacy single-URL format
    try {
      if (syncToken.trim().startsWith('{')) {
        tokenMap = JSON.parse(syncToken);
      } else if (syncToken.includes('http')) {
        // Legacy: assume INBOX
        tokenMap = { INBOX: syncToken };
      } else {
        // Invalid/Empty
        return { changes: [], newSyncToken: await this.getInitialSyncToken(), hasMore: false };
      }
    } catch {
      return { changes: [], newSyncToken: await this.getInitialSyncToken(), hasMore: false };
    }

    const newTokenMap: Record<string, string> = { ...tokenMap };

    // Iterate all tracked folders
    for (const [folder, deltaLink] of Object.entries(tokenMap)) {
      try {
        // Validate URL format
        if (!deltaLink.includes('graph.microsoft.com') || !deltaLink.includes('delta')) {
          this.logger.warn(`Invalid delta link for ${folder}, refreshing token`);
          delete newTokenMap[folder];
          continue;
        }

        const response = await this.client!.get(deltaLink, {
          baseURL: '', // Absolute URL
        });

        const items = response.data.value || [];

        for (const item of items) {
          if (item['@removed']) {
            changes.push({
              messageId: item.id,
              type: 'deleted',
              timestamp: new Date(),
            });
          } else if (item.id) {
            changes.push({
              messageId: item.id,
              type: 'modified',
              timestamp: new Date(item.receivedDateTime || new Date()),
            });
          }
        }

        const nextLink = response.data['@odata.nextLink'];
        const newDeltaLink = response.data['@odata.deltaLink'];

        if (newDeltaLink) {
          newTokenMap[folder] = newDeltaLink;
        } else if (nextLink) {
          newTokenMap[folder] = nextLink;
          hasMoreGlobal = true;
        }

      } catch (error: any) {
        // 410 Gone / 400 Bad Request = expired
        if (error.response?.status === 410 || error.response?.status === 400) {
          this.logger.warn(`Delta token expired for ${folder}, resetting`);
          // Try to get fresh token for this folder only
          try {
            const freshTokensJson = await this.getInitialSyncToken();
            const freshTokens = JSON.parse(freshTokensJson);
            if (freshTokens[folder]) {
              newTokenMap[folder] = freshTokens[folder];
            } else {
              delete newTokenMap[folder];
            }
          } catch {
            delete newTokenMap[folder];
          }
        } else {
          // Other errors, log and keep old token to retry later
          this.logger.warn(`Delta sync failed for ${folder}: ${error.message}`);
        }
      }
    }

    return {
      changes,
      newSyncToken: JSON.stringify(newTokenMap),
      hasMore: hasMoreGlobal,
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Execute Microsoft Graph API operation with retry logic
   * Uses consolidated common/utils/retry.utils.ts
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    // MS-H1 FIX: Acquire rate limiter slot before making Graph API call
    await microsoftGraphRateLimiter.acquire();

    return withRetry(operation, {
      provider: 'microsoft',
      operationName,
      logger: this.logger,
      maxRetries: 3,
      useCircuitBreaker: true,
      onTokenRefresh: this.onTokenRefresh,
      ...options,
    });
  }
}
