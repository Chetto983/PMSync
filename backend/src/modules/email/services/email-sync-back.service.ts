import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { ImapFlow } from 'imapflow';

export interface EmailSyncOperation {
  emailId: string;
  externalId: string;
  providerId: string;
  tenantId: string;
  operation: 'delete' | 'hardDelete' | 'markRead' | 'markUnread' | 'star' | 'unstar' | 'flag' | 'unflag' | 'moveToFolder';
  /** For moveToFolder: target folder. For delete: unused (use sourceFolder) */
  folder?: string;
  /** Source folder where message currently resides on IMAP server.
   * Critical for IMAP sync-back since DB folder may already be updated. */
  sourceFolder?: string;
}

/**
 * Service for syncing email changes back to providers (Gmail/Outlook)
 * Implements bidirectional sync - pushes local changes to remote servers
 */
@Injectable()
export class EmailSyncBackService {
  private readonly logger = new Logger(EmailSyncBackService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private googleOAuth: GoogleOAuthService,
    private microsoftOAuth: MicrosoftOAuthService,
  ) {}

  // Bug #13 fix: Default timeout for API operations (30 seconds)
  private readonly OPERATION_TIMEOUT_MS = 30000;

  private async executeWithRetry<T>(
    action: () => Promise<T>,
    description: string,
    maxAttempts = 5,
    baseDelayMs = 500,
  ): Promise<T> {
    let attempt = 0;
    let lastError: any;

    while (attempt < maxAttempts) {
      try {
        // Bug #13 fix: Add timeout protection to prevent hanging operations
        return await this.withTimeout(action(), this.OPERATION_TIMEOUT_MS, description);
      } catch (error: any) {
        lastError = error;
        const status = error?.code || error?.status || error?.response?.status;
        const message = error?.message || '';
        const is429 =
          status === 429 ||
          message.includes('rateLimitExceeded') ||
          message.includes('Too many concurrent requests');

        attempt += 1;
        if (!is429 || attempt >= maxAttempts) {
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Retrying ${description} after rate limit (attempt ${attempt}/${maxAttempts}, wait ${delay}ms)`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Bug #13 fix: Wrap a promise with a timeout to prevent hanging operations
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    description: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout after ${timeoutMs}ms: ${description}`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }

  /**
   * Sync an email operation back to the provider
   */
  async syncOperationToProvider(operation: EmailSyncOperation): Promise<void> {
    try {
      // Bug #9 fix: Validate operation fields before API calls
      if (!operation.externalId || operation.externalId.trim() === '') {
        throw new Error(`Invalid externalId for email ${operation.emailId}: externalId is empty or missing`);
      }
      if (!operation.providerId) {
        throw new Error(`Missing providerId for email ${operation.emailId}`);
      }

      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: operation.providerId },
      });

      // Bug #6 fix: Clear error when provider not found
      if (!provider) {
        throw new Error(`Provider not found: ${operation.providerId} for email ${operation.emailId}`);
      }

      // Sync based on provider type (case-insensitive)
      const providerType = provider.providerType?.toUpperCase();

      switch (providerType) {
        case 'GOOGLE': {
          const accessToken = await this.getValidAccessToken(provider);
          await this.syncToGmail(operation, accessToken);
          break;
        }
        case 'MICROSOFT': {
          const accessToken = await this.getValidAccessToken(provider);
          await this.syncToMicrosoft(operation, accessToken);
          break;
        }
        case 'IMAP':
        case 'GENERIC':
          // IMAP/generic providers use password auth, not OAuth tokens
          await this.syncToImap(operation, provider);
          break;
        default:
          this.logger.warn(`Unsupported provider type: ${provider.providerType}`);
      }

      this.logger.log(`✅ Synced ${operation.operation} for email ${operation.emailId} to ${provider.providerType}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ Failed to sync operation to provider: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  private async getValidAccessToken(provider: any): Promise<string> {
    const now = new Date();
    const isExpired = provider.tokenExpiresAt && now > new Date(provider.tokenExpiresAt);

    if (isExpired && provider.refreshToken && provider.refreshTokenEncryptionIv) {
      this.logger.log(`🔄 Token expired, refreshing...`);

      const refreshToken = this.crypto.decrypt(
        provider.refreshToken,
        provider.refreshTokenEncryptionIv,
      );

      const providerType = provider.providerType?.toUpperCase();

      // Bug #5 fix: Add try/catch for token refresh failures with clear error messages
      try {
        if (providerType === 'GOOGLE') {
          const refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);

          // Update token in database
          const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
          await this.prisma.providerConfig.update({
            where: { id: provider.id },
            data: {
              accessToken: encryptedAccess.encrypted,
              tokenEncryptionIv: encryptedAccess.iv,
              tokenExpiresAt: refreshed.expiresAt,
            },
          });

          return refreshed.accessToken;
        } else if (providerType === 'MICROSOFT') {
          const refreshed = await this.microsoftOAuth.refreshAccessToken(refreshToken);

          // Update token in database
          const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
          await this.prisma.providerConfig.update({
            where: { id: provider.id },
            data: {
              accessToken: encryptedAccess.encrypted,
              tokenEncryptionIv: encryptedAccess.iv,
              tokenExpiresAt: refreshed.expiresAt,
            },
          });

          return refreshed.accessToken;
        }
      } catch (refreshError) {
        const errMsg = refreshError instanceof Error ? refreshError.message : String(refreshError);
        this.logger.error(`Failed to refresh ${providerType} token for provider ${provider.id}: ${errMsg}`);

        // Mark provider as needing re-authentication via metadata
        await this.prisma.providerConfig.update({
          where: { id: provider.id },
          data: {
            isActive: false, // Deactivate until user re-authenticates
            metadata: {
              ...(provider.metadata as Record<string, any> || {}),
              lastTokenError: errMsg,
              lastTokenErrorAt: new Date().toISOString(),
            },
          },
        }).catch((dbErr) => {
          this.logger.warn(`Failed to update provider error status: ${dbErr}`);
        });

        throw new Error(
          `Authentication failed for ${providerType}. Please reconnect your email account.`,
        );
      }
    }

    // Token is still valid, decrypt and return
    return this.crypto.decrypt(provider.accessToken, provider.tokenEncryptionIv);
  }

  /**
   * Sync operation to Gmail
   */
  private async syncToGmail(operation: EmailSyncOperation, accessToken: string): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    switch (operation.operation) {
      case 'delete':
        // Bug #2 fix: Separate delete from moveToFolder - always move to TRASH
        // Get current labels to remove folder labels (proper Gmail move semantic)
        const deleteMsg = await this.executeWithRetry(
          () =>
            gmail.users.messages.get({
              userId: 'me',
              id: operation.externalId,
              format: 'minimal',
            }),
          `gmail get ${operation.externalId}`,
        );
        const deleteCurrentLabels = deleteMsg.data.labelIds || [];
        // These labels should NOT be removed during moves (state labels, not folder labels)
        const deleteImmutableLabels = ['UNREAD', 'STARRED', 'IMPORTANT'];
        // Remove all folder labels except immutable ones and TRASH
        const deleteLabelsToRemove = deleteCurrentLabels.filter(
          (l) => !deleteImmutableLabels.includes(l) && l !== 'TRASH',
        );
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                addLabelIds: ['TRASH'],
                removeLabelIds: deleteLabelsToRemove,
              },
            }),
          `gmail delete ${operation.externalId}`,
        );
        break;

      case 'moveToFolder':
        // Bug #1 fix: Gmail uses labels, so "move" means add new label AND remove old labels
        if (!operation.folder) {
          throw new Error('Target folder not specified for move operation');
        }
        const labelToAdd = operation.folder;
        // Get current labels to properly remove folder labels
        const moveMsg = await this.executeWithRetry(
          () =>
            gmail.users.messages.get({
              userId: 'me',
              id: operation.externalId,
              format: 'minimal',
            }),
          `gmail get ${operation.externalId}`,
        );
        const currentLabels = moveMsg.data.labelIds || [];
        // These labels should NOT be removed during moves (state labels, not folder labels)
        const immutableLabels = ['UNREAD', 'STARRED', 'IMPORTANT'];
        // Remove all folder labels except immutable ones and the target label
        const labelsToRemove = currentLabels.filter(
          (l) => !immutableLabels.includes(l) && l !== labelToAdd,
        );
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                addLabelIds: [labelToAdd],
                removeLabelIds: labelsToRemove,
              },
            }),
          `gmail moveToFolder ${operation.externalId}`,
        );
        break;

      case 'markRead':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                removeLabelIds: ['UNREAD'],
              },
            }),
          `gmail markRead ${operation.externalId}`,
        );
        break;

      case 'markUnread':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                addLabelIds: ['UNREAD'],
              },
            }),
          `gmail markUnread ${operation.externalId}`,
        );
        break;

      case 'star':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                addLabelIds: ['STARRED'],
              },
            }),
          `gmail star ${operation.externalId}`,
        );
        break;

      case 'unstar':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                removeLabelIds: ['STARRED'],
              },
            }),
          `gmail unstar ${operation.externalId}`,
        );
        break;

      case 'flag':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                addLabelIds: ['IMPORTANT'],
              },
            }),
          `gmail flag ${operation.externalId}`,
        );
        break;

      case 'unflag':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: {
                removeLabelIds: ['IMPORTANT'],
              },
            }),
          `gmail unflag ${operation.externalId}`,
        );
        break;

      case 'hardDelete':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.delete({
              userId: 'me',
              id: operation.externalId,
            }),
          `gmail delete ${operation.externalId}`,
        );
        break;
    }
  }

  /**
   * Sync operation to Microsoft Outlook
   */
  private async syncToMicrosoft(operation: EmailSyncOperation, accessToken: string): Promise<void> {
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    switch (operation.operation) {
      case 'delete':
        // Bug #3 fix: Use getMicrosoftFolderId for proper localization support
        // (e.g., Italian uses "Posta eliminata" not "deleteditems")
        const trashFolderId = await this.getMicrosoftFolderId(operation.providerId, 'TRASH');
        await client
          .api(`/me/messages/${operation.externalId}/move`)
          .post({
            destinationId: trashFolderId,
          });
        break;

      case 'moveToFolder':
        // Look up the actual folder to determine well-known folder ID
        const destFolderId = await this.getMicrosoftFolderId(
          operation.providerId,
          operation.folder || 'INBOX',
        );
        await client
          .api(`/me/messages/${operation.externalId}/move`)
          .post({
            destinationId: destFolderId,
          });
        break;

      case 'markRead':
        await client
          .api(`/me/messages/${operation.externalId}`)
          .patch({
            isRead: true,
          });
        break;

      case 'markUnread':
        await client
          .api(`/me/messages/${operation.externalId}`)
          .patch({
            isRead: false,
          });
        break;

      case 'star':
        await client
          .api(`/me/messages/${operation.externalId}`)
          .patch({
            flag: {
              flagStatus: 'flagged',
            },
          });
        break;

      case 'unstar':
        await client
          .api(`/me/messages/${operation.externalId}`)
          .patch({
            flag: {
              flagStatus: 'notFlagged',
            },
          });
        break;

      case 'flag':
        await client
          .api(`/me/messages/${operation.externalId}`)
          .patch({
            flag: {
              flagStatus: 'flagged',
            },
          });
        break;

      case 'unflag':
        await client
          .api(`/me/messages/${operation.externalId}`)
          .patch({
            flag: {
              flagStatus: 'notFlagged',
            },
          });
        break;

      case 'hardDelete':
        await client.api(`/me/messages/${operation.externalId}`).delete();
        break;
    }
  }

  /**
   * Sync operation to IMAP server
   * Implements write operations for IMAP providers
   */
  private async syncToImap(operation: EmailSyncOperation, provider: any): Promise<void> {
    let client: ImapFlow | null = null;

    try {
      // Validate IMAP credentials exist
      if (!provider.imapHost || !provider.imapUsername) {
        throw new Error(`IMAP credentials not configured for provider ${provider.id}`);
      }

      if (!provider.imapPassword || !provider.imapEncryptionIv) {
        throw new Error(`IMAP password not configured for provider ${provider.id}`);
      }

      // Decrypt IMAP credentials
      const imapPassword = this.crypto.decrypt(
        provider.imapPassword,
        provider.imapEncryptionIv,
      );

      // Connect to IMAP server
      client = new ImapFlow({
        host: provider.imapHost,
        port: provider.imapPort || 993,
        secure: provider.imapUseTls ?? true,
        auth: {
          user: provider.imapUsername,
          pass: imapPassword,
        },
        logger: false, // Disable verbose logging
      });

      await client.connect();
      this.logger.log(`📧 Connected to IMAP server: ${provider.imapHost}`);

      // Parse external message ID (UID)
      // IMAP externalId format is "folder:uid" (e.g., "INBOX:271")
      // Extract just the numeric UID part
      let rawUid = operation.externalId;
      if (rawUid.includes(':')) {
        rawUid = rawUid.split(':').pop() || rawUid;
      }
      const uid = parseInt(rawUid, 10);
      if (isNaN(uid)) {
        throw new Error(`Invalid IMAP UID: ${operation.externalId} (parsed: ${rawUid})`);
      }

      // Use sourceFolder from operation if provided (critical for IMAP sync-back
      // since DB folder may already be updated before sync runs)
      // Fall back to looking up from email record
      let normalizedFolder = operation.sourceFolder;
      if (!normalizedFolder) {
        const email = await this.prisma.email.findUnique({
          where: { id: operation.emailId },
          select: { folder: true },
        });
        normalizedFolder = email?.folder || 'INBOX';
      }

      // Convert normalized folder name to actual IMAP path
      // (IMAP servers use different names like 'INBOX' vs 'Inbox', 'Trash' vs 'Cestino')
      const currentFolder = await this.getImapFolderPath(provider.id, normalizedFolder);
      this.logger.debug(`IMAP sync-back: opening folder "${currentFolder}" for ${normalizedFolder}`);

      // Open mailbox
      await client.mailboxOpen(currentFolder);

      // Execute operation based on type
      // Note: imapflow expects SequenceString (e.g. "123") or number[] (e.g. [123]) for range parameter
      const uidStr = String(uid);

      switch (operation.operation) {
        case 'markRead':
          await client.messageFlagsAdd(uidStr, ['\\Seen'], { uid: true });
          this.logger.log(`✅ IMAP: Marked message ${uid} as read`);
          break;

        case 'markUnread':
          await client.messageFlagsRemove(uidStr, ['\\Seen'], { uid: true });
          this.logger.log(`✅ IMAP: Marked message ${uid} as unread`);
          break;

        case 'star':
          await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`✅ IMAP: Starred message ${uid}`);
          break;

        case 'unstar':
          await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`✅ IMAP: Unstarred message ${uid}`);
          break;

        case 'flag':
          await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`✅ IMAP: Flagged message ${uid}`);
          break;

        case 'unflag':
          await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`✅ IMAP: Unflagged message ${uid}`);
          break;

        case 'delete':
          // Move to Trash folder (soft delete) - not hard delete
          // Hard delete is only for 'hardDelete' operation when user permanently deletes from Trash
          // Look up actual trash folder path from database (providers use different names)
          const trashFolder = await this.getImapFolderPath(provider.id, 'TRASH');
          this.logger.debug(`IMAP delete: using trash folder path "${trashFolder}"`);
          try {
            await client.messageMove(uidStr, trashFolder, { uid: true });
            this.logger.log(`✅ IMAP: Moved message ${uid} to ${trashFolder}`);
          } catch (moveError) {
            // Fallback to COPY + DELETE if MOVE not supported
            const moveMsg = moveError instanceof Error ? moveError.message : String(moveError);
            this.logger.warn(`MOVE to ${trashFolder} failed (${moveMsg}), using COPY + DELETE fallback`);
            await client.messageCopy(uidStr, trashFolder, { uid: true });
            await client.messageDelete(uidStr, { uid: true });
            this.logger.log(`✅ IMAP: Moved message ${uid} to ${trashFolder} (via COPY+DELETE)`);
          }
          break;

        case 'moveToFolder':
          if (!operation.folder) {
            throw new Error('Target folder not specified for move operation');
          }

          // Look up the actual folder path from database instead of using hardcoded mappings
          const targetFolder = await this.getImapFolderPath(provider.id, operation.folder);
          this.logger.debug(`IMAP moveToFolder: using folder path "${targetFolder}" for ${operation.folder}`);

          // Use MOVE command if supported, otherwise COPY + DELETE
          try {
            await client.messageMove(uidStr, targetFolder, { uid: true });
            this.logger.log(`✅ IMAP: Moved message ${uid} to ${targetFolder}`);
          } catch (moveErr) {
            // Fallback to COPY + DELETE with proper expunge
            const moveErrMsg = moveErr instanceof Error ? moveErr.message : String(moveErr);
            this.logger.warn(`MOVE to ${targetFolder} failed (${moveErrMsg}), using COPY + DELETE fallback`);
            await client.messageCopy(uidStr, targetFolder, { uid: true });
            // Use messageDelete which marks as \Deleted AND expunges
            await client.messageDelete(uidStr, { uid: true });
            this.logger.log(`✅ IMAP: Moved message ${uid} to ${targetFolder} (via COPY+DELETE)`);
          }
          break;

        case 'hardDelete':
          // Use messageDelete which marks as \Deleted AND expunges in one operation
          await client.messageDelete(uidStr, { uid: true });
          this.logger.log(`✅ IMAP: Hard deleted message ${uid} from ${currentFolder}`);
          break;

        default:
          this.logger.warn(`Unsupported IMAP operation: ${operation.operation}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`❌ IMAP operation failed: ${err.message}`, err.stack);
      throw error;
    } finally {
      // Always close connection
      if (client) {
        try {
          await client.logout();
          this.logger.log(`🔌 Disconnected from IMAP server`);
        } catch (logoutError) {
          this.logger.warn(`Failed to logout from IMAP: ${logoutError}`);
        }
      }
    }
  }

