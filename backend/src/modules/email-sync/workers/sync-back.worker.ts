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
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
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
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';

@Injectable()
export class SyncBackWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncBackWorker.name);
  private redisConnection: Redis;
  private worker: Worker<SyncBackJobData, SyncBackJobResult>;

  private readonly CONCURRENCY = 5;
  private readonly BATCH_SIZE = 50; // Max emails per API call

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ProviderSyncBackQueueService))
    private readonly queueService: ProviderSyncBackQueueService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly cryptoService: CryptoService,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('SYNC_BACK_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';

    if (!workersEnabled) {
      this.logger.warn('Sync-back workers disabled via SYNC_BACK_WORKERS_ENABLED=false');
      return;
    }

    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.worker = new Worker<SyncBackJobData, SyncBackJobResult>(
      QUEUE_NAMES.PROVIDER_SYNC_BACK,
      async (job: Job<SyncBackJobData>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: this.CONCURRENCY,
        limiter: {
          max: 20, // Max 20 sync-back ops per minute
          duration: 60000,
        },
        lockDuration: 180000, // 3 minutes for bulk operations
        stalledInterval: 90000,
      },
    );

    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `Sync-back job ${job.id} completed: ${result.action} synced=${result.syncedCount} failed=${result.failedCount}`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Sync-back job ${job?.id} failed: ${error.message}`);
    });

    this.worker.on('error', (error) => {
      this.logger.error(`Sync-back worker error: ${error.message}`);
    });

    this.logger.log('Sync-back worker started');
  }

  private async processJob(job: Job<SyncBackJobData>): Promise<SyncBackJobResult> {
    const startTime = Date.now();
    const { tenantId, providerId, providerType, action, emailIds, externalIds, targetFolder, labelId } =
      job.data;

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
    options: { targetFolder?: string; labelId?: string; providerEmail?: string },
  ): Promise<void> {
    switch (providerType) {
      case 'google':
        await this.syncToGmail(accessToken, action, externalIds, options);
        break;
      case 'microsoft':
        await this.syncToMicrosoft(accessToken, action, externalIds, options);
        break;
      case 'imap':
        await this.syncToImap(options.providerEmail || '', action, externalIds, options);
        break;
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }

  private async syncToGmail(
    accessToken: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { labelId?: string },
  ): Promise<void> {
    // Gmail batch modify endpoint
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

  private async syncToMicrosoft(
    accessToken: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { targetFolder?: string },
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
            method = 'DELETE';
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

      // Check individual responses for errors
      const batchResponse = (await response.json()) as {
        responses: Array<{ id: string; status: number; body?: { error?: { message: string } } }>;
      };
      const errors: string[] = [];

      for (const res of batchResponse.responses) {
        // 200, 201, 204 are success codes
        if (res.status >= 400) {
          const messageId = batchIds[parseInt(res.id, 10) - 1];
          const errorMsg = res.body?.error?.message || `Status ${res.status}`;
          errors.push(`${messageId}: ${errorMsg}`);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Microsoft ${action} partially failed: ${errors.join('; ')}`);
      }
    }
  }

  private async syncToImap(
    providerEmail: string,
    action: SyncBackJobData['action'],
    externalIds: string[],
    options: { targetFolder?: string; labelId?: string },
  ): Promise<void> {
    // Get provider config for IMAP credentials
    const provider = await this.prisma.providerConfig.findFirst({
      where: { email: providerEmail, providerType: 'imap' },
    });

    if (!provider) {
      throw new Error(`IMAP provider not found for ${providerEmail}`);
    }

    const metadata = (provider as any).metadata || {};

    // Get IMAP configuration
    const imapHost = metadata.imapHost || 'imap.gmail.com';
    const imapPort = metadata.imapPort || 993;
    const imapSecure = metadata.imapSecure !== false;

    // Decrypt password
    let password: string;
    try {
      password = this.cryptoService.decrypt(provider.accessToken!, provider.tokenEncryptionIv!);
    } catch {
      throw new Error('Failed to decrypt IMAP password');
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
      await client.mailboxOpen('INBOX');

      // Convert external IDs to UIDs (assuming they are UID strings)
      const uids = externalIds.map((id) => parseInt(id, 10)).filter((uid) => !isNaN(uid));

      if (uids.length === 0) {
        this.logger.warn('No valid UIDs for IMAP sync-back');
        return;
      }

      // Execute action based on type
      switch (action) {
        case 'mark-read':
          await client.messageFlagsAdd(uids, ['\\Seen']);
          break;

        case 'mark-unread':
          await client.messageFlagsRemove(uids, ['\\Seen']);
          break;

        case 'star':
        case 'flag':
          await client.messageFlagsAdd(uids, ['\\Flagged']);
          break;

        case 'unstar':
        case 'unflag':
          await client.messageFlagsRemove(uids, ['\\Flagged']);
          break;

        case 'archive':
          // Move to Archive folder (try common names)
          try {
            await client.messageMove(uids, 'Archive');
          } catch {
            try {
              await client.messageMove(uids, '[Gmail]/All Mail');
            } catch {
              // If no archive folder, just remove from INBOX
              await client.messageFlagsAdd(uids, ['\\Deleted']);
            }
          }
          break;

        case 'delete':
          // Move to Trash or mark as deleted
          try {
            await client.messageMove(uids, 'Trash');
          } catch {
            try {
              await client.messageMove(uids, '[Gmail]/Trash');
            } catch {
              await client.messageFlagsAdd(uids, ['\\Deleted']);
            }
          }
          break;

        case 'move':
          if (options.targetFolder) {
            await client.messageMove(uids, options.targetFolder);
          }
          break;

        case 'add-label':
          // IMAP uses folders, copy to target folder
          if (options.labelId) {
            await client.messageCopy(uids, options.labelId);
          }
          break;

        case 'remove-label':
          // Can't remove from folder via IMAP, would need to delete from that folder
          this.logger.debug('IMAP remove-label not directly supported');
          break;

        default:
          throw new Error(`Unsupported IMAP action: ${action}`);
      }

      this.logger.debug(`IMAP sync-back completed: ${action} for ${uids.length} messages`);
    } finally {
      await client.logout();
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down sync-back worker (graceful drain)...');

    try {
      if (this.worker) {
        // Graceful shutdown: close with drain (waits for active jobs)
        // BullMQ worker.close() already waits for running jobs by default
        this.logger.log('Sync-back worker closing, waiting for in-flight jobs...');
        await this.worker.close();
      }

      if (this.redisConnection && this.redisConnection.status !== 'end') {
        await this.redisConnection.quit();
      }
    } catch (error) {
      this.logger.warn(
        `Sync-back worker shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    }

    this.logger.log('Sync-back worker stopped');
  }
}
