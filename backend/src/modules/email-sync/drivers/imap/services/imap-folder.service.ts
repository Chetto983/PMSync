/**
 * ImapFolderService
 *
 * Extracted from IMAPDriver - handles folder CRUD operations and caching.
 * Depends on ImapConnectionPoolService for connection management.
 *
 * Features:
 * - Folder listing with 5-minute TTL cache
 * - RFC 6154 special-use folder detection
 * - Heuristic folder name matching for legacy servers
 * - Canonical type resolution
 */

import { Injectable, Logger, Scope } from '@nestjs/common';
import { ImapConnectionPoolService } from './imap-connection-pool.service';
import {
  CanonicalFolder,
  CanonicalFolderType,
  IMAP_SPECIAL_USE_TO_CANONICAL,
  folderNameToCanonical,
} from '../../interfaces/canonical.types';
import { classifyFolderError, FolderOperationError } from '../../interfaces/folder-errors';

@Injectable({ scope: Scope.TRANSIENT })
export class ImapFolderService {
  private readonly logger = new Logger(ImapFolderService.name);
  private readonly FOLDER_CACHE_TTL = 300000; // 5 minutes
  private readonly STEP_TIMEOUT_MS = 30000; // T-0904: 30s per step
  private readonly CIRCUIT_BREAKER_COOLDOWN_MS = 300000; // T-0904: 5 min cooldown

  private folderCache?: {
    folders: CanonicalFolder[];
    cachedAt: number;
  };

  /** T-0904: Circuit breaker state for deleteFolder per folder path */
  private deleteFailures = new Map<string, { count: number; lastFailedAt: number }>();

  constructor(private readonly connectionPool: ImapConnectionPoolService) {}

  /**
   * Clear the folder cache
   */
  clearCache(): void {
    this.folderCache = undefined;
  }

  /**
   * Check if the folder cache is still valid
   */
  isCacheValid(): boolean {
    return !!(this.folderCache && Date.now() - this.folderCache.cachedAt < this.FOLDER_CACHE_TTL);
  }

  /**
   * List all folders/mailboxes
   */
  async listFolders(): Promise<CanonicalFolder[]> {
    // Check cache first
    if (this.isCacheValid()) {
      return this.folderCache!.folders;
    }

    const folders = await this.connectionPool.withConnection(async (client) => {
      const mailboxes = await client.list();
      return mailboxes.map((mb) => this.mailboxToCanonicalFolder(mb));
    });

    // Update cache
    this.folderCache = {
      folders,
      cachedAt: Date.now(),
    };

    return folders;
  }

  /**
   * Get a specific folder by ID or path
   */
  async getFolder(folderIdOrPath: string): Promise<CanonicalFolder | null> {
    const folders = await this.listFolders();

    // Try exact path match first
    let folder = folders.find(
      (f) => f.path === folderIdOrPath || f.id === folderIdOrPath,
    );

    // Try canonical type match
    if (!folder) {
      folder = folders.find(
        (f) => f.type.toUpperCase() === folderIdOrPath.toUpperCase(),
      );
    }

    // Try name match (case-insensitive)
    if (!folder) {
      folder = folders.find(
        (f) => f.name.toLowerCase() === folderIdOrPath.toLowerCase(),
      );
    }

    return folder || null;
  }

  /**
   * Create a new folder
   */
  async createFolder(name: string, parentId?: string): Promise<CanonicalFolder> {
    try {
      return await this.connectionPool.withConnection(async (client) => {
        const path = parentId ? `${parentId}/${name}` : name;
        await client.mailboxCreate(path);

        // Refresh folder cache
        this.clearCache();

        // Get the created folder
        const folder = await this.getFolder(path);
        if (!folder) {
          throw new Error(`Failed to create folder: ${path}`);
        }
        return folder;
      });
    } catch (error) {
      throw classifyFolderError(error, 'imap', 'create');
    }
  }

