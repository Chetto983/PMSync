import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { ImapFlow } from 'imapflow';
import type { ProviderConfig } from '@prisma/client';
import type { EmailSyncOperation } from '../types/sync-back.types';

/**
 * IMAP-specific sync-back operations.
 * Extracted from EmailSyncBackService for maintainability.
 */
@Injectable()
export class ImapSyncBackService {
  private readonly logger = new Logger(ImapSyncBackService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  /**
   * Get the actual IMAP folder path for a given specialUse or folder name
   */
  async getImapFolderPath(providerId: string, folderName: string): Promise<string> {
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        OR: [
          { path: { equals: folderName, mode: 'insensitive' } },
          { specialUse: { equals: folderName, mode: 'insensitive' } },
          { name: { equals: folderName, mode: 'insensitive' } },
        ],
      },
      select: { path: true, name: true },
    });

    if (folder) {
      this.logger.debug(`Found IMAP folder for ${folderName}: path="${folder.path}"`);
      return folder.path;
    }

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
   * Create an IMAP client connection
   */
  private createImapClient(provider: ProviderConfig): ImapFlow {
    if (!provider.imapHost || !provider.imapUsername) {
      throw new Error(`IMAP credentials not configured for provider ${provider.id}`);
    }
    if (!provider.imapPassword || !provider.imapEncryptionIv) {
      throw new Error(`IMAP password not configured for provider ${provider.id}`);
    }

    const imapPassword = this.crypto.decrypt(
      provider.imapPassword,
      provider.imapEncryptionIv,
    );

    return new ImapFlow({
      host: provider.imapHost,
      port: provider.imapPort || 993,
      secure: provider.imapUseTls ?? true,
      auth: {
        user: provider.imapUsername,
        pass: imapPassword,
      },
      logger: false,
    });
  }

  /**
   * Parse IMAP UID from externalId (format: "folder:uid" or plain uid)
   */
  private parseUid(externalId: string): number {
    let rawUid = externalId;
    if (rawUid.includes(':')) {
      rawUid = rawUid.split(':').pop() || rawUid;
    }
    const uid = parseInt(rawUid, 10);
    if (isNaN(uid)) {
      throw new Error(`Invalid IMAP UID: ${externalId} (parsed: ${rawUid})`);
    }
    return uid;
  }

  /**
   * Sync a single operation to IMAP server
   */
  async syncToImap(operation: EmailSyncOperation, provider: ProviderConfig): Promise<void> {
    let client: ImapFlow | null = null;

    try {
      client = this.createImapClient(provider);
      await client.connect();
      this.logger.log(`Connected to IMAP server: ${provider.imapHost}`);

      const uid = this.parseUid(operation.externalId);

      let normalizedFolder = operation.sourceFolder;
      if (!normalizedFolder) {
        const email = await this.prisma.email.findFirst({
          where: { id: operation.emailId, tenantId: operation.tenantId },
          select: { folder: true },
        });
        normalizedFolder = email?.folder || 'INBOX';
      }

      const currentFolder = await this.getImapFolderPath(provider.id, normalizedFolder);
      this.logger.debug(`IMAP sync-back: opening folder "${currentFolder}" for ${normalizedFolder}`);
      await client.mailboxOpen(currentFolder);

      const uidStr = String(uid);

      switch (operation.operation) {
        case 'markRead':
          await client.messageFlagsAdd(uidStr, ['\\Seen'], { uid: true });
          this.logger.log(`IMAP: Marked message ${uid} as read`);
          break;

        case 'markUnread':
          await client.messageFlagsRemove(uidStr, ['\\Seen'], { uid: true });
          this.logger.log(`IMAP: Marked message ${uid} as unread`);
          break;

        case 'star':
          await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`IMAP: Starred message ${uid}`);
          break;

        case 'unstar':
          await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`IMAP: Unstarred message ${uid}`);
          break;

        case 'flag':
          await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`IMAP: Flagged message ${uid}`);
          break;

        case 'unflag':
          await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
          this.logger.log(`IMAP: Unflagged message ${uid}`);
          break;

        case 'delete': {
          const trashFolder = await this.getImapFolderPath(provider.id, 'TRASH');
          this.logger.debug(`IMAP delete: using trash folder path "${trashFolder}"`);
          try {
            await client.messageMove(uidStr, trashFolder, { uid: true });
            this.logger.log(`IMAP: Moved message ${uid} to ${trashFolder}`);
          } catch (moveError) {
            const moveMsg = moveError instanceof Error ? moveError.message : String(moveError);
            this.logger.warn(`MOVE to ${trashFolder} failed (${moveMsg}), using COPY + DELETE fallback`);
            await client.messageCopy(uidStr, trashFolder, { uid: true });
            await client.messageDelete(uidStr, { uid: true });
            this.logger.log(`IMAP: Moved message ${uid} to ${trashFolder} (via COPY+DELETE)`);
          }
          break;
        }

        case 'moveToFolder': {
          if (!operation.folder) {
            throw new Error('Target folder not specified for move operation');
          }
          const targetFolder = await this.getImapFolderPath(provider.id, operation.folder);
          this.logger.debug(`IMAP moveToFolder: using folder path "${targetFolder}" for ${operation.folder}`);
          try {
            await client.messageMove(uidStr, targetFolder, { uid: true });
            this.logger.log(`IMAP: Moved message ${uid} to ${targetFolder}`);
          } catch (moveErr) {
            const moveErrMsg = moveErr instanceof Error ? moveErr.message : String(moveErr);
            this.logger.warn(`MOVE to ${targetFolder} failed (${moveErrMsg}), using COPY + DELETE fallback`);
            await client.messageCopy(uidStr, targetFolder, { uid: true });
            await client.messageDelete(uidStr, { uid: true });
            this.logger.log(`IMAP: Moved message ${uid} to ${targetFolder} (via COPY+DELETE)`);
          }
          break;
        }

        case 'hardDelete':
          await client.messageDelete(uidStr, { uid: true });
          this.logger.log(`IMAP: Hard deleted message ${uid} from ${currentFolder}`);
          break;

        default:
          this.logger.warn(`Unsupported IMAP operation: ${operation.operation}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`IMAP operation failed: ${err.message}`, err.stack);
      throw error;
    } finally {
      if (client) {
        try {
          await client.logout();
          this.logger.log(`Disconnected from IMAP server`);
        } catch (logoutError) {
          this.logger.warn(`Failed to logout from IMAP: ${logoutError}`);
        }
      }
    }
  }

  /**
   * IMAP batch handling: Reuses a single connection for multiple operations
   */
  async syncImapBatch(provider: ProviderConfig, ops: EmailSyncOperation[]): Promise<void> {
    if (!ops.length) return;

    this.logger.log(`[SYNC-BACK] Syncing ${ops.length} operations to IMAP provider ${provider.id} (Reusable Connection)`);

    let client: ImapFlow | null = null;
    try {
      client = this.createImapClient(provider);
      await client.connect();
      this.logger.log(`Connected to IMAP server: ${provider.imapHost} (Batch Mode)`);

      // BULK FIX: Pre-fetch folders for ops without sourceFolder in 1 query instead of N findFirst() calls
      const opsWithoutFolder = ops.filter((op) => !op.sourceFolder);
      const emailFolderMap = new Map<string, string>();
      if (opsWithoutFolder.length > 0) {
        const emailIds = opsWithoutFolder.map((op) => op.emailId);
        const emails = await this.prisma.email.findMany({
          where: { id: { in: emailIds } },
          select: { id: true, folder: true },
        });
        for (const email of emails) {
          emailFolderMap.set(email.id, email.folder || 'INBOX');
        }
      }

      // Group operations by source folder to minimize switching
      const opsByFolder = new Map<string, EmailSyncOperation[]>();

      for (const op of ops) {
        let folder = op.sourceFolder;
        if (!folder) {
          folder = emailFolderMap.get(op.emailId);
          if (!folder) {
            this.logger.warn(`Email ${op.emailId} not found, skipping IMAP operation`);
            continue;
          }
        }

        if (!opsByFolder.has(folder)) {
          opsByFolder.set(folder, []);
        }
        opsByFolder.get(folder)!.push(op);
      }

      // BULK FIX: Cache folder path lookups to avoid N repeated getImapFolderPath() calls
      const folderPathCache = new Map<string, string>();
      const cachedGetFolderPath = async (fName: string): Promise<string> => {
        if (folderPathCache.has(fName)) return folderPathCache.get(fName)!;
        const path = await this.getImapFolderPath(provider.id, fName);
        folderPathCache.set(fName, path);
        return path;
      };

      // Process each folder group
      for (const [folderName, folderOps] of opsByFolder) {
        const currentFolderPath = await cachedGetFolderPath(folderName);
        this.logger.debug(`IMAP Batch: Opening folder "${currentFolderPath}" for ${folderOps.length} operations`);

        try {
          await client.mailboxOpen(currentFolderPath);
        } catch (openError) {
          this.logger.error(`Failed to open folder ${currentFolderPath}: ${openError}`);
          continue;
        }

        for (const op of folderOps) {
          try {
            let rawUid = op.externalId;
            if (rawUid.includes(':')) {
              rawUid = rawUid.split(':').pop() || rawUid;
            }
            const uidStr = String(parseInt(rawUid, 10));
            if (isNaN(parseInt(uidStr, 10))) {
              this.logger.error(`Invalid IMAP UID: ${op.externalId}`);
              continue;
            }

            switch (op.operation) {
              case 'markRead':
                await client.messageFlagsAdd(uidStr, ['\\Seen'], { uid: true });
                break;
              case 'markUnread':
                await client.messageFlagsRemove(uidStr, ['\\Seen'], { uid: true });
                break;
              case 'star':
                await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
                break;
              case 'unstar':
                await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
                break;
              case 'flag':
                await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true });
                break;
              case 'unflag':
                await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true });
                break;
              case 'delete': {
                const trashFolder = await cachedGetFolderPath('TRASH');
                try {
                  await client.messageMove(uidStr, trashFolder, { uid: true });
                } catch {
                  await client.messageCopy(uidStr, trashFolder, { uid: true });
                  await client.messageDelete(uidStr, { uid: true });
                }
                break;
              }
              case 'moveToFolder': {
                if (!op.folder) continue;
                const targetFolder = await cachedGetFolderPath(op.folder);
                try {
                  await client.messageMove(uidStr, targetFolder, { uid: true });
                } catch {
                  await client.messageCopy(uidStr, targetFolder, { uid: true });
                  await client.messageDelete(uidStr, { uid: true });
                }
                break;
              }
              case 'hardDelete':
                await client.messageDelete(uidStr, { uid: true });
                break;
            }
          } catch (opError) {
            const err = opError instanceof Error ? opError.message : String(opError);
            this.logger.warn(`IMAP op failed for ${op.externalId}: ${err}`);
          }
        }
      }

      this.logger.log(`[SYNC-BACK] IMAP batch sync completed for provider ${provider.id}`);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`IMAP batch connection failed: ${err.message}`, err.stack);
      throw error;
    } finally {
      if (client) {
        try {
          await client.logout();
          this.logger.log(`Disconnected from IMAP server (Batch Mode)`);
        } catch { /* ignore */ }
      }
    }
  }
}
