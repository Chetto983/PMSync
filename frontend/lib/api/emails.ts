/**
 * Email API Module
 *
 * Provides typed API methods for all email operations.
 * Matches backend endpoints documented in EMAIL_FRONTEND_COMPREHENSIVE_ROADMAP.md
 *
 * Key Decision: Frontend uses ONLY `isImportant` (consolidated from star/flag)
 */

import { apiClient } from '../api-client';

// =============================================================================
// Types - Email Entity
// =============================================================================

export interface EmailAttachment {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string | null;
  storageType: string;
  storagePath?: string | null;
  isInline: boolean;
}

export interface EmailLabel {
  id: string;
  emailId: string;
  labelId: string;
  createdAt: string;
  label?: {
    id: string;
    name: string;
    color?: { backgroundColor: string; textColor: string } | null;
  };
}

export interface CalendarInviteAttendee {
  email: string;
  name?: string;
  status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'CHAIR' | 'NON-PARTICIPANT';
}

export interface ParsedCalendarInvite {
  uid: string;
  method: 'REQUEST' | 'REPLY' | 'CANCEL' | 'PUBLISH';
  summary: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  timezone?: string;
  organizer: { email: string; name?: string };
  attendees: CalendarInviteAttendee[];
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
}

export interface Email {
  id: string;
  tenantId: string;
  providerId: string;
  externalId: string;
  threadId?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  snippet?: string | null;
  folder: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  sentAt: string;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  size?: number | null;
  attachments?: EmailAttachment[];
  emailLabels?: EmailLabel[];
  hasCalendarInvite?: boolean;
  calendarInviteStatus?: 'pending' | 'accepted' | 'declined' | 'tentative';
  calendarInviteData?: ParsedCalendarInvite | null;
}

// =============================================================================
// Types - List Parameters
// =============================================================================

export interface ListEmailsParams {
  page?: number;
  limit?: number;
  providerId?: string;
  folder?: string;
  specialUse?: 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE';
  isRead?: boolean;
  isImportant?: boolean; // CONSOLIDATED: replaces isStarred/isFlagged
  hasAttachments?: boolean;
  search?: string;
  labelIds?: string;
  startDate?: string;
  endDate?: string;
  excludeTrashSpam?: boolean;
}

/**
 * Response from listEmails endpoint
 * Backend returns { emails, pagination: { page, limit, total, totalPages } }
 */
export interface ListEmailsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListEmailsResponse {
  emails: Email[];
  pagination: ListEmailsPagination;
}

export interface EmailThread {
  threadId: string;
  emails: Email[];
  subject: string;
  participants: string[];
  messageCount: number;
  unreadCount: number;
  latestDate: string;
  hasAttachments: boolean;
}

export interface EmailStats {
  total: number;
  unread: number;
  starred: number;
  important: number;
  today: number;
  thisWeek: number;
  attachments: number;
  byFolder: Record<string, number>;
}

// =============================================================================
// Types - Send/Reply/Forward DTOs
// =============================================================================

export interface SendEmailDto {
  providerId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: File[];
  replyToMessageId?: string;
  threadId?: string;
  /** ISO 8601 date string for scheduled send */
  scheduledAt?: string;
  /** Signature ID to append. Pass null to prevent backend from appending default signature. */
  signatureId?: string | null;
}

export interface ReplyEmailDto {
  bodyHtml: string;
  bodyText?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: File[];
  /** Signature ID to append. Pass null to prevent backend from appending default signature. */
  signatureId?: string | null;
}

export interface ForwardEmailDto {
  to: string[];
  cc?: string[];
  bcc?: string[];
  bodyHtml?: string;
  bodyText?: string;
  attachments?: File[];
  /** Signature ID to append. Pass null to prevent backend from appending default signature. */
  signatureId?: string | null;
}

// =============================================================================
// Types - Update DTOs
// =============================================================================

export interface UpdateEmailDto {
  isRead?: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isArchived?: boolean;
  folder?: string;
}

export interface BulkEmailIdsDto {
  emailIds: string[];
}

export interface BulkReadDto extends BulkEmailIdsDto {
  isRead: boolean;
}

export interface BulkFlagDto extends BulkEmailIdsDto {
  isFlagged: boolean; // Maps to "important" in UI
}

export interface BulkMoveDto extends BulkEmailIdsDto {
  targetFolder: string;
}

export interface BulkLabelsDto extends BulkEmailIdsDto {
  labelIds: string[];
}

