import { create } from 'zustand';

export interface EmailAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  isInline: boolean;
}

export interface EmailLabelData {
  id: string;
  name: string;
  color?: {
    backgroundColor: string;
    textColor: string;
  } | null;
}

export interface Email {
  id: string;
  providerId: string;
  externalId: string;
  threadId?: string;
  from: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body?: string;
  bodyPreview?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  receivedAt: string;
  isRead: boolean;
  isStarred?: boolean;
  isImportant?: boolean;
  emailLabels?: { label: EmailLabelData }[];
  folder?: string;
  hasAttachments?: boolean;
  attachments?: EmailAttachment[];
  inReplyTo?: string;
  references?: string;
}

/**
 * Email filter options
 */
export interface EmailFilter {
  folderId?: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  searchQuery?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Pagination state
 */
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface EmailState {
  emails: Email[];
  unreadCount: number;
  selectedEmail: Email | null;
  isLoading: boolean;

  // Filtering and search
  filters: EmailFilter;
  searchQuery: string;

  // Pagination
  pagination: PaginationState;

  // Multi-selection
  selectedIds: Set<string>;

  // Thread support
  threads: Map<string, string[]>; // threadId -> emailIds[]

  // Actions
  setEmails: (emails: Email[]) => void;
  appendEmails: (emails: Email[]) => void;
  addEmail: (email: Email) => void;
  updateEmail: (id: string, updates: Partial<Email>) => void;
  deleteEmail: (id: string) => void;
  setSelectedEmail: (email: Email | null) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (loading: boolean) => void;

  // Thread actions
  updateThread: (threadId: string, emailIds: string[]) => void;
  getThreadEmails: (threadId: string) => Email[];
  getEmailThread: (emailId: string) => Email[];

  // Filtering and search
  setFilters: (filters: EmailFilter) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;

  // Pagination
  setPagination: (pagination: Partial<PaginationState>) => void;
  loadMore: () => void;

  // Multi-selection
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectedIds: (ids: Set<string>) => void;

  // Bulk actions
  markAsRead: (ids: string[]) => void;
  markAsStarred: (ids: string[], starred: boolean) => void;
  markAsImportant: (ids: string[], important: boolean) => void;
  bulkDelete: (ids: string[]) => void;
  moveToFolder: (ids: string[], folderId: string) => void;

  // Reset
  reset: () => void;
}

export const useEmailStore = create<EmailState>((set, get) => ({
  emails: [],
  unreadCount: 0,
  selectedEmail: null,
  isLoading: false,
  filters: {},
  searchQuery: '',
  pagination: {
    page: 1,
    pageSize: 50,
    total: 0,
    hasMore: false,
  },
  selectedIds: new Set<string>(),
  threads: new Map<string, string[]>(),

  setEmails: (emails) => set({ emails }),

  appendEmails: (newEmails) =>
    set((state) => ({
      emails: [...state.emails, ...newEmails],
    })),

  addEmail: (email) =>
    set((state) => {
      console.log('[Email Store] addEmail called:', { id: email.id, subject: email.subject?.substring(0, 50) });

      // Prevent duplicates
      if (state.emails.some((e) => e.id === email.id)) {
        console.warn('[Email Store] Email already exists, skipping');
        return state;
      }

      console.log('[Email Store] Email added successfully');
      return {
        emails: [email, ...state.emails],
        unreadCount: !email.isRead ? state.unreadCount + 1 : state.unreadCount,
      };
    }),

  updateEmail: (id, updates) =>
    set((state) => {
      console.log('[Email Store] updateEmail called:', { id, hasFullEmail: updates && typeof updates === 'object' && 'id' in updates && 'subject' in updates });
      const emailIndex = state.emails.findIndex((e) => e.id === id);

      // If email EXISTS, update it
      if (emailIndex !== -1) {
        console.log('[Email Store] Email found at index:', emailIndex);
        const oldEmail = state.emails[emailIndex];

        // Check if updates is a full email object (not just partial updates)
        const isFullEmail = typeof updates === 'object' && updates !== null &&
                           'id' in updates && 'subject' in updates && 'from' in updates;

        // If full email object, use it directly; otherwise merge with old email
        const newEmail = isFullEmail ? (updates as Email) : { ...oldEmail, ...updates };
        const newEmails = [...state.emails];
        newEmails[emailIndex] = newEmail;

        // Update unread count if isRead changed
        let newUnreadCount = state.unreadCount;
        if (oldEmail.isRead !== newEmail.isRead) {
          newUnreadCount += newEmail.isRead ? -1 : 1;
        }

        console.log('[Email Store] Email updated successfully, labels:', newEmail.emailLabels?.length ?? 0);
        return {
          emails: newEmails,
          unreadCount: Math.max(0, newUnreadCount),
          selectedEmail: state.selectedEmail?.id === id ? newEmail : state.selectedEmail,
        };
      }

      // Email doesn't exist - try to add it if updates is a full email object
      console.log('[Email Store] Email not found, attempting to add');
      if (typeof updates === 'object' && updates !== null && 'id' in updates && 'subject' in updates) {
        const newEmail = updates as Email;

        // Double-check it doesn't exist (defensive check for race conditions)
        if (state.emails.some((e) => e.id === newEmail.id)) {
          console.warn('[Email Store] Race condition: email now exists, retrying update');
          // Email appeared between checks - find it and update it
          const retryIndex = state.emails.findIndex((e) => e.id === newEmail.id);
          if (retryIndex !== -1) {
            const updatedEmails = [...state.emails];
            updatedEmails[retryIndex] = newEmail;
            console.log('[Email Store] Retried successfully');
            return {
              emails: updatedEmails,
              selectedEmail: state.selectedEmail?.id === id ? newEmail : state.selectedEmail,
            };
          }
          return state;
        }

        // Add new email to store
        console.log('[Email Store] Added new email to store');
        return {
          emails: [newEmail, ...state.emails],
          unreadCount: !newEmail.isRead ? state.unreadCount + 1 : state.unreadCount,
          selectedEmail: state.selectedEmail?.id === id ? newEmail : state.selectedEmail,
        };
      }

      // Can't update non-existent email with partial data
      console.warn(`[Email Store] Cannot update non-existent email ${id} with partial data, ignoring`);
      return state;
    }),

  deleteEmail: (id) =>
    set((state) => {
      console.log('[Email Store] deleteEmail called:', id);
      const email = state.emails.find((e) => e.id === id);

      if (!email) {
        console.warn('[Email Store] Email not found, cannot delete');
        return state;
      }

      console.log('[Email Store] Email deleted successfully');
      return {
        emails: state.emails.filter((e) => e.id !== id),
        unreadCount: !email.isRead ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        selectedEmail: state.selectedEmail?.id === id ? null : state.selectedEmail,
      };
    }),

  setSelectedEmail: (email) => set({ selectedEmail: email }),

  setUnreadCount: (count) => set({ unreadCount: count }),

  setLoading: (loading) => set({ isLoading: loading }),

  // Filtering and search
  setFilters: (filters) => set({ filters }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  clearFilters: () => set({ filters: {}, searchQuery: '' }),

  // Pagination
  setPagination: (pagination) =>
    set((state) => ({
      pagination: { ...state.pagination, ...pagination },
    })),

  loadMore: () =>
    set((state) => ({
      pagination: { ...state.pagination, page: state.pagination.page + 1 },
    })),

  // Multi-selection
  toggleSelection: (id) =>
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      return { selectedIds: newSelectedIds };
    }),

  selectAll: () =>
    set((state) => ({
      // Use threadId || id to match ThreadList/ThreadListItem logic
      selectedIds: new Set(state.emails.map((e) => e.threadId || e.id)),
    })),

  clearSelection: () => set({ selectedIds: new Set<string>() }),

  setSelectedIds: (ids) => set({ selectedIds: ids }),

  // Bulk actions
  markAsRead: (ids) =>
    set((state) => {
      const updatedEmails = state.emails.map((email) =>
        ids.includes(email.id) ? { ...email, isRead: true } : email
      );

      // Recalculate unread count
      const unreadCount = updatedEmails.filter((e) => !e.isRead).length;

      return {
        emails: updatedEmails,
        unreadCount,
      };
    }),

  markAsStarred: (ids, starred) =>
    set((state) => {
      const updatedEmails = state.emails.map((email) =>
        ids.includes(email.id) ? { ...email, isStarred: starred } : email
      );

      // Also update selectedEmail if it was starred/unstarred
      const updatedSelectedEmail = state.selectedEmail && ids.includes(state.selectedEmail.id)
        ? { ...state.selectedEmail, isStarred: starred }
        : state.selectedEmail;

      return {
        emails: updatedEmails,
        selectedEmail: updatedSelectedEmail,
      };
    }),

  markAsImportant: (ids, important) =>
    set((state) => {
      const updatedEmails = state.emails.map((email) =>
        ids.includes(email.id) ? { ...email, isImportant: important } : email
      );

      // Also update selectedEmail if it was marked as important/unimportant
      const updatedSelectedEmail = state.selectedEmail && ids.includes(state.selectedEmail.id)
        ? { ...state.selectedEmail, isImportant: important }
        : state.selectedEmail;

      return {
        emails: updatedEmails,
        selectedEmail: updatedSelectedEmail,
      };
    }),

  bulkDelete: (ids) =>
    set((state) => {
      const deletedEmails = state.emails.filter((e) => ids.includes(e.id));
      const deletedUnreadCount = deletedEmails.filter((e) => !e.isRead).length;

      return {
        emails: state.emails.filter((e) => !ids.includes(e.id)),
        unreadCount: Math.max(0, state.unreadCount - deletedUnreadCount),
        selectedEmail: state.selectedEmail && ids.includes(state.selectedEmail.id)
          ? null
          : state.selectedEmail,
      };
    }),

  moveToFolder: (ids, folderId) =>
    set((state) => {
      const updatedEmails = state.emails.map((email) =>
        ids.includes(email.id) ? { ...email, folder: folderId } : email
      );

      // Also update selectedEmail if it was moved
      const updatedSelectedEmail = state.selectedEmail && ids.includes(state.selectedEmail.id)
        ? { ...state.selectedEmail, folder: folderId }
        : state.selectedEmail;

      return {
        emails: updatedEmails,
        selectedEmail: updatedSelectedEmail,
      };
    }),

  // Thread actions
  updateThread: (threadId, emailIds) =>
    set((state) => {
      const newThreads = new Map(state.threads);
      newThreads.set(threadId, emailIds);
      return { threads: newThreads };
    }),

  getThreadEmails: (threadId) => {
    const state = get();
    const emailIds = state.threads.get(threadId) || [];
    return state.emails.filter((email) => emailIds.includes(email.id));
  },

  getEmailThread: (emailId) => {
    const state = get();
    const email = state.emails.find((e) => e.id === emailId);
    if (!email) return [];

    // If no threadId, return just this email
    if (!email.threadId) return [email];

    // First check the threads Map (for explicitly tracked threads from WebSocket)
    const threadEmailIds = state.threads.get(email.threadId) || [];
    if (threadEmailIds.length > 0) {
      return state.emails
        .filter((e) => threadEmailIds.includes(e.id))
        .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
    }

    // Fall back to finding all emails with the same threadId in the store
    const threadEmails = state.emails.filter((e) => e.threadId === email.threadId);
    return threadEmails.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  },

  reset: () =>
    set({
      emails: [],
      unreadCount: 0,
      selectedEmail: null,
      isLoading: false,
      filters: {},
      searchQuery: '',
      pagination: {
        page: 1,
        pageSize: 50,
        total: 0,
        hasMore: false,
      },
      selectedIds: new Set<string>(),
      threads: new Map<string, string[]>(),
    }),
}));
