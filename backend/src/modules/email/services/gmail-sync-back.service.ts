import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import type { EmailSyncOperation } from '../types/sync-back.types';

/**
 * Gmail-specific sync-back operations.
 * Extracted from EmailSyncBackService for maintainability.
 */
@Injectable()
export class GmailSyncBackService {
  private readonly logger = new Logger(GmailSyncBackService.name);
  private readonly OPERATION_TIMEOUT_MS = 30000;

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
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('All retry attempts failed');
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
   * Sync a single operation to Gmail
   */
  async syncToGmail(operation: EmailSyncOperation, accessToken: string): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    switch (operation.operation) {
      case 'delete': {
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
        const deleteImmutableLabels = ['UNREAD', 'STARRED', 'IMPORTANT'];
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
      }

      case 'moveToFolder': {
        if (!operation.folder) {
          throw new Error('Target folder not specified for move operation');
        }
        const upperFolder = operation.folder.toUpperCase();

        if (upperFolder === 'SENT') {
          this.logger.warn(`Skipping move to SENT - Gmail applies this label automatically`);
          break;
        }

        const isArchive = upperFolder === 'ARCHIVE' || upperFolder === 'ALL';

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
        const immutableLabels = ['UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT'];

        let moveLabelsToAdd: string[];
        let moveLabelsToRemove: string[];

        if (isArchive) {
          moveLabelsToAdd = [];
          moveLabelsToRemove = currentLabels.includes('INBOX') ? ['INBOX'] : [];
        } else {
          const labelToAdd = operation.folder;
          moveLabelsToRemove = currentLabels.filter(
            (l) => !immutableLabels.includes(l) && l !== labelToAdd,
          );
          moveLabelsToAdd = [labelToAdd];
        }

        if (moveLabelsToAdd.length > 0 || moveLabelsToRemove.length > 0) {
          await this.executeWithRetry(
            () =>
              gmail.users.messages.modify({
                userId: 'me',
                id: operation.externalId,
                requestBody: {
                  addLabelIds: moveLabelsToAdd,
                  removeLabelIds: moveLabelsToRemove,
                },
              }),
            `gmail moveToFolder ${operation.externalId}`,
          );
        }
        break;
      }

      case 'markRead':
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: { removeLabelIds: ['UNREAD'] },
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
              requestBody: { addLabelIds: ['UNREAD'] },
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
              requestBody: { addLabelIds: ['STARRED'] },
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
              requestBody: { removeLabelIds: ['STARRED'] },
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
              requestBody: { addLabelIds: ['IMPORTANT'] },
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
              requestBody: { removeLabelIds: ['IMPORTANT'] },
            }),
          `gmail unflag ${operation.externalId}`,
        );
        break;

      case 'addLabel':
        if (!operation.labelExternalId) {
          throw new Error(`labelExternalId required for addLabel on email ${operation.emailId}`);
        }
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: { addLabelIds: [operation.labelExternalId!] },
            }),
          `gmail addLabel ${operation.externalId}`,
        );
        break;

      case 'removeLabel':
        if (!operation.labelExternalId) {
          throw new Error(`labelExternalId required for removeLabel on email ${operation.emailId}`);
        }
        await this.executeWithRetry(
          () =>
            gmail.users.messages.modify({
              userId: 'me',
              id: operation.externalId,
              requestBody: { removeLabelIds: [operation.labelExternalId!] },
            }),
          `gmail removeLabel ${operation.externalId}`,
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
   * Gmail batch handling to reduce concurrent requests (429)
   */
  async syncGmailBatch(
    accessToken: string,
    ops: EmailSyncOperation[],
    syncSingleOp: (op: EmailSyncOperation) => Promise<void>,
  ): Promise<void> {
    if (!ops.length) return;

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
    // Group addLabel/removeLabel by labelExternalId for batch modify
    const addLabelGroups = new Map<string, string[]>();
    const removeLabelGroups = new Map<string, string[]>();

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
        case 'addLabel':
          if (op.labelExternalId) {
            const group = addLabelGroups.get(op.labelExternalId) ?? [];
            group.push(op.externalId);
            addLabelGroups.set(op.labelExternalId, group);
          }
          break;
        case 'removeLabel':
          if (op.labelExternalId) {
            const group = removeLabelGroups.get(op.labelExternalId) ?? [];
            group.push(op.externalId);
            removeLabelGroups.set(op.labelExternalId, group);
          }
          break;
        case 'moveToFolder':
          if (op.folder?.toUpperCase() === 'TRASH') {
            moveToTrashIds.push(op.externalId);
          } else {
            await syncSingleOp(op);
          }
          break;
        default:
          await syncSingleOp(op);
      }
    }

    // Helper for chunked batchModify calls
    const batchModify = async (
      allIds: string[],
      body: { addLabelIds?: string[]; removeLabelIds?: string[] },
      label: string,
    ) => {
      for (const ids of this.chunk(allIds, 900)) {
        await this.executeWithRetry(
          () => gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids, ...body } }),
          `gmail batch${label} (${ids.length})`,
        );
      }
    };

    for (const ids of this.chunk(hardDeleteIds, 900)) {
      await this.executeWithRetry(
        () => gmail.users.messages.batchDelete({ userId: 'me', requestBody: { ids } }),
        `gmail batchDelete (${ids.length})`,
      );
    }

    await batchModify(moveToTrashIds, { addLabelIds: ['TRASH'] }, 'MoveToTrash');
    await batchModify(markReadIds, { removeLabelIds: ['UNREAD'] }, 'MarkRead');
    await batchModify(markUnreadIds, { addLabelIds: ['UNREAD'] }, 'MarkUnread');
    await batchModify(starIds, { addLabelIds: ['STARRED'] }, 'Star');
    await batchModify(unstarIds, { removeLabelIds: ['STARRED'] }, 'Unstar');
    await batchModify(flagIds, { addLabelIds: ['IMPORTANT'] }, 'Flag');
    await batchModify(unflagIds, { removeLabelIds: ['IMPORTANT'] }, 'Unflag');

    // Process addLabel groups (each group shares the same labelExternalId)
    for (const [labelId, msgIds] of addLabelGroups) {
      await batchModify(msgIds, { addLabelIds: [labelId] }, `AddLabel(${labelId})`);
    }

    // Process removeLabel groups
    for (const [labelId, msgIds] of removeLabelGroups) {
      await batchModify(msgIds, { removeLabelIds: [labelId] }, `RemoveLabel(${labelId})`);
    }

    this.logger.log(`[SYNC-BACK] Gmail batch sync completed`);
  }
}
