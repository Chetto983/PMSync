import { apiClient } from '../api-client';

// ===== TYPES =====

export type EmailLabel = {
  id: string;
  name: string;
  color?: {
    backgroundColor: string;
    textColor: string;
  } | null;
};

export type Email = {
  id: string;
  tenantId: string;
  providerId: string;
  externalId: string;
  threadId?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  folder: string;
  emailLabels?: { label: EmailLabel }[];
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
  size?: number;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
  attachments?: EmailAttachment[];
  hasCalendarInvite?: boolean;
  calendarInviteStatus?: 'pending' | 'accepted' | 'declined' | 'tentative';
  calendarInviteData?: ParsedCalendarInvite | null;
};

export type CalendarInviteAttendee = {
  email: string;
  name?: string;
  status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'CHAIR' | 'NON-PARTICIPANT';
  rsvp?: boolean;
};

export type ParsedCalendarInvite = {
  uid: string;
  method: 'REQUEST' | 'REPLY' | 'CANCEL' | 'PUBLISH' | 'ADD' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER';
  sequence: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  startTime: string | Date;
  endTime: string | Date;
  isAllDay: boolean;
  timezone?: string;
  recurrence?: string[];
  recurringEventId?: string;
  organizer: {
    email: string;
    name?: string;
  };
  attendees: CalendarInviteAttendee[];
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
  created?: string | Date;
  lastModified?: string | Date;
  rawIcs?: string;
};

export type EmailAttachment = {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
  storageType: string;
  storagePath?: string;
  isInline: boolean;
  createdAt: string;
};

export type EmailAttachmentUpload = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type SendEmailPayload = {
  providerId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
  attachments?: EmailAttachmentUpload[];
};

export type ReplyForwardEmailPayload = Omit<SendEmailPayload, 'providerId'>;

export type SendEmailResponse = {
  success: boolean;
  messageId: string;
};

export type EmailListFilters = {
  folder?: string;
  /** RFC 6154: Filter by folder specialUse type for aggregation (INBOX, SENT, TRASH, etc.) */
  specialUse?: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  search?: string;
  from?: string;
  to?: string;
  subject?: string;
  labelIds?: string[];
  startDate?: string;
  endDate?: string;
};

export type EmailListParams = {
  page?: number;
  limit?: number;
  providerId?: string;
  folder?: string;
  /** RFC 6154: Filter by folder specialUse type for aggregation (INBOX, SENT, TRASH, etc.) */
  specialUse?: string;
  /** Exclude emails in SPAM, JUNK, and TRASH folders */
  excludeTrashSpam?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  /** Provider-agnostic "important" = isStarred OR isFlagged */
  isImportant?: boolean;
  hasAttachments?: boolean;
  search?: string;
  from?: string;
  to?: string;
  subject?: string;
  labelIds?: string[];
  startDate?: string;
  endDate?: string;
};