// =============================================================================
// Types - Draft DTOs
// =============================================================================

/** Attachment DTO for draft saving (base64 encoded) */
export interface DraftAttachmentDto {
  filename: string;
  contentType: string;
  contentBase64: string;
  size?: number;
}

export interface SaveDraftDto {
  providerId: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  replyToMessageId?: string;
  threadId?: string;
  existingDraftId?: string;
  /** Attachments as base64-encoded data (for draft persistence) */
  attachments?: DraftAttachmentDto[];
}

export interface DraftResponse {
  id: string;
  email: Email;
}

// =============================================================================
// Types - Calendar Invite DTOs
// =============================================================================

export interface RespondToInviteDto {
  response: 'accepted' | 'declined' | 'tentative';
  comment?: string;
}

export interface SendInviteDto {
  providerId: string;
  to: string[];
  subject: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  timezone?: string;
}

// =============================================================================
// Types - Response Types (matching backend exactly)
// =============================================================================

/**
 * Response from send/reply/forward operations
 * Backend returns { success: boolean; messageId: string }, NOT the Email object
 */
export interface SendEmailResponse {
  success: boolean;
  messageId: string;
}

// Helper: Convert File to Base64 (exported for use in components)
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Result is like "data:mime/type;base64,....."
      // We return the full string, the backend handles stripping the prefix if needed
      // or we can strip it here. Backend decodeAttachments handles "data:..." prefix.
      resolve(reader.result as string);
    };
    reader.onerror = (error) => reject(error);
  });
}

// =============================================================================
// API Methods
// =============================================================================