  /**
   * T-0904: Run a promise with a timeout.
   * @throws Error if the operation exceeds timeoutMs
   */
  private async withStepTimeout<T>(promise: Promise<T>, step: number, stepName: string, folderId: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`[deleteFolder] Step ${step} (${stepName}) timed out after ${this.STEP_TIMEOUT_MS}ms for folder "${folderId}"`)),
          this.STEP_TIMEOUT_MS,
        ),
      ),
    ]);
  }

  /**
   * Delete a folder
   * Follows RFC 3501 requirements for IMAP folder deletion.
   *
   * T-0904: Each step has a 30s timeout (150s total max).
   * Circuit breaker: after 2 consecutive failures on the same folder,
   * skip delete for 5 minutes to avoid hammering the server.
   */
  async deleteFolder(folderId: string): Promise<void> {
    // T-0904: Circuit breaker check
    const cbState = this.deleteFailures.get(folderId);
    if (cbState && cbState.count >= 2) {
      const elapsed = Date.now() - cbState.lastFailedAt;
      if (elapsed < this.CIRCUIT_BREAKER_COOLDOWN_MS) {
        const remainingSec = Math.ceil((this.CIRCUIT_BREAKER_COOLDOWN_MS - elapsed) / 1000);
        this.logger.warn(
          `[deleteFolder] Circuit breaker OPEN for "${folderId}" — ${cbState.count} consecutive failures. ` +
          `Retry in ${remainingSec}s.`,
        );
        throw new FolderOperationError({
          code: 'circuit-breaker',
          driver: 'imap',
          operation: 'delete',
          recoverable: true,
          message: `deleteFolder circuit breaker open for "${folderId}": ${cbState.count} consecutive failures, cooldown ${remainingSec}s remaining`,
        });
      }
      // Cooldown expired — reset and retry
      this.deleteFailures.delete(folderId);
    }

    try {
      await this.executeDeleteFolder(folderId);
      // Success — reset circuit breaker
      this.deleteFailures.delete(folderId);
    } catch (error) {
      // T-0904: Record failure for circuit breaker
      const prev = this.deleteFailures.get(folderId) || { count: 0, lastFailedAt: 0 };
      this.deleteFailures.set(folderId, { count: prev.count + 1, lastFailedAt: Date.now() });
      throw classifyFolderError(error, 'imap', 'delete');
    }
  }

  /**
   * T-0904: Inner delete logic with per-step timeouts and structured logging.
   */
  private async executeDeleteFolder(folderId: string): Promise<void> {
    return this.connectionPool.withConnection(async (client) => {
      // Step 1: Close any open mailbox via NOOP (30s timeout)
      try {
        await this.withStepTimeout(client.noop(), 1, 'NOOP', folderId);
      } catch (err: unknown) {
        this.logger.debug({
          msg: '[deleteFolder] Step 1 (NOOP) failed',
          folder: folderId,
          step: 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 2: Unsubscribe from folder (30s timeout)
      try {
        await this.withStepTimeout(client.mailboxUnsubscribe(folderId), 2, 'UNSUBSCRIBE', folderId);
      } catch (err: unknown) {
        this.logger.debug({
          msg: '[deleteFolder] Step 2 (UNSUBSCRIBE) failed',
          folder: folderId,
          step: 2,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 3: Empty the folder first — some servers require it (30s timeout)
      try {
        await this.withStepTimeout(
          (async () => {
            const lock = await client.getMailboxLock(folderId);
            try {
              const uids = await client.search({}, { uid: true });
              if (uids && uids.length > 0) {
                await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
                await client.messageDelete(uids, { uid: true });
              }
            } finally {
              lock.release();
            }
          })(),
          3, 'EMPTY_FOLDER', folderId,
        );
      } catch (err: unknown) {
        this.logger.debug({
          msg: '[deleteFolder] Step 3 (EMPTY_FOLDER) failed',
          folder: folderId,
          step: 3,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 4: Deselect folder by selecting INBOX (30s timeout)
      try {
        await this.withStepTimeout(
          (async () => {
            const inboxLock = await client.getMailboxLock('INBOX');
            inboxLock.release();
          })(),
          4, 'DESELECT', folderId,
        );
      } catch (err: unknown) {
        this.logger.debug({
          msg: '[deleteFolder] Step 4 (DESELECT) failed',
          folder: folderId,
          step: 4,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Small delay for server to process the deselection
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 5: Delete the folder with retries (30s timeout per attempt)
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.withStepTimeout(client.mailboxDelete(folderId), 5, 'DELETE', folderId);
          this.clearCache();
          return;
        } catch (error: any) {
          lastError = error;
          const errorMsg = error.message || '';

          if (errorMsg.includes('in use') || errorMsg.includes('selected')) {
            this.logger.warn({
              msg: '[deleteFolder] Step 5 (DELETE) folder still in use',
              folder: folderId,
              step: 5,
              attempt: attempt + 1,
              error: errorMsg,
            });
            try {
              await client.noop();
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch {
              // Ignore
            }
          }

          if (errorMsg.includes('hierarchi') || errorMsg.includes('inferior')) {
            throw new Error(`Cannot delete folder with subfolders: ${folderId}`);
          }

          // T-0904: Handle servers that don't support DELETE
          if (errorMsg.includes('not supported') || errorMsg.includes('not permitted') || errorMsg.includes('not allowed')) {
            throw new Error(
              `Server does not support folder deletion via IMAP: ${folderId}. ` +
              `This is a known limitation of some email providers. ` +
              `Use webmail interface to delete folders.`,
            );
          }

          this.logger.warn({
            msg: `[deleteFolder] Step 5 (DELETE) attempt ${attempt + 1} failed`,
            folder: folderId,
            step: 5,
            attempt: attempt + 1,
            error: errorMsg,
          });
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }

      if (lastError) {
        const errorMsg = lastError.message || '';
        if (errorMsg.includes('Command failed') || errorMsg.includes('Permission')) {
          throw new Error(
            `Server does not support folder deletion via IMAP: ${folderId}. ` +
            `This is a known limitation of some email providers. ` +
            `Use webmail interface to delete folders.`,
          );
        }
        throw new Error(`Failed to delete folder ${folderId} after 3 attempts: ${lastError.message}`);
      }
    });
  }

  /**
   * Rename a folder
   */
  async renameFolder(folderId: string, newName: string): Promise<void> {
    try {
      return await this.connectionPool.withConnection(async (client) => {
        const lastSep = folderId.lastIndexOf('/');
        const newPath = lastSep >= 0 ? `${folderId.substring(0, lastSep)}/${newName}` : newName;

        await client.mailboxRename(folderId, newPath);
        this.clearCache();
      });
    } catch (error) {
      throw classifyFolderError(error, 'imap', 'rename');
    }
  }

  /**
   * Resolve canonical folder type to actual IMAP folder path
   */
  async resolveFolder(canonicalOrPath: string): Promise<string> {
    // If it looks like an IMAP path (contains separator or is not uppercase)
    if (canonicalOrPath.includes('/') || canonicalOrPath !== canonicalOrPath.toUpperCase()) {
      return canonicalOrPath;
    }

    // Try to find by canonical type
    const folders = await this.listFolders();
    const folder = folders.find(
      (f) => f.type.toUpperCase() === canonicalOrPath.toUpperCase(),
    );

    if (folder) {
      return folder.path;
    }

    // Fallback to canonical name as-is (e.g., "INBOX")
    return canonicalOrPath;
  }

  /**
   * Convert IMAP folder path to canonical folder type
   */
  pathToCanonicalFolder(path: string): CanonicalFolderType {
    // Check folder cache for canonical type
    if (this.folderCache) {
      const folder = this.folderCache.folders.find((f) => f.path === path);
      if (folder) {
        return folder.type;
      }
    }

    // Fallback to heuristic mapping
    return folderNameToCanonical(path.split('/').pop() || path);
  }

  /**
   * Convert IMAP mailbox to canonical folder
   */
  private mailboxToCanonicalFolder(mailbox: any): CanonicalFolder {
    // Try RFC 6154 special-use first
    let type: CanonicalFolderType = mailbox.path;

    if (mailbox.specialUse) {
      const specialUse = Array.isArray(mailbox.specialUse)
        ? mailbox.specialUse[0]
        : mailbox.specialUse;
      const canonical = IMAP_SPECIAL_USE_TO_CANONICAL[specialUse];
      if (canonical) {
        type = canonical;
      }
    }

    // INBOX is always INBOX regardless of localization
    if (mailbox.path.toUpperCase() === 'INBOX') {
      type = 'INBOX';
    }

    // Try heuristic name matching if no special-use
    if (type === mailbox.path) {
      type = folderNameToCanonical(mailbox.name || mailbox.path);
    }

    return {
      id: mailbox.path,
      externalId: mailbox.path,
      name: mailbox.name || mailbox.path,
      type,
      path: mailbox.path,
      parentId: mailbox.parentPath || undefined,
      unreadCount: 0,
      totalCount: 0,
      attributes: {
        selectable: !mailbox.flags?.has?.('\\Noselect') && !mailbox.flags?.has?.('\\NonExistent'),
        hasChildren: mailbox.flags?.has?.('\\HasChildren') || false,
        subscribed: mailbox.subscribed ?? true,
      },
    };
  }
}
