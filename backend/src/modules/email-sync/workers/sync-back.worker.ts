/**
 * SyncBackWorker
 *
 * BullMQ worker that syncs local email state changes back to providers.
 * Ensures that actions like mark-read, archive, delete, star, etc.
 * are reflected in the user's actual email account.
 *
 * Features:
 * - Batched operations to reduce API calls
 * - Provider-specific implementations (Gmail, Microsoft, IMAP)
 * - Debounce handling for rapid changes
 * - Error handling with retries
 * - Progress tracking for bulk operations
 *
 * PHASE 4 CONSOLIDATION: Now extends BaseWorker for shared lifecycle management.
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  SyncBackJobData,
  SyncBackJobResult,
  ProviderSyncBackQueueService,
} from '../services/provider-sync-back-queue.service';
import { ProviderTokenService } from '../services/provider-token.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { QUEUE_NAMES } from '../../../common/config';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { parseImapExternalId as parseImapExternalIdShared } from '../../../common/utils/imap-utils';

@Injectable()
export class SyncBackWorker extends BaseWorker<SyncBackJobData, SyncBackJobResult> {
  protected readonly logger = new Logger(SyncBackWorker.name);
  protected readonly workerName = 'sync-back';
  protected readonly envToggle = 'SYNC_BACK_WORKERS_ENABLED';

  private readonly BATCH_SIZE = 50; // Max emails per API call

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ProviderSyncBackQueueService))
    private readonly queueService: ProviderSyncBackQueueService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly cryptoService: CryptoService,
    private readonly redisLock: RedisLockService,
  ) {
    super(configService);
  }

  protected getWorkerConfig(): BaseWorkerConfig {
    return {
      queueName: QUEUE_NAMES.PROVIDER_SYNC_BACK,
      concurrency: 5,
      lockDuration: 600000, // 10 minutes for bulk operations
      stalledInterval: 180000, // 3 min stalled interval
      limiter: {
        max: 20, // Max 20 sync-back ops per minute
        duration: 60000,
      },
    };
  }

  protected formatCompletedLog(job: Job<SyncBackJobData>, result: SyncBackJobResult): string {
    return `${result.action} synced=${result.syncedCount} failed=${result.failedCount}`;
  }

  protected async processJob(job: Job<SyncBackJobData>): Promise<SyncBackJobResult> {
    const startTime = Date.now();
    const { tenantId, providerId, providerType, action, emailIds, externalIds, targetFolder, labelId, permanent } =
      job.data;

    // PHASE 6.1: Distributed lock to prevent concurrent sync-back on same provider+action
    // This prevents race conditions when multiple workers process the same provider
    // DC-9: Use standardized lock key generation from BaseWorker
    const lockKey = this.generateLockKey(`${providerId}`, action);
    const lockTtlMs = 300000; // 5 minutes - enough for bulk operations

    const result = await this.redisLock.tryWithLock<SyncBackJobResult>(
      lockKey,
      lockTtlMs,
      async () => {
        this.logger.log(`Processing sync-back: ${action} for ${emailIds.length} emails on ${providerType}`);

        const errors: string[] = [];
        let syncedCount = 0;
        let failedCount = 0;

        try {
          // Get provider and tokens
          const provider = await this.prisma.providerConfig.findUnique({
            where: { id: providerId },
          });

          if (!provider || provider.tenantId !== tenantId) {
            throw new Error(`Provider ${providerId} not found or unauthorized`);
          }

          // AUDIT FIX #7: Verify provider type matches job data (DC-6 consolidated)
          this.validateProviderType(provider.providerType, providerType, providerId);

          // Get external IDs if not provided
          const messageExternalIds = externalIds || (await this.getExternalIds(emailIds, tenantId));

          if (!messageExternalIds.length) {
            this.logger.warn(`No external IDs found for sync-back ${action}`);
            return {
              success: true,
              action,
              emailIds,
              syncedCount: 0,
              failedCount: 0,
              durationMs: Date.now() - startTime,
            };
          }

          // Get provider with valid tokens
          const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

          // Process in batches
          for (let i = 0; i < messageExternalIds.length; i += this.BATCH_SIZE) {
            const batch = messageExternalIds.slice(i, i + this.BATCH_SIZE);

            try {
              await this.syncBatchToProvider(providerType, accessToken, action, batch, {
                targetFolder,
                labelId,
                providerEmail: provider.email,
                // AUDIT FIX #2: Pass tenantId and providerId for IMAP tenant safety
                tenantId,
                providerId,
                permanent, // FIX: Pass permanent flag for hard delete
              });
              syncedCount += batch.length;

              // Update progress
              const progress = Math.round(((i + batch.length) / messageExternalIds.length) * 100);
              await job.updateProgress(progress);
            } catch (batchError) {
              const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
              errors.push(`Batch ${i / this.BATCH_SIZE + 1}: ${errorMsg}`);
              failedCount += batch.length;
            }
          }

          const durationMs = Date.now() - startTime;
          this.logger.log(
            `Sync-back completed: ${action} synced=${syncedCount} failed=${failedCount} (${durationMs}ms)`,
          );

          return {
            success: failedCount === 0,
            action,
            emailIds,
            syncedCount,
            failedCount,
            errors: errors.length ? errors : undefined,
            durationMs,
          };
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          return {
            success: false,
            action,
            emailIds,
            syncedCount,
            failedCount: emailIds.length - syncedCount,
            errors: [errorMessage],
            durationMs,
          };
        }
      },
    );

    // If lock wasn't acquired, throw to trigger BullMQ retry
    if (result === undefined) {
      this.logger.warn(`Sync-back lock not acquired for ${providerId}:${action}, job will retry`);
      throw new Error(`Lock not acquired for sync-back ${providerId}:${action} - concurrent operation in progress`);
    }

    return result;
  }

  private async getExternalIds(emailIds: string[], tenantId: string): Promise<string[]> {
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: { externalId: true },
    });

    return emails.map((e) => e.externalId).filter((id): id is string => !!id);
  }

  private async syncBatchToProvider(
    providerType: 'google' | 'microsoft' | 'imap',
    accessToken: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { targetFolder?: string; labelId?: string; providerEmail?: string; tenantId?: string; providerId?: string; permanent?: boolean },
  ): Promise<void> {
    switch (providerType) {
      case 'google':
        await this.syncToGmail(accessToken, action, externalIds, options);
        break;
      case 'microsoft':
        await this.syncToMicrosoft(accessToken, action, externalIds, options);
        break;
      case 'imap':
        // AUDIT FIX #2: Pass tenantId and providerId for tenant-scoped lookup
        await this.syncToImap(options.providerEmail || '', action, externalIds, {
          ...options,
          tenantId: options.tenantId,
          providerId: options.providerId,
        });
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }

  private async syncToGmail(
    accessToken: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { labelId?: string; permanent?: boolean },
  ): Promise<void> {
    // FIX: Handle permanent delete separately - requires individual DELETE calls
    if (action === 'delete' && options.permanent) {
      await this.permanentDeleteGmail(accessToken, externalIds);
      return;
    }

    // Gmail batch modify endpoint for non-permanent operations
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify';

    let addLabelIds: string[] = [];
    let removeLabelIds: string[] = [];

    switch (action) {
      case 'mark-read':
        removeLabelIds = ['UNREAD'];
        break;
      case 'mark-unread':
        addLabelIds = ['UNREAD'];
        break;
      case 'star':
        addLabelIds = ['STARRED'];
        break;
      case 'unstar':
        removeLabelIds = ['STARRED'];
        break;
      case 'archive':
        removeLabelIds = ['INBOX'];
        break;
      case 'delete':
        // Soft delete - move to trash
        addLabelIds = ['TRASH'];
        break;
      case 'add-label':
        if (options.labelId) addLabelIds = [options.labelId];
        break;
      case 'remove-label':
        if (options.labelId) removeLabelIds = [options.labelId];
        break;
      default:
        throw new Error(`Unsupported Gmail action: ${action}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: externalIds,
        addLabelIds: addLabelIds.length ? addLabelIds : undefined,
        removeLabelIds: removeLabelIds.length ? removeLabelIds : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail batch modify failed: ${response.status} ${error}`);
    }
  }

  /**
   * Permanently delete messages from Gmail (bypasses Trash)
   * Uses Gmail batchDelete API for efficiency
   * @see https://developers.google.com/gmail/api/reference/rest/v1/users.messages/batchDelete
   */
  private async permanentDeleteGmail(accessToken: string, externalIds: string[]): Promise<void> {
    // Gmail batchDelete endpoint - permanently deletes messages
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchDelete';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: externalIds }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail permanent delete failed: ${response.status} ${error}`);
    }

    this.logger.log(`Gmail permanent delete: ${externalIds.length} messages`);
  }

  private async syncToMicrosoft(
    accessToken: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { targetFolder?: string; permanent?: boolean },
  ): Promise<void> {
    // Microsoft Graph $batch endpoint - up to 20 requests per batch
    const MICROSOFT_BATCH_SIZE = 20;
    const batchUrl = 'https://graph.microsoft.com/v1.0/$batch';

    // Process in batches of 20 (Microsoft's limit)
    for (let i = 0; i < externalIds.length; i += MICROSOFT_BATCH_SIZE) {
      const batchIds = externalIds.slice(i, i + MICROSOFT_BATCH_SIZE);
      const requests: Array<{
        id: string;
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: Record<string, unknown>;
      }> = [];

      for (let j = 0; j < batchIds.length; j++) {
        const messageId = batchIds[j];
        let url = `/me/messages/${messageId}`;
        let method = 'PATCH';
        let body: Record<string, unknown> | undefined;

        switch (action) {
          case 'mark-read':
            body = { isRead: true };
            break;
          case 'mark-unread':
            body = { isRead: false };
            break;
          case 'star':
          case 'flag':
            body = { flag: { flagStatus: 'flagged' } };
            break;
          case 'unstar':
          case 'unflag':
            body = { flag: { flagStatus: 'notFlagged' } };
            break;
          case 'archive':
            url = `/me/messages/${messageId}/move`;
            method = 'POST';
            body = { destinationId: 'archive' };
            break;
          case 'delete':
            if (options.permanent) {
              // Permanent delete - bypasses Deleted Items
              method = 'DELETE';
            } else {
              // Soft delete - move to Deleted Items (recoverable)
              url = `/me/messages/${messageId}/move`;
              method = 'POST';
              body = { destinationId: 'deleteditems' };
            }
            break;
          case 'move':
            url = `/me/messages/${messageId}/move`;
            method = 'POST';
            body = { destinationId: options.targetFolder };
            break;
          default:
            throw new Error(`Unsupported Microsoft action: ${action}`);
        }

        const request: {
          id: string;
          method: string;
          url: string;
          headers?: Record<string, string>;
          body?: Record<string, unknown>;
        } = {
          id: String(j + 1),
          method,
          url,
        };

        if (body) {
          request.headers = { 'Content-Type': 'application/json' };
          request.body = body;
        }

        requests.push(request);
      }

      // Execute batch request
      const response = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Microsoft batch request failed: ${response.status} ${error}`);
      }

      // Check individual responses for errors (per-item error handling)
      const batchResponse = (await response.json()) as {
        responses: Array<{ id: string; status: number; body?: { error?: { message: string } } }>;
      };
      const itemErrors: string[] = [];
      let successCount = 0;

      for (const res of batchResponse.responses) {
        // 200, 201, 204 are success codes
        if (res.status >= 400) {
          const messageId = batchIds[parseInt(res.id, 10) - 1];
          const errorMsg = res.body?.error?.message || `Status ${res.status}`;
          itemErrors.push(`${messageId}: ${errorMsg}`);
        } else {
          successCount++;
        }
      }

      // Log per-item errors but don't fail the entire batch if some succeeded
      if (itemErrors.length > 0) {
        this.logger.warn(
          `Microsoft ${action} partial failures: ${itemErrors.length}/${batchIds.length} failed`,
          { errors: itemErrors.slice(0, 5) }, // Log first 5 errors
        );

        // Only throw if ALL items failed - partial success continues
        if (successCount === 0) {
          throw new Error(`Microsoft ${action} completely failed: ${itemErrors.join('; ')}`);
        }
      }
    }
  }

  /**
   * Parse IMAP external ID to extract folder and UID
   * Uses shared parseImapExternalId utility with null-safe wrapper
   * @see email-sync/utils/imap.utils.ts for implementation
   */
  private parseImapExternalIdSafe(externalId: string): { folder: string | null; uid: number | null } {
    try {
      const { folderPath, uid } = parseImapExternalIdShared(externalId);
      const uidNum = parseInt(uid, 10);
      return {
        folder: folderPath,
        uid: Number.isFinite(uidNum) && uidNum > 0 ? uidNum : null,
      };
    } catch {
      return { folder: null, uid: null };
    }
  }

  private async syncToImap(
    providerEmail: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { targetFolder?: string; labelId?: string; tenantId?: string; providerId?: string; permanent?: boolean },
  ): Promise<void> {
    // AUDIT FIX #2: Resolve provider by providerId AND tenantId for tenant safety
    let provider;
    if (options.providerId && options.tenantId) {
      provider = await this.prisma.providerConfig.findFirst({
        where: {
          id: options.providerId,
          tenantId: options.tenantId,
          providerType: 'imap',
        },
      });
    } else {
      // Fallback to email lookup (legacy behavior, less secure)
      this.logger.warn(`IMAP sync-back using email-only lookup (legacy) for ${providerEmail}`);
      provider = await this.prisma.providerConfig.findFirst({
        where: { email: providerEmail, providerType: 'imap' },
      });
    }

    if (!provider) {
      throw new Error(`IMAP provider not found for ${providerEmail}`);
    }

    const metadata = (provider as any).metadata || {};

    // Get IMAP configuration
    const imapHost = metadata.imapHost || 'imap.gmail.com';
    const imapPort = metadata.imapPort || 993;
    const imapSecure = metadata.imapSecure !== false;

    // AUDIT FIX #2: Use imapPassword from metadata, NOT accessToken
    // accessToken is for OAuth providers, imapPassword is for IMAP basic auth
    let password: string;
    try {
      // Try imapPassword first (correct for IMAP), fallback to accessToken for compatibility
      const encryptedPassword = metadata.imapPassword || provider.accessToken;
      const encryptionIv = metadata.imapPasswordIv || provider.tokenEncryptionIv;

      if (!encryptedPassword || !encryptionIv) {
        throw new Error('IMAP password not configured');
      }

      password = this.cryptoService.decrypt(encryptedPassword, encryptionIv);
    } catch (error) {
      throw new Error(`Failed to decrypt IMAP password: ${error instanceof Error ? error.message : error}`);
    }

    // Create IMAP connection
    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: imapSecure,
      auth: {
        user: providerEmail,
        pass: password,
      },
      logger: false,
    });

    try {
      await client.connect();

      // AUDIT FIX #1: Group messages by folder and process each folder separately
      // External IDs are stored as "folder:uid" format
      const messagesByFolder = new Map<string, number[]>();

      for (const externalId of externalIds) {
        const { folder, uid } = this.parseImapExternalIdSafe(externalId);

        // BUG-006 FIX: Check for null instead of NaN
        if (uid === null) {
          this.logger.warn(`Invalid IMAP external ID (not a valid positive integer): ${externalId}`);
          continue;
        }

        // Use parsed folder or default to INBOX
        const targetMailbox = folder || 'INBOX';

        if (!messagesByFolder.has(targetMailbox)) {
          messagesByFolder.set(targetMailbox, []);
        }
        messagesByFolder.get(targetMailbox)!.push(uid);
      }

      if (messagesByFolder.size === 0) {
        this.logger.warn('No valid UIDs for IMAP sync-back');
        return;
      }

      // Process each folder's messages
      let totalProcessed = 0;
      for (const [mailbox, uids] of messagesByFolder) {
        try {
          // Open the correct mailbox for this batch of messages
          await client.mailboxOpen(mailbox);

          // Execute action based on type
          switch (action) {
            case 'mark-read':
              await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
              break;

            case 'mark-unread':
              await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
              break;

            case 'star':
            case 'flag':
              await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
              break;

            case 'unstar':
            case 'unflag':
              await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
              break;

            case 'archive':
              // Move to Archive folder (try common names)
              // Q-1 FIX: Added logging to catch blocks for debugging
              try {
                await client.messageMove(uids, 'Archive', { uid: true });
              } catch (archiveErr) {
                this.logger.debug(`Archive folder not found, trying Gmail folder: ${archiveErr instanceof Error ? archiveErr.message : archiveErr}`);
                try {
                  await client.messageMove(uids, '[Gmail]/All Mail', { uid: true });
                } catch (gmailErr) {
                  this.logger.debug(`Gmail All Mail folder not found, marking as deleted: ${gmailErr instanceof Error ? gmailErr.message : gmailErr}`);
                  // If no archive folder, just remove from INBOX
                  await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
                }
              }
              break;

            case 'delete':
              if (options.permanent) {
                // Permanent delete - set \Deleted flag + EXPUNGE immediately
                await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
                // EXPUNGE removes messages marked as \Deleted from the server
                try {
                  await client.messageDelete(uids, { uid: true });
                } catch {
                  // Fallback: some servers may not support messageDelete
                  this.logger.debug('messageDelete not available, messages flagged as \\Deleted');
                }
                this.logger.log(`IMAP permanent delete: ${uids.length} messages from ${mailbox}`);
              } else {
                // Soft delete - move to Trash (recoverable)
                // Q-2 FIX: Added logging to catch blocks for debugging
                try {
                  await client.messageMove(uids, 'Trash', { uid: true });
                } catch (trashErr) {
                  this.logger.debug(`Trash folder not found, trying Gmail folder: ${trashErr instanceof Error ? trashErr.message : trashErr}`);
                  try {
                    await client.messageMove(uids, '[Gmail]/Trash', { uid: true });
                  } catch (gmailTrashErr) {
                    this.logger.debug(`Gmail Trash folder not found, marking as deleted: ${gmailTrashErr instanceof Error ? gmailTrashErr.message : gmailTrashErr}`);
                    await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
                  }
                }
              }
              break;

            case 'move':
              if (options.targetFolder) {
                await client.messageMove(uids, options.targetFolder, { uid: true });
              }
              break;

            case 'add-label':
              // IMAP uses folders, copy to target folder
              if (options.labelId) {
                await client.messageCopy(uids, options.labelId, { uid: true });
              }
              break;

            case 'remove-label':
              // Can't remove from folder via IMAP, would need to delete from that folder
              this.logger.debug('IMAP remove-label not directly supported');
              break;

            default:
              throw new Error(`Unsupported IMAP action: ${action}`);
          }

          totalProcessed += uids.length;
          this.logger.debug(`IMAP sync-back for ${mailbox}: ${action} for ${uids.length} messages`);
        } catch (folderError) {
          this.logger.error(`IMAP sync-back failed for folder ${mailbox}: ${folderError}`);
          // Continue with other folders
        }
      }

      this.logger.debug(`IMAP sync-back completed: ${action} for ${totalProcessed} total messages across ${messagesByFolder.size} folders`);
    } finally {
      await client.logout();
    }
  }

}