export type EmailListResponse = {
  emails: Email[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type EmailStats = {
  total: number;
  unread: number;
  starred: number;
  important: number;
  today: number;
  thisWeek: number;
  attachments: number;
  byFolder: Record<string, number>;
  byProvider?: Record<string, number>;
};

export const getCalendarInvite = (emailId: string) =>
  apiClient.get<ParsedCalendarInvite>(`/emails/${emailId}/calendar-invite`);

export const respondToCalendarInvite = (
  emailId: string,
  response: 'accept' | 'decline' | 'tentative',
) =>
  apiClient.post<{ success: boolean; eventId?: string }>(
    `/emails/${emailId}/calendar-invite/respond`,
    { response },
  );

export type EmailUpdateData = {
  isRead?: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isDeleted?: boolean;
  isArchived?: boolean;
  folder?: string;
};

export type Conversation = {
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  snippet?: string;
  folder: string;
  labels?: string[];
  emailLabels?: { label: { id: string; name: string; color?: { backgroundColor: string; textColor: string } | null } }[];
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  receivedAt: string;
  sentAt: string;
  emailCount: number;
  latestEmailId: string;
};

export type ConversationsResponse = {
  conversations: Conversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

// ===== API CLIENT =====

export const emailApi = {
  /**
   * List emails with pagination and filters
   * GET /emails
   */
  listEmails(params?: EmailListParams) {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.providerId) queryParams.append('providerId', params.providerId);
    if (params?.folder) queryParams.append('folder', params.folder);
    // RFC 6154: specialUse for aggregating emails across providers (INBOX, SENT, TRASH, etc.)
    if (params?.specialUse) queryParams.append('specialUse', params.specialUse);
    if (params?.isRead !== undefined) queryParams.append('isRead', params.isRead.toString());
    if (params?.isStarred !== undefined) queryParams.append('isStarred', params.isStarred.toString());
    if (params?.isImportant !== undefined) queryParams.append('isImportant', params.isImportant.toString());
    if (params?.hasAttachments !== undefined) {
      queryParams.append('hasAttachments', params.hasAttachments.toString());
    }
    if (params?.search) queryParams.append('search', params.search);
    if (params?.from) queryParams.append('from', params.from);
    if (params?.to) queryParams.append('to', params.to);
    if (params?.subject) queryParams.append('subject', params.subject);
    if (params?.labelIds && params.labelIds.length > 0) {
      queryParams.append('labelIds', params.labelIds.join(','));
    }
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.excludeTrashSpam) queryParams.append('excludeTrashSpam', 'true');

    const query = queryParams.toString();
    return apiClient.get<EmailListResponse>(`/emails${query ? `?${query}` : ''}`);
  },

  /**
   * Get email by ID
   * GET /emails/:id
   */
  getEmail(id: string) {
    return apiClient.get<Email>(`/emails/${id}`);
  },

  /**
   * Get email statistics
   * GET /emails/stats
   */
  getStats(providerId?: string) {
    const query = providerId ? `?providerId=${providerId}` : '';
    return apiClient.get<EmailStats>(`/emails/stats${query}`);
  },

  /**
   * Search emails
   * GET /emails/search
   */
  searchEmails(query: string, providerId?: string, limit?: number) {
    const params = new URLSearchParams({ q: query });
    if (providerId) params.append('providerId', providerId);
    if (limit) params.append('limit', limit.toString());

    return apiClient.get<{ emails: Email[] }>(
      `/emails/search?${params.toString()}`
    );
  },

  /**
   * Update email (mark as read/unread, star, move to folder)
   * PATCH /emails/:id
   */
  updateEmail(id: string, data: EmailUpdateData) {
    return apiClient.patch<Email>(`/emails/${id}`, data);
  },

  /**
   * Delete email
   * DELETE /emails/:id
   */
  deleteEmail(id: string) {
    return apiClient.delete<void>(`/emails/${id}`);
  },

  /**
   * Bulk mark emails as read/unread
   * PATCH /emails/bulk/read
   */
  bulkMarkRead(emailIds: string[], isRead: boolean) {
    return apiClient.patch<{ updated: number }>(
      '/emails/bulk/read',
      { emailIds, isRead }
    );
  },

  /**
   * Bulk delete emails
   * DELETE /emails/bulk
   */
  bulkDelete(emailIds: string[]) {
    return apiClient.delete<{ deleted: number }>('/emails/bulk', {
      data: { emailIds },
    });
  },

  /**
   * Bulk star/unstar emails
   * PATCH /emails/bulk/star
   */
  bulkStar(emailIds: string[], isStarred: boolean) {
    return apiClient.patch<{ updated: number }>(
      '/emails/bulk/star',
      { emailIds, isStarred }
    );
  },

  /**
   * Bulk flag/unflag emails (mark as important)
   * PATCH /emails/bulk/flag
   */
  bulkFlag(emailIds: string[], isFlagged: boolean) {
    return apiClient.patch<{ updated: number }>(
      '/emails/bulk/flag',
      { emailIds, isFlagged }
    );
  },

  /**
   * Bulk move emails to folder
   * PATCH /emails/bulk/move
   */
  bulkMoveToFolder(emailIds: string[], folder: string) {
    return apiClient.patch<{ updated: number }>(
      '/emails/bulk/move',
      { emailIds, folder }
    );
  },

  /**
   * Bulk add labels to emails
   * PATCH /emails/bulk/labels/add
   */
  bulkAddLabels(emailIds: string[], labelIds: string[]) {
    return apiClient.patch<{ updated: number }>(
      '/emails/bulk/labels/add',
      { emailIds, labelIds }
    );
  },

  /**
   * Bulk remove labels from emails
   * PATCH /emails/bulk/labels/remove
   */
  bulkRemoveLabels(emailIds: string[], labelIds: string[]) {
    return apiClient.patch<{ updated: number }>(
      '/emails/bulk/labels/remove',
      { emailIds, labelIds }
    );
  },

  /**
   * Save or update a draft (autosave)
   * POST /emails/drafts
   */
  saveDraft(payload: {
    id?: string;
    providerId: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
  }) {
    return apiClient.post<Email>('/emails/drafts', payload);
  },

  /**
   * Get a draft by ID
   * GET /emails/drafts/:id
   */
  getDraft(id: string) {
    return apiClient.get<Email>(`/emails/drafts/${id}`);
  },

  /**
   * Delete a draft
   * DELETE /emails/drafts/:id
   */
  deleteDraft(id: string) {
    return apiClient.delete<void>(`/emails/drafts/${id}`);
  },

  /**
   * Trigger manual sync for a provider
   * POST /email-sync/sync/:providerId
   */
  syncProvider(providerId: string) {
    return apiClient.post<{ success: boolean; message: string }>(
      `/email-sync/sync/${providerId}`
    );
  },

  /**
   * Get email sync status
   * GET /email-sync/status
   */
  getSyncStatus() {
    return apiClient.get<Record<string, unknown>>('/email-sync/status');
  },

  // ===== SYNC MANAGEMENT ENDPOINTS =====

  /**
   * Get sync health summary (queues + webhooks)
   * GET /email-sync/health
   */
  getSyncHealth() {
    return apiClient.get<{
      queues: Record<string, unknown>;
      webhooks: Record<string, unknown>;
    }>('/email-sync/health');
  },

  /**
   * Get queue status for all queues
   * GET /email-sync/queues
   */
  getQueues() {
    return apiClient.get<Record<string, unknown>>('/email-sync/queues');
  },

  /**
   * Sync all providers (DANGEROUS - purges all emails first)
   * POST /email-sync/sync-all
   */
  syncAllProviders() {
    return apiClient.post<{
      success: boolean;
      deletedEmails: number;
      providersQueued: number;
      message: string;
    }>('/email-sync/sync-all');
  },

  /**
   * Pause a queue by priority
   * POST /email-sync/queues/:priority/pause
   */
  pauseQueue(priority: 'high' | 'normal' | 'low') {
    return apiClient.post<{ success: boolean; message: string }>(
      `/email-sync/queues/${priority}/pause`
    );
  },

  /**
   * Resume a queue by priority
   * POST /email-sync/queues/:priority/resume
   */
  resumeQueue(priority: 'high' | 'normal' | 'low') {
    return apiClient.post<{ success: boolean; message: string }>(
      `/email-sync/queues/${priority}/resume`
    );
  },

  /**
   * Clear all jobs from a queue (DANGEROUS)
   * POST /email-sync/queues/:priority/clear
   */
  clearQueue(priority: 'high' | 'normal' | 'low') {
    return apiClient.post<{ success: boolean; message: string }>(
      `/email-sync/queues/${priority}/clear`
    );
  },

  /**
   * Create webhook subscriptions for all eligible providers
   * POST /email-sync/webhooks/create-all
   */
  createAllWebhooks() {
    return apiClient.post<{
      success: boolean;
      created: number;
      failed: number;
      message: string;
    }>('/email-sync/webhooks/create-all');
  },

  /**
   * Manually trigger webhook renewal
   * POST /email-sync/webhooks/renew
   */
  renewWebhooks() {
    return apiClient.post<{ success: boolean; message: string }>(
      '/email-sync/webhooks/renew'
    );
  },

  /**
   * Get webhook system health status
   * GET /email-sync/webhooks/health
   */
  getWebhookHealth() {
    return apiClient.get<{
      webhooks: Record<string, unknown>;
      queues: Record<string, unknown>;
      syncSummary: Record<string, unknown>;
    }>('/email-sync/webhooks/health');
  },

  /**
   * Get conversations (threaded view of all emails)
   * GET /emails/conversations
   */
  getConversations(params?: { page?: number; limit?: number; providerId?: string; folder?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.providerId) queryParams.append('providerId', params.providerId);
    if (params?.folder) queryParams.append('folder', params.folder);

    const query = queryParams.toString();
    return apiClient.get<ConversationsResponse>(
      `/emails/conversations${query ? `?${query}` : ''}`
    );
  },

  /**
   * Get all emails in a thread/conversation
   * GET /emails/thread/:threadId
   */
  getThread(threadId: string) {
    return apiClient.get<Email[]>(`/emails/thread/${encodeURIComponent(threadId)}`);
  },

  /**
   * Fetch archived email from server
   * POST /emails/:id/fetch-archived
   */
  fetchArchivedEmail(id: string) {
    return apiClient.post<Email>(`/emails/${id}/fetch-archived`);
  },

  /**
   * Get retention statistics
   * GET /emails/retention/stats
   */
  getRetentionStats() {
    return apiClient.get<{
      totalEmails: number;
      archivedEmails: number;
      recentEmails: number;
      oldUnarchived: number;
      retentionDays: number;
      estimatedSpaceSavedMB: number;
    }>('/emails/retention/stats');
  },

  /**
   * Manually run retention policy
   * POST /emails/retention/run
   */
  runRetention(retentionDays?: number) {
    return apiClient.post<{ count: number; emailIds: string[] }>(
      '/emails/retention/run',
      { retentionDays }
    );
  },

  /**
   * Send a new email
   * POST /emails/send
   */
  sendEmail(payload: SendEmailPayload) {
    return apiClient.post<SendEmailResponse>('/emails/send', payload);
  },

  /**
   * Reply to an email
   * POST /emails/:id/reply
   */
  replyToEmail(emailId: string, payload: ReplyForwardEmailPayload) {
    return apiClient.post<SendEmailResponse>(
      `/emails/${emailId}/reply`,
      payload
    );
  },

  /**
   * Forward an email
   * POST /emails/:id/forward
   */
  forwardEmail(emailId: string, payload: ReplyForwardEmailPayload) {
    return apiClient.post<SendEmailResponse>(
      `/emails/${emailId}/forward`,
      payload
    );
  },

  /**
   * Download email attachment
   * GET /email/attachments/:attachmentId/download (blob)
   */
  downloadAttachment(attachmentId: string) {
    return apiClient.get<Blob>(`/email/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
  },

  /**
   * Get parsed calendar invite for an email
   */
  getCalendarInvite(emailId: string) {
    return getCalendarInvite(emailId);
  },

  /**
   * Respond to calendar invite
   */
  respondToCalendarInvite(emailId: string, response: 'accept' | 'decline' | 'tentative') {
    return respondToCalendarInvite(emailId, response);
  },

  // ===== CALENDAR INVITE MANAGEMENT =====

  /**
   * Send a new calendar/meeting invitation (REQUEST)
   * POST /emails/calendar-invite/send
   */
  sendCalendarInvite(payload: {
    providerId: string;
    to: Array<{ email: string; name?: string }>;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    summary: string;
    description?: string;
    location?: string;
    startTime: string | Date;
    endTime: string | Date;
    isAllDay?: boolean;
    timeZone?: string;
    recurrence?: string[];
    subject?: string;
  }) {
    return apiClient.post<{ success: boolean; eventId: string; messageId: string }>(
      '/emails/calendar-invite/send',
      payload
    );
  },

  /**
   * Cancel a calendar/meeting invitation (CANCEL)
   * POST /emails/calendar-invite/:eventId/cancel
   */
  cancelCalendarInvite(eventId: string, reason?: string) {
    return apiClient.post<{ success: boolean; eventId: string; messageId: string }>(
      `/emails/calendar-invite/${eventId}/cancel`,
      reason ? { reason } : undefined
    );
  },
};
