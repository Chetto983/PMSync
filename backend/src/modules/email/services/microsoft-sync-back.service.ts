import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EmailSyncOperation } from '../types/sync-back.types';

/**
 * Microsoft-specific sync-back operations.
 * Extracted from EmailSyncBackService for maintainability.
 */
@Injectable()
export class MicrosoftSyncBackService {
  private readonly logger = new Logger(MicrosoftSyncBackService.name);
  private readonly OPERATION_TIMEOUT_MS = 30000;

  constructor(private prisma: PrismaService) {}

  private async executeWithRetry<T>(
    action: () => Promise<T>,
    description: string,
    maxAttempts = 5,
    baseDelayMs = 500,
  ): Promise<T> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxAttempts) {
      try {
        return await this.withTimeout(action(), this.OPERATION_TIMEOUT_MS, description);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errObj = error as { code?: number; status?: number; response?: { status?: number }; message?: string };
        const status = errObj?.code || errObj?.status || errObj?.response?.status;
        const message = errObj?.message || '';
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
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error('All retry attempts failed');
  }

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
   * Get Microsoft well-known folder ID for a folder path or specialUse
   */
  async getMicrosoftFolderId(providerId: string, folderNameOrPath: string): Promise<string> {
    const wellKnownMap: Record<string, string> = {
      INBOX: 'inbox',
      SENT: 'sentitems',
      DRAFTS: 'drafts',
      TRASH: 'deleteditems',
      JUNK: 'junkemail',
      SPAM: 'junkemail',
      ARCHIVE: 'archive',
    };

    const upperName = folderNameOrPath.toUpperCase();
    if (wellKnownMap[upperName]) {
      return wellKnownMap[upperName];
    }

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
      if (folder.specialUse) {
        const mappedId = wellKnownMap[folder.specialUse.toUpperCase()];
        if (mappedId) {
          this.logger.debug(
            `Microsoft folder lookup: ${folderNameOrPath} -> specialUse=${folder.specialUse} -> ${mappedId}`,
          );
          return mappedId;
        }
      }
      this.logger.debug(`Microsoft folder lookup: ${folderNameOrPath} -> path=${folder.path}`);
      return folder.path;
    }

    this.logger.warn(
      `Microsoft folder ${folderNameOrPath} not found in DB for provider ${providerId}, using as-is`,
    );
    return folderNameOrPath;
  }

  /**
   * Sync a single operation to Microsoft Outlook
   */
  async syncToMicrosoft(operation: EmailSyncOperation, accessToken: string): Promise<void> {
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    switch (operation.operation) {
      case 'delete': {
        const trashFolderId = await this.getMicrosoftFolderId(operation.providerId, 'TRASH');
        await client
          .api(`/me/messages/${operation.externalId}/move`)
          .post({ destinationId: trashFolderId });
        break;
      }

      case 'moveToFolder': {
        const destFolderId = await this.getMicrosoftFolderId(
          operation.providerId,
          operation.folder || 'INBOX',
        );
        await client
          .api(`/me/messages/${operation.externalId}/move`)
          .post({ destinationId: destFolderId });
        break;
      }

      case 'markRead':
        await client.api(`/me/messages/${operation.externalId}`).patch({ isRead: true });
        break;

      case 'markUnread':
        await client.api(`/me/messages/${operation.externalId}`).patch({ isRead: false });
        break;

      case 'star':
        await client.api(`/me/messages/${operation.externalId}`).patch({ flag: { flagStatus: 'flagged' } });
        break;

      case 'unstar':
        await client.api(`/me/messages/${operation.externalId}`).patch({ flag: { flagStatus: 'notFlagged' } });
        break;

      case 'flag':
        await client.api(`/me/messages/${operation.externalId}`).patch({ flag: { flagStatus: 'flagged' } });
        break;

      case 'unflag':
        await client.api(`/me/messages/${operation.externalId}`).patch({ flag: { flagStatus: 'notFlagged' } });
        break;

      case 'hardDelete':
        await client.api(`/me/messages/${operation.externalId}`).delete();
        break;
    }
  }

  /**
   * Microsoft batch handling via Graph $batch (max 20 requests)
   */
  async syncMicrosoftBatch(
    accessToken: string,
    providerId: string,
    ops: EmailSyncOperation[],
    syncSingleOp: (op: EmailSyncOperation) => Promise<void>,
  ): Promise<void> {
    if (!ops.length) return;

    const client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    const requests: { method: string; url: string; id: string; headers?: Record<string, string>; body?: Record<string, unknown> }[] = [];
    let reqId = 1;

    const enqueue = (method: string, url: string, body?: Record<string, unknown>) => {
      requests.push({
        id: `${reqId++}`,
        method,
        url,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      });
    };

    const msTrashFolderId = await this.getMicrosoftFolderId(providerId, 'TRASH');

    for (const op of ops) {
      switch (op.operation) {
        case 'delete':
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
          const destId = await this.getMicrosoftFolderId(op.providerId, op.folder || 'INBOX');
          enqueue('POST', `/me/messages/${op.externalId}/move`, { destinationId: destId });
          break;
        }
        default:
          await syncSingleOp(op);
      }
    }

    if (!requests.length) return;

    const batches = this.chunk(requests, 20);
    for (const batch of batches) {
      const response = await this.executeWithRetry(
        () => client.api('/$batch').post({ requests: batch }),
        `ms batch (${batch.length})`,
      );

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
}
