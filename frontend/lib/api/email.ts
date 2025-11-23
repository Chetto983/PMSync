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

export type ReplyForwardEmailPayload = Omit<SendEmailPayload, 'providerId'> & {
  providerId?: string;
};

export type SendEmailResponse = {
  success: boolean;
  messageId: string;
};

export type EmailListFilters = {
  folder?: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  search?: string;
  from?: string;
  startDate?: string;
  endDate?: string;
};

export type EmailListParams = {
  page?: number;
  limit?: number;
  providerId?: string;
  folder?: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  search?: string;
  from?: string;
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
  byFolder: Record<string, number>;
  byProvider?: Record<string, number>;
};

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

// AI Feature Types
export type SmartReply = {
  text: string;
  tone: string;
};

export type SmartReplyResponse = {
  replies: SmartReply[];
  emailId: string;
};

export type SummarizeResponse = {
  summary: string;
  emailId: string;
};

export type Category = {
  name: string;
  confidence: number;
  reasoning?: string;
};

export type CategorizeResponse = {
  categories: Category[];
  suggestedLabels: string[];
  emailId: string;
};

export type KnowledgeSearchResult = {
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

export type KnowledgeSearchResponse = {
  results: KnowledgeSearchResult[];
  totalResults: number;
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
    if (params?.isRead !== undefined) queryParams.append('isRead', params.isRead.toString());
    if (params?.isStarred !== undefined) queryParams.append('isStarred', params.isStarred.toString());
    if (params?.hasAttachments !== undefined) {
      queryParams.append('hasAttachments', params.hasAttachments.toString());
    }
    if (params?.search) queryParams.append('search', params.search);
    if (params?.from) queryParams.append('from', params.from);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

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
    return apiClient.get<Email[]>(`/emails/thread/${threadId}`);
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

  // ===== AI FEATURES =====

  /**
   * Generate smart reply suggestions for an email
   * POST /ai/smart-reply/:emailId
   */
  generateSmartReply(emailId: string, locale: string = 'it') {
    return apiClient.post<SmartReplyResponse>(`/ai/smart-reply/${emailId}`, {
      locale,
    });
  },

  /**
   * Summarize email content
   * POST /ai/summarize/:emailId
   */
  summarizeEmail(emailId: string, locale: string = 'it') {
    return apiClient.post<SummarizeResponse>(`/ai/summarize/${emailId}`, {
      locale,
    });
  },

  /**
   * Auto-categorize email and suggest labels
   * POST /ai/categorize/:emailId
   */
  categorizeEmail(emailId: string) {
    return apiClient.post<CategorizeResponse>(`/ai/categorize/${emailId}`);
  },

  /**
   * Search knowledge base using RAG
   * POST /ai/memory/search
   */
  searchKnowledge(query: string, limit: number = 5) {
    return apiClient.post<KnowledgeSearchResponse>('/ai/memory/search', {
      query,
      limit,
    });
  },
};
