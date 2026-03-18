/**
 * EmailBulkService - Bulk email operations
 * Extracted from emails.service.ts for maintainability (<500 lines)
 *
 * Responsibilities:
 * - Bulk mark read/unread
 * - Bulk star/unstar
 * - Bulk flag/unflag
 * - Bulk move to folder
 * - Bulk delete (soft/hard)
 * - Bulk add/remove labels
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { EmailFolderService } from './email-folder.service';
import { EmailCrudService } from './email-crud.service';

@Injectable()
export class EmailBulkService {
  private readonly logger = new Logger(EmailBulkService.name);

  /** Maximum emails per bulk operation to prevent DoS */
  private readonly MAX_BULK_EMAILS = 1000;

  constructor(
    private prisma: PrismaService,
    private emailSyncBack: EmailSyncBackService,
    private knowledgeBaseService: KnowledgeBaseService,
    private realtimeEvents: RealtimeEventsService,
    private folderService: EmailFolderService,
    private emailCrud: EmailCrudService,
  ) {}

  /**
   * Validate bulk operation input size
   * @throws BadRequestException if array exceeds limit
   */
  private validateBulkInput(ids: string[], operationName: string): void {
    if (!ids || ids.length === 0) {
      throw new BadRequestException(`${operationName}: No IDs provided`);
    }
    if (ids.length > this.MAX_BULK_EMAILS) {
      throw new BadRequestException(
        `${operationName}: Maximum ${this.MAX_BULK_EMAILS} items per operation (received ${ids.length})`,
      );
    }
  }

  /**
   * Mark multiple emails as read/unread - syncs to provider
   */
  async bulkUpdateRead(
    emailIds: string[],
    tenantId: string,
    isRead: boolean,
  ) {
    this.validateBulkInput(emailIds, 'bulkUpdateRead');

    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true,
      },
    });

    await this.emailCrud.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Track affected folders per provider for count updates
    const affectedFolders = new Map<string, Set<string>>();
    emails.forEach((email) => {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      if (email.folder) {
        affectedFolders.get(email.providerId)!.add(email.folder);
      }
    });

    // Update in database
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { isRead },
    });

    // Update folder counts (async, don't wait)
    for (const [providerId, folders] of affectedFolders.entries()) {
      this.folderService.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync to provider (async, don't wait)
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: isRead ? ('markRead' as const) : ('markUnread' as const),
      sourceFolder: email.folder,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk read update to provider: ${error.message}`);
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.emailCrud.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        threadId: email.threadId ?? undefined,
        email: email,
        reason: 'read-status-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk update starred status
   */
  async bulkUpdateStarred(
    emailIds: string[],
    tenantId: string,
    isStarred: boolean,
  ) {
    this.validateBulkInput(emailIds, 'bulkUpdateStarred');

    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true,
      },
    });

    await this.emailCrud.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Update in database - sync isStarred and isFlagged for UI consistency
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: {
        isStarred,
        isFlagged: isStarred,
      },
    });

    // Sync to provider (async, don't wait)
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: isStarred ? ('star' as const) : ('unstar' as const),
      sourceFolder: email.folder,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk starred update to provider: ${error.message}`);
    });

    const updatedEmails = await this.emailCrud.getEmailsByIds(emailIds, tenantId);

    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        threadId: email.threadId ?? undefined,
        email: email,
        reason: 'starred-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk flag/unflag emails (mark as important)
   */
  async bulkUpdateFlagged(
    emailIds: string[],
    tenantId: string,
    isFlagged: boolean,
  ) {
    this.validateBulkInput(emailIds, 'bulkUpdateFlagged');

    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true,
      },
    });

    await this.emailCrud.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Update in database - sync isFlagged and isStarred for UI consistency
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: {
        isFlagged,
        isStarred: isFlagged,
      },
    });

    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: isFlagged ? ('flag' as const) : ('unflag' as const),
      sourceFolder: email.folder,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk flagged update to provider: ${error.message}`);
    });

    const updatedEmails = await this.emailCrud.getEmailsByIds(emailIds, tenantId);

    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        threadId: email.threadId ?? undefined,
        email: email,
        reason: 'flagged-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk move emails to folder
   */
  async bulkMoveToFolder(
    emailIds: string[],
    tenantId: string,
    folder: string,
  ) {
    this.validateBulkInput(emailIds, 'bulkMoveToFolder');

    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true,
      },
    });

    await this.emailCrud.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Track affected folders per provider (source and destination)
    const affectedFolders = new Map<string, Set<string>>();
    emails.forEach((email) => {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      if (email.folder) {
        affectedFolders.get(email.providerId)!.add(email.folder);
      }
      affectedFolders.get(email.providerId)!.add(folder);
    });

    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { folder },
    });

    // Update folder counts (async, don't wait)
    for (const [providerId, folders] of affectedFolders.entries()) {
      this.folderService.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: 'moveToFolder' as const,
      sourceFolder: email.folder,
      folder,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk move to provider: ${error.message}`);
    });

    const updatedEmails = await this.emailCrud.getEmailsByIds(emailIds, tenantId);

    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        threadId: email.threadId ?? undefined,
        email: email,
        reason: 'folder-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk delete emails
   * - Already deleted: permanent delete from DB
   * - Not deleted: mark isDeleted and move to trash folder
   */
  async bulkDelete(emailIds: string[], tenantId: string) {
    this.validateBulkInput(emailIds, 'bulkDelete');

    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, externalId: true, providerId: true, tenantId: true, folder: true, isDeleted: true },
    });

    await this.knowledgeBaseService.deleteEmbeddingsForEmails(
      tenantId,
      emails.map((email) => email.id),
    );

    await this.emailCrud.ensureProvidersActive(tenantId, Array.from(new Set(emails.map((e) => e.providerId))));

    // Split: already deleted = hard delete, not deleted = soft delete
    const toHardDelete = emails.filter((e) => e.isDeleted);
    const toSoftDelete = emails.filter((e) => !e.isDeleted);

    this.logger.debug(`[bulkDelete] Processing ${toSoftDelete.length} soft, ${toHardDelete.length} hard deletes`);

    // Get trash folder paths for each provider
    const providerTrashFolders = new Map<string, string>();
    const uniqueProviderIds = Array.from(new Set(toSoftDelete.map((e) => e.providerId)));
    for (const providerId of uniqueProviderIds) {
      const trashFolder = await this.folderService.getTrashFolderPath(providerId);
      providerTrashFolders.set(providerId, trashFolder);
    }

    // Wrap all database operations in transaction for atomicity
    const { softDeleteCount, hardDeleteCount } = await this.prisma.$transaction(async (tx) => {
      let softCount = 0;
      let hardCount = 0;

      // Soft delete - group by provider since each may have different trash folder name
      for (const [providerId, trashFolder] of providerTrashFolders) {
        const emailsForProvider = toSoftDelete.filter((e) => e.providerId === providerId);
        if (emailsForProvider.length > 0) {
          const result = await tx.email.updateMany({
            where: { id: { in: emailsForProvider.map((e) => e.id) }, tenantId },
            data: { isDeleted: true, folder: trashFolder },
          });
          softCount += result.count;
        }
      }

      // Hard delete
      if (toHardDelete.length > 0) {
        const result = await tx.email.deleteMany({
          where: { id: { in: toHardDelete.map((e) => e.id) }, tenantId },
        });
        hardCount = result.count;
      }

      return { softDeleteCount: softCount, hardDeleteCount: hardCount };
    });

    const totalDeleted = softDeleteCount + hardDeleteCount;

    // Track affected folders for count updates
    const affectedFolders = new Map<string, Set<string>>();
    for (const email of emails) {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      affectedFolders.get(email.providerId)!.add(email.folder);
      const trashFolder = providerTrashFolders.get(email.providerId);
      if (trashFolder && !email.isDeleted) {
        affectedFolders.get(email.providerId)!.add(trashFolder);
      }
    }

    for (const [providerId, folders] of affectedFolders.entries()) {
      this.folderService.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync to provider
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: email.isDeleted ? 'hardDelete' as const : 'delete' as const,
      sourceFolder: email.folder,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`[BULK DELETE] Sync failed: ${error.message}`);
    });

    // Emit realtime events
    for (const email of [...toSoftDelete, ...toHardDelete]) {
      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'message-deleted',
      });
    }

    return { deleted: totalDeleted };
  }

  /**
   * Bulk add labels to emails
   */
  async bulkAddLabels(
    emailIds: string[],
    tenantId: string,
    labelIds: string[],
  ) {
    this.validateBulkInput(emailIds, 'bulkAddLabels');
    this.validateBulkInput(labelIds, 'bulkAddLabels (labels)');

    const [labels, emails] = await Promise.all([
      this.prisma.userLabel.findMany({
        where: {
          id: { in: labelIds },
          tenantId,
        },
        select: { id: true },
      }),
      this.prisma.email.findMany({
        where: { id: { in: emailIds }, tenantId },
        select: { id: true, providerId: true },
      }),
    ]);

    if (labels.length !== labelIds.length) {
      throw new NotFoundException('One or more labels not found');
    }

    const validatedEmailIds = emails.map((e) => e.id);
    if (validatedEmailIds.length === 0) {
      throw new NotFoundException('No valid emails found for this tenant');
    }

    await this.emailCrud.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Create email-label associations
    const emailLabelPairs = validatedEmailIds.flatMap((emailId) =>
      labelIds.map((labelId) => ({
        tenantId,
        emailId,
        labelId,
      }))
    );

    const result = await this.prisma.emailLabel.createMany({
      data: emailLabelPairs,
      skipDuplicates: true,
    });

    const updatedEmails = await this.emailCrud.getEmailsByIds(validatedEmailIds, tenantId);

    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        threadId: email.threadId ?? undefined,
        email: email,
        reason: 'labels-updated',
      });
    }

    for (const labelId of new Set(labelIds)) {
      this.realtimeEvents.emitLabelUpdate(tenantId, {
        labelId,
        reason: 'label-updated',
        timestamp: new Date().toISOString(),
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk remove labels from emails
   */
  async bulkRemoveLabels(
    emailIds: string[],
    tenantId: string,
    labelIds: string[],
  ) {
    this.validateBulkInput(emailIds, 'bulkRemoveLabels');
    this.validateBulkInput(labelIds, 'bulkRemoveLabels (labels)');

    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, providerId: true },
    });

    const validatedEmailIds = emails.map((e) => e.id);
    if (validatedEmailIds.length === 0) {
      return { deleted: 0, emails: [] };
    }

    await this.emailCrud.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    const validatedLabels = await this.prisma.userLabel.findMany({
      where: { id: { in: labelIds }, tenantId },
      select: { id: true },
    });
    if (validatedLabels.length !== labelIds.length) {
      throw new NotFoundException('One or more labels not found');
    }

    const result = await this.prisma.emailLabel.deleteMany({
      where: {
        emailId: { in: validatedEmailIds },
        labelId: { in: labelIds },
      },
    });

    const updatedEmails = await this.emailCrud.getEmailsByIds(validatedEmailIds, tenantId);

    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        threadId: email.threadId ?? undefined,
        email: email,
        reason: 'labels-updated',
      });
    }

    for (const labelId of new Set(labelIds)) {
      this.realtimeEvents.emitLabelUpdate(tenantId, {
        labelId,
        reason: 'label-updated',
        timestamp: new Date().toISOString(),
      });
    }

    return { deleted: result.count, emails: updatedEmails };
  }
}