export const emailsApi = {
  // -------------------------------------------------------------------------
  // List & Get
  // -------------------------------------------------------------------------

  async listEmails(params: ListEmailsParams = {}): Promise<ListEmailsResponse> {
    const response = await apiClient.get('/emails', { params });
    return response.data;
  },

  async getEmail(emailId: string): Promise<Email> {
    const response = await apiClient.get(`/emails/${emailId}`);
    // Backend returns email directly, not wrapped in { email }
    return response.data;
  },

  async searchEmails(query: string, limit = 100): Promise<Email[]> {
    const response = await apiClient.get('/emails/search', {
      params: { q: query, limit },
    });
    return response.data.emails;
  },

  async getStats(): Promise<EmailStats> {
    const response = await apiClient.get('/emails/stats');
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------------------

  async getConversations(params: ListEmailsParams = {}): Promise<EmailThread[]> {
    const response = await apiClient.get('/emails/conversations', { params });
    // Backend returns { conversations, pagination }
    return response.data.conversations;
  },

  async getThread(threadId: string): Promise<Email[]> {
    const response = await apiClient.get(`/emails/thread/${threadId}`);
    // Backend returns array directly, not wrapped in { emails }
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Send / Reply / Forward
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Send / Reply / Forward
  // -------------------------------------------------------------------------

  async sendEmail(dto: SendEmailDto): Promise<SendEmailResponse> {
    const attachments = await Promise.all(
      (dto.attachments || []).map(async (file) => ({
        filename: file.name,
        contentType: file.type,
        contentBase64: await fileToBase64(file),
        size: file.size,
      }))
    );

    const payload = {
      providerId: dto.providerId,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      bodyText: dto.bodyText,
      replyToMessageId: dto.replyToMessageId,
      threadId: dto.threadId,
      scheduledAt: dto.scheduledAt,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    try {
      const response = await apiClient.post('/emails/send', payload);
      return response.data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Send Email Error Payload:', JSON.stringify(payload, null, 2));
      // eslint-disable-next-line no-console
      console.error('Send Email Error Response:', JSON.stringify((error as any).response?.data, null, 2)); // eslint-disable-line @typescript-eslint/no-explicit-any
      throw error;
    }
  },

  async replyToEmail(emailId: string, dto: ReplyEmailDto): Promise<SendEmailResponse> {
    const attachments = await Promise.all(
      (dto.attachments || []).map(async (file) => ({
        filename: file.name,
        contentType: file.type,
        contentBase64: await fileToBase64(file),
        size: file.size,
      }))
    );

    const payload = {
      bodyHtml: dto.bodyHtml,
      bodyText: dto.bodyText,
      cc: dto.cc,
      bcc: dto.bcc,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const response = await apiClient.post(`/emails/${emailId}/reply`, payload);
    return response.data;
  },

  async forwardEmail(emailId: string, dto: ForwardEmailDto): Promise<SendEmailResponse> {
    const attachments = await Promise.all(
      (dto.attachments || []).map(async (file) => ({
        filename: file.name,
        contentType: file.type,
        contentBase64: await fileToBase64(file),
        size: file.size,
      }))
    );

    const payload = {
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      bodyHtml: dto.bodyHtml,
      bodyText: dto.bodyText,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const response = await apiClient.post(`/emails/${emailId}/forward`, payload);
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Update & Delete
  // -------------------------------------------------------------------------

  async updateEmail(emailId: string, dto: UpdateEmailDto): Promise<Email> {
    const response = await apiClient.patch(`/emails/${emailId}`, dto);
    // Backend returns email directly, not wrapped in { email }
    return response.data;
  },

  async deleteEmail(emailId: string): Promise<void> {
    await apiClient.delete(`/emails/${emailId}`);
  },

  // -------------------------------------------------------------------------
  // Bulk Operations
  // -------------------------------------------------------------------------

  async bulkDelete(emailIds: string[]): Promise<{ deleted: number }> {
    const response = await apiClient.delete('/emails/bulk', {
      data: { emailIds },
    });
    return response.data;
  },

  async bulkMarkRead(emailIds: string[], isRead: boolean): Promise<{ updated: number }> {
    const response = await apiClient.patch('/emails/bulk/read', { emailIds, isRead });
    return response.data;
  },

  async bulkMarkImportant(emailIds: string[], isImportant: boolean): Promise<{ updated: number }> {
    // Backend uses isFlagged, frontend consolidates as "important"
    const response = await apiClient.patch('/emails/bulk/flag', {
      emailIds,
      isFlagged: isImportant,
    });
    return response.data;
  },

  async bulkMove(emailIds: string[], targetFolder: string): Promise<{ moved: number }> {
    const response = await apiClient.patch('/emails/bulk/move', { emailIds, targetFolder });
    return response.data;
  },

  async bulkAddLabels(emailIds: string[], labelIds: string[]): Promise<{ updated: number }> {
    const response = await apiClient.patch('/emails/bulk/labels/add', { emailIds, labelIds });
    return response.data;
  },

  async bulkRemoveLabels(emailIds: string[], labelIds: string[]): Promise<{ updated: number }> {
    const response = await apiClient.patch('/emails/bulk/labels/remove', { emailIds, labelIds });
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Drafts
  // -------------------------------------------------------------------------

  async saveDraft(dto: SaveDraftDto): Promise<DraftResponse> {
    const response = await apiClient.post('/emails/drafts', dto);
    // Backend returns email directly, wrap it in DraftResponse format
    const email = response.data;
    return { id: email.id, email };
  },

  async getDraft(draftId: string): Promise<Email> {
    const response = await apiClient.get(`/emails/drafts/${draftId}`);
    // Backend returns email directly, not wrapped in { email }
    return response.data;
  },

  async deleteDraft(draftId: string): Promise<void> {
    await apiClient.delete(`/emails/drafts/${draftId}`);
  },

  // -------------------------------------------------------------------------
  // Calendar Invites
  // -------------------------------------------------------------------------

  async getCalendarInvite(emailId: string): Promise<ParsedCalendarInvite> {
    const response = await apiClient.get(`/emails/${emailId}/calendar-invite`);
    return response.data.invite;
  },

  async respondToCalendarInvite(
    emailId: string,
    dto: RespondToInviteDto
  ): Promise<{ success: boolean }> {
    const response = await apiClient.post(`/emails/${emailId}/calendar-invite/respond`, dto);
    return response.data;
  },

  async sendCalendarInvite(dto: SendInviteDto): Promise<Email> {
    const response = await apiClient.post('/emails/calendar-invite/send', dto);
    return response.data.email;
  },

  async cancelCalendarInvite(eventId: string): Promise<{ success: boolean }> {
    const response = await apiClient.post(`/emails/calendar-invite/${eventId}/cancel`);
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  async downloadAttachment(emailId: string, attachmentId: string): Promise<Blob> {
    const response = await apiClient.get(
      `/emails/${emailId}/attachments/${attachmentId}/download`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  async getAttachmentMetadata(
    attachmentId: string
  ): Promise<{ filename: string; mimeType: string; size: number }> {
    const response = await apiClient.get(`/email/attachments/${attachmentId}/metadata`);
    return response.data;
  },
};