  /**
   * Batch sync multiple operations
   */
  async syncOperationsBatch(operations: EmailSyncOperation[]): Promise<void> {
    if (!operations.length) return;

    this.logger.log(`[SYNC-BACK] Starting batch sync for ${operations.length} operations`);
    this.logger.debug(`[SYNC-BACK] Operations: ${JSON.stringify(operations.map(op => ({ operation: op.operation, externalId: op.externalId })))}`);

    const gmailByProvider = new Map<string, EmailSyncOperation[]>();
    const microsoftByProvider = new Map<string, EmailSyncOperation[]>();
    const otherOps: EmailSyncOperation[] = [];

    for (const op of operations) {
      // Bug #9 fix: Validate externalId in batch operations too
      if (!op.externalId || op.externalId.trim() === '') {
        this.logger.error(`Skipping operation with invalid externalId for email ${op.emailId}`);
        continue;
      }
      if (!op.providerId) {
        this.logger.error(`Skipping operation with missing providerId for email ${op.emailId}`);
        continue;
      }
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: op.providerId },
        select: { id: true, providerType: true },
      });
      // Bug #6 fix: Log error when provider not found instead of silently failing
      if (!provider) {
        this.logger.error(`Provider ${op.providerId} not found for operation ${op.operation} on email ${op.emailId}`);
        continue;
      }
      const type = provider.providerType?.toUpperCase();
      if (type === 'GOOGLE') {
        const list = gmailByProvider.get(op.providerId) ?? [];
        list.push(op);
        gmailByProvider.set(op.providerId, list);
      } else if (type === 'MICROSOFT') {
        const list = microsoftByProvider.get(op.providerId) ?? [];
        list.push(op);
        microsoftByProvider.set(op.providerId, list);
      } else {
        otherOps.push(op);
      }
    }

    for (const [providerId, ops] of gmailByProvider) {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });
      // Bug #6 fix: Log and skip when provider not found
      if (!provider) {
        this.logger.error(`Gmail provider ${providerId} not found during batch sync, skipping ${ops.length} operations`);
        continue;
      }
      await this.syncGmailBatch(provider, ops);
    }

    for (const [providerId, ops] of microsoftByProvider) {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });
      // Bug #6 fix: Log and skip when provider not found
      if (!provider) {
        this.logger.error(`Microsoft provider ${providerId} not found during batch sync, skipping ${ops.length} operations`);
        continue;
      }
      await this.syncMicrosoftBatch(provider, ops);
    }

    if (otherOps.length) {
      const promises = otherOps.map((op) => this.syncOperationToProvider(op));
      await Promise.allSettled(promises);
    }
  }

  /**
   * Gmail batch handling to reduce concurrent requests (429)
   */
  private async syncGmailBatch(provider: any, ops: EmailSyncOperation[]) {
    if (!ops.length) return;

    this.logger.log(`[SYNC-BACK] Syncing ${ops.length} operations to Gmail provider ${provider.id}`);

    const accessToken = await this.getValidAccessToken(provider);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    const hardDeleteIds: string[] = [];
    const markReadIds: string[] = [];
    const markUnreadIds: string[] = [];
    const starIds: string[] = [];
    const unstarIds: string[] = [];
    const flagIds: string[] = [];
    const unflagIds: string[] = [];
    const moveToTrashIds: string[] = [];

    for (const op of ops) {
      switch (op.operation) {
        case 'delete':
          moveToTrashIds.push(op.externalId);
          break;
        case 'hardDelete':
          hardDeleteIds.push(op.externalId);
          break;
        case 'markRead':
          markReadIds.push(op.externalId);
          break;
        case 'markUnread':
          markUnreadIds.push(op.externalId);
          break;
        case 'star':
          starIds.push(op.externalId);
          break;
        case 'unstar':
          unstarIds.push(op.externalId);
          break;
        case 'flag':
          flagIds.push(op.externalId);
          break;
        case 'unflag':
          unflagIds.push(op.externalId);
          break;
        case 'moveToFolder':
          if (op.folder === 'TRASH') {
            moveToTrashIds.push(op.externalId);
          } else {
            // For non-TRASH folders fallback to per-item modify to honor specific label
            await this.syncOperationToProvider(op);
          }
          break;
        default:
          await this.syncOperationToProvider(op);
      }
    }

    // Bug #12 fix: Gmail batch operations support up to 1000 IDs per request
    // Using 900 as safety margin to account for API variations
    for (const ids of this.chunk(hardDeleteIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchDelete({
            userId: 'me',
            requestBody: { ids },
          }),
        `gmail batchDelete (${ids.length})`,
      );
    }

    // Trash via batchModify add TRASH
    for (const ids of this.chunk(moveToTrashIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              addLabelIds: ['TRASH'],
            },
          }),
        `gmail batchMoveToTrash (${ids.length})`,
      );
    }

    // Mark read/unread via batchModify
    for (const ids of this.chunk(markReadIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              removeLabelIds: ['UNREAD'],
            },
          }),
        `gmail batchMarkRead (${ids.length})`,
      );
    }

    for (const ids of this.chunk(markUnreadIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              addLabelIds: ['UNREAD'],
            },
          }),
        `gmail batchMarkUnread (${ids.length})`,
      );
    }

    // Star / unstar via batchModify
    for (const ids of this.chunk(starIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              addLabelIds: ['STARRED'],
            },
          }),
        `gmail batchStar (${ids.length})`,
      );
    }

    for (const ids of this.chunk(unstarIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              removeLabelIds: ['STARRED'],
            },
          }),
        `gmail batchUnstar (${ids.length})`,
      );
    }

    // Flag / unflag via batchModify
    for (const ids of this.chunk(flagIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              addLabelIds: ['IMPORTANT'],
            },
          }),
        `gmail batchFlag (${ids.length})`,
      );
    }

    for (const ids of this.chunk(unflagIds, 900)) {
      await this.executeWithRetry(
        () =>
          gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
              ids,
              removeLabelIds: ['IMPORTANT'],
            },
          }),
        `gmail batchUnflag (${ids.length})`,
      );
    }

    this.logger.log(`[SYNC-BACK] ✅ Gmail batch sync completed for provider ${provider.id}`);
  }

  /**
   * Microsoft batch handling via Graph $batch (max 20 requests)
   */
  private async syncMicrosoftBatch(provider: any, ops: EmailSyncOperation[]) {
    if (!ops.length) return;

    const accessToken = await this.getValidAccessToken(provider);
    const client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    const requests: { method: string; url: string; id: string; headers?: any; body?: any }[] = [];
    let reqId = 1;

    const enqueue = (method: string, url: string, body?: any) => {
      requests.push({
        id: `${reqId++}`,
        method,
        url,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      });
    };

    // Bug #3 fix: Resolve trash folder ID once for batch (avoid hardcoded 'deleteditems')
    const msTrashFolderId = await this.getMicrosoftFolderId(provider.id, 'TRASH');

    for (const op of ops) {
      switch (op.operation) {
        case 'delete':
          // Bug #3 fix: Use resolved trash folder ID for localization
          enqueue('POST', `/me/messages/${op.externalId}/move`, { destinationId: msTrashFolderId });
          break;
        case 'hardDelete':
          enqueue('DELETE', `/me/messages/${op.externalId}`);
          break;
        case 'markRead':
          enqueue('PATCH', `/me/messages/${op.externalId}`, { isRead: true });
          break;
        case 'markUnread':
          enqueue('PATCH', `/me/messages/${op.externalId}`, { isRead: false });
          break;
        case 'star':
          enqueue('PATCH', `/me/messages/${op.externalId}`, { flag: { flagStatus: 'flagged' } });
          break;
        case 'unstar':
          enqueue('PATCH', `/me/messages/${op.externalId}`, { flag: { flagStatus: 'notFlagged' } });
          break;
        case 'flag':
          enqueue('PATCH', `/me/messages/${op.externalId}`, { flag: { flagStatus: 'flagged' } });
          break;
        case 'unflag':
          enqueue('PATCH', `/me/messages/${op.externalId}`, { flag: { flagStatus: 'notFlagged' } });
          break;
        case 'moveToFolder': {
          // Bug #7 fix: Batch ALL moveToFolder operations, not just TRASH
          const destId = await this.getMicrosoftFolderId(op.providerId, op.folder || 'INBOX');
          enqueue('POST', `/me/messages/${op.externalId}/move`, { destinationId: destId });
          break;
        }
        default:
          await this.syncOperationToProvider(op);
      }
    }

    if (!requests.length) return;

    const batches = this.chunk(requests, 20);
    for (const batch of batches) {
      const response = await this.executeWithRetry(
        () => client.api('/$batch').post({ requests: batch }),
        `ms batch (${batch.length})`,
      );

      // Bug #11 fix: Validate individual responses in batch
      const responses = response?.responses || [];
      for (const res of responses) {
        if (res.status >= 400) {
          const errorMsg = res.body?.error?.message || 'Unknown error';
          this.logger.error(
            `Microsoft batch operation failed: HTTP ${res.status} - ${errorMsg} (request ${res.id})`,
          );
        }
      }
    }
  }

  /**
   * Get the actual IMAP folder path for a given specialUse or folder name
   * Different IMAP servers use different folder names (e.g., 'Trash' vs 'trash' vs 'Cestino')
   * This looks up the actual path from the database where folders were synced
   *
   * @param providerId - The provider ID
   * @param folderName - The normalized folder name (e.g., 'TRASH', 'SENT', 'INBOX')
   * @returns The actual IMAP folder path
   */
  private async getImapFolderPath(providerId: string, folderName: string): Promise<string> {
    // Try to find the folder by specialUse first (most reliable)
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        OR: [
          { specialUse: folderName },
          { specialUse: folderName.toUpperCase() },
          { name: { equals: folderName, mode: 'insensitive' } },
        ],
      },
      select: { path: true, name: true },
    });

    if (folder) {
      this.logger.debug(`Found IMAP folder for ${folderName}: path="${folder.path}"`);
      return folder.path;
    }

    // Fallback mappings for common folder names if not found in DB
    const fallbackMap: Record<string, string> = {
      'INBOX': 'INBOX',
      'TRASH': 'Trash',
      'SENT': 'Sent',
      'DRAFTS': 'Drafts',
      'JUNK': 'Junk',
      'SPAM': 'Spam',
      'ARCHIVE': 'Archive',
    };

    const fallback = fallbackMap[folderName.toUpperCase()] || folderName;
    this.logger.warn(`Folder ${folderName} not found in DB for provider ${providerId}, using fallback: ${fallback}`);
    return fallback;
  }

  /**
   * Get Microsoft well-known folder ID for a folder path or specialUse
   * Microsoft Graph API uses well-known folder names (inbox, sentitems, deleteditems, etc.)
   * This looks up the folder by path or specialUse and maps to the correct Graph API folder ID
   *
   * @param providerId - The provider ID
   * @param folderNameOrPath - The folder name/path or specialUse (e.g., 'TRASH', 'Posta Eliminata')
   * @returns Microsoft Graph API folder ID
   */
  private async getMicrosoftFolderId(providerId: string, folderNameOrPath: string): Promise<string> {
    // Well-known folder ID mapping (specialUse -> Graph API ID)
    const wellKnownMap: Record<string, string> = {
      INBOX: 'inbox',
      SENT: 'sentitems',
      DRAFTS: 'drafts',
      TRASH: 'deleteditems',
      JUNK: 'junkemail',
      SPAM: 'junkemail',
      ARCHIVE: 'archive',
    };

    // If it's already a well-known name, return directly
    const upperName = folderNameOrPath.toUpperCase();
    if (wellKnownMap[upperName]) {
      return wellKnownMap[upperName];
    }

    // Try to find the folder by path to get its specialUse
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        OR: [
          { path: folderNameOrPath },
          { name: { equals: folderNameOrPath, mode: 'insensitive' } },
          { specialUse: { equals: folderNameOrPath, mode: 'insensitive' } },
        ],
      },
      select: { path: true, name: true, specialUse: true },
    });

    if (folder) {
      // If we found the folder and it has a specialUse, map to well-known ID
      if (folder.specialUse) {
        const mappedId = wellKnownMap[folder.specialUse.toUpperCase()];
        if (mappedId) {
          this.logger.debug(
            `Microsoft folder lookup: ${folderNameOrPath} -> specialUse=${folder.specialUse} -> ${mappedId}`,
          );
          return mappedId;
        }
      }

      // Otherwise, use the folder's path (Microsoft folder ID/GUID)
      this.logger.debug(`Microsoft folder lookup: ${folderNameOrPath} -> path=${folder.path}`);
      return folder.path;
    }

    // Fallback: return the original name, let Microsoft handle it
    this.logger.warn(
      `Microsoft folder ${folderNameOrPath} not found in DB for provider ${providerId}, using as-is`,
    );
    return folderNameOrPath;
  }
}
