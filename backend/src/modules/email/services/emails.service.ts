/**
 * EmailsService - Thin facade delegating to CRUD/Bulk/Search services
 *
 * Phase 4: Service Splits - Refactored from 1,705 lines to <200 lines.
 * All logic extracted to:
 * - EmailCrudService: Single email CRUD, drafts
 * - EmailBulkService: Bulk operations (read, starred, flagged, move, delete, labels)
 * - EmailSearchService: Search, stats, conversations, threads, attachments
 */
import { Injectable } from '@nestjs/common';
import { EmailCrudService, EmailListParams } from './email-crud.service';
import { EmailBulkService } from './email-bulk.service';
import { EmailSearchService } from './email-search.service';

// Re-export for backward compatibility
export type { EmailListParams } from './email-crud.service';
export type { EmailListFilters } from './email-folder.service';

@Injectable()
export class EmailsService {
  constructor(
    private readonly crud: EmailCrudService,
    private readonly bulk: EmailBulkService,
    private readonly search: EmailSearchService,
  ) {}

  // ========== CRUD OPERATIONS (delegated to crud service) ==========

  listEmails(params: EmailListParams) {
    return this.crud.listEmails(params);
  }

  getEmailById(id: string, tenantId: string, includeDeleted = false) {
    return this.crud.getEmailById(id, tenantId, includeDeleted);
  }

  getEmailsByIds(ids: string[], tenantId: string) {
    return this.crud.getEmailsByIds(ids, tenantId);
  }

  updateEmail(
    id: string,
    tenantId: string,
    data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    return this.crud.updateEmail(id, tenantId, data);
  }

  deleteEmail(id: string, tenantId: string) {
    return this.crud.deleteEmail(id, tenantId);
  }

  // ========== DRAFT OPERATIONS (delegated to crud service) ==========

  saveDraft(
    tenantId: string,
    dto: {
      id?: string;
      providerId: string;
      threadId?: string;
      inReplyTo?: string;
      references?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      attachments?: {
        filename: string;
        contentType: string;
        size?: number;
        contentBase64?: string;
      }[];
    },
  ) {
    return this.crud.saveDraft(tenantId, dto);
  }

  getDraft(id: string, tenantId: string) {
    return this.crud.getDraft(id, tenantId);
  }

  deleteDraft(id: string, tenantId: string) {
    return this.crud.deleteDraft(id, tenantId);
  }

  // ========== BULK OPERATIONS (delegated to bulk service) ==========

  bulkUpdateRead(emailIds: string[], tenantId: string, isRead: boolean) {
    return this.bulk.bulkUpdateRead(emailIds, tenantId, isRead);
  }

  bulkUpdateStarred(emailIds: string[], tenantId: string, isStarred: boolean) {
    return this.bulk.bulkUpdateStarred(emailIds, tenantId, isStarred);
  }

  bulkUpdateFlagged(emailIds: string[], tenantId: string, isFlagged: boolean) {
    return this.bulk.bulkUpdateFlagged(emailIds, tenantId, isFlagged);
  }

  bulkMoveToFolder(emailIds: string[], tenantId: string, folder: string) {
    return this.bulk.bulkMoveToFolder(emailIds, tenantId, folder);
  }

  bulkDelete(emailIds: string[], tenantId: string) {
    return this.bulk.bulkDelete(emailIds, tenantId);
  }

  bulkAddLabels(emailIds: string[], tenantId: string, labelIds: string[]) {
    return this.bulk.bulkAddLabels(emailIds, tenantId, labelIds);
  }

  bulkRemoveLabels(emailIds: string[], tenantId: string, labelIds: string[]) {
    return this.bulk.bulkRemoveLabels(emailIds, tenantId, labelIds);
  }

  // ========== SEARCH/STATS OPERATIONS (delegated to search service) ==========

  searchEmails(tenantId: string, query: string, providerId?: string, limit?: number) {
    return this.search.searchEmails(tenantId, query, providerId, limit);
  }

  getStats(tenantId: string, providerId?: string) {
    return this.search.getStats(tenantId, providerId);
  }

  getConversations(params: {
    tenantId: string;
    providerId?: string;
    folder?: string;
    page?: number;
    limit?: number;
  }) {
    return this.search.getConversations(params);
  }

  getThread(threadId: string, tenantId: string, includeDeleted = false) {
    return this.search.getThread(threadId, tenantId, includeDeleted);
  }

  getAttachmentDownloadUrl(emailId: string, attachmentId: string, tenantId: string) {
    return this.search.getAttachmentDownloadUrl(emailId, attachmentId, tenantId);
  }
}
