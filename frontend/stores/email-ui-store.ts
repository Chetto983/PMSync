/**
 * Email UI Store (Zustand)
 *
 * Manages UI-only state for the email module:
 * - Selection state (multi-select)
 * - View state (list/thread, preview panel)
 * - Filter state (current folder, search)
 * - Compose state (modal visibility)
 *
 * NOTE: Email data is managed by TanStack Query, not this store.
 * This store only handles ephemeral UI state.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

export type EmailViewMode = 'list' | 'thread';
export type EmailDensity = 'compact' | 'comfortable' | 'spacious';

/**
 * Canonical folder types - matches backend CANONICAL_FOLDER_TYPES
 * Sources:
 * - RFC 6154 (IMAP LIST Extension for Special-Use Mailboxes)
 * - RFC 8457 (IMAP "$Important" Keyword)
 * - Microsoft Graph API wellKnownName
 * - Gmail API system labels
 *
 * @see https://www.rfc-editor.org/rfc/rfc6154.html
 * @see https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
 * @see https://developers.google.com/workspace/gmail/api/guides/labels
 */
export type SpecialFolder =
  // RFC 6154 standard special-use attributes
  | 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'JUNK' | 'ARCHIVE'
  | 'ALL' | 'FLAGGED' | 'STARRED' | 'IMPORTANT'
  // Common aliases
  | 'SCHEDULED' | 'SNOOZED'
  // Microsoft Graph wellKnownName values
  | 'OUTBOX' | 'CONVERSATIONHISTORY' | 'CONVERSATION HISTORY'
  | 'CLUTTER' | 'CONFLICTS' | 'LOCALFAILURES' | 'SERVERFAILURES' | 'SYNCISSUES'
  | 'DELETEDITEMS' | 'DELETED ITEMS' | 'SENTITEMS' | 'SENT ITEMS'
  | 'JUNKEMAIL' | 'JUNK EMAIL'
  // Gmail categories
  | 'CATEGORY_PERSONAL' | 'CATEGORY_SOCIAL' | 'CATEGORY_PROMOTIONS'
  | 'CATEGORY_UPDATES' | 'CATEGORY_FORUMS'
  // Gmail system labels
  | 'CHAT' | 'UNREAD';

export interface EmailFilters {
  specialUse?: SpecialFolder;
  providerId?: string;
  folderId?: string; // Track specific folder selection
  labelId?: string;
  isRead?: boolean;
  isImportant?: boolean;
  hasAttachments?: boolean;
  search?: string;
  startDate?: string;
  endDate?: string;
}

// Sidebar configuration
export interface SidebarConfig {
  width: number;
  minWidth: number;
  maxWidth: number;
  collapsedProviders: Set<string>; // Provider IDs that are collapsed
}

export interface ComposeState {
  isOpen: boolean;
  mode: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  replyToEmailId?: string;
  draftId?: string;
  initialTo?: string[];
  initialSubject?: string;
  initialBody?: string;
}

interface EmailUIState {
  // Selection
  selectedIds: Set<string>;
  lastSelectedId: string | null;

  // View
  viewMode: EmailViewMode;
  density: EmailDensity;
  previewPanelOpen: boolean;
  activeEmailId: string | null;
  activeThreadId: string | null;

  // Sidebar
  sidebar: SidebarConfig;

  // Filters
  filters: EmailFilters;

  // Compose
  compose: ComposeState;

  // Loading states (for optimistic UI)
  pendingActions: Set<string>; // emailIds with pending actions

  // Actions - Selection
  selectEmail: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  selectRange: (fromId: string, toId: string, allIds: string[]) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  // Actions - View
  setViewMode: (mode: EmailViewMode) => void;
  setDensity: (density: EmailDensity) => void;
  togglePreviewPanel: () => void;
  setActiveEmail: (id: string | null) => void;
  setActiveThread: (threadId: string | null) => void;

  // Actions - Filters
  setFilters: (filters: Partial<EmailFilters>) => void;
  setFolder: (folder: SpecialFolder) => void;
  setSearch: (search: string) => void;
  clearFilters: () => void;

  // Actions - Compose
  openCompose: (options?: Partial<ComposeState>) => void;
  openReply: (emailId: string, replyAll?: boolean) => void;
  openForward: (emailId: string) => void;
  openDraft: (draftId: string) => void;
  closeCompose: () => void;
  updateCompose: (updates: Partial<ComposeState>) => void;

  // Actions - Pending
  addPendingAction: (emailId: string) => void;
  removePendingAction: (emailId: string) => void;
  clearPendingActions: () => void;

  // Actions - Sidebar
  setSidebarWidth: (width: number) => void;
  toggleProviderCollapse: (providerId: string) => void;
  setProviderCollapsed: (providerId: string, collapsed: boolean) => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialComposeState: ComposeState = {
  isOpen: false,
  mode: 'new',
};

const initialFilters: EmailFilters = {
  specialUse: 'INBOX',
};

const initialSidebar: SidebarConfig = {
  width: 220,
  minWidth: 180,
  maxWidth: 350,
  collapsedProviders: new Set<string>(),
};

// =============================================================================
// Store
// =============================================================================

export const useEmailUIStore = create<EmailUIState>()(
  devtools(
    (set, get) => ({
      // Initial state
      selectedIds: new Set<string>(),
      lastSelectedId: null,
      viewMode: 'list',
      density: 'comfortable',
      previewPanelOpen: true,
      activeEmailId: null,
      activeThreadId: null,
      sidebar: initialSidebar,
      filters: initialFilters,
      compose: initialComposeState,
      pendingActions: new Set<string>(),

      // Selection actions
      selectEmail: (id) =>
        set({
          selectedIds: new Set([id]),
          lastSelectedId: id,
          activeEmailId: id,
        }),

      selectMultiple: (ids) =>
        set({
          selectedIds: new Set(ids),
          lastSelectedId: ids[ids.length - 1] ?? null,
        }),

      toggleSelection: (id) =>
        set((state) => {
          const newSelected = new Set(state.selectedIds);
          if (newSelected.has(id)) {
            newSelected.delete(id);
          } else {
            newSelected.add(id);
          }
          return {
            selectedIds: newSelected,
            lastSelectedId: id,
          };
        }),

      selectRange: (fromId, toId, allIds) =>
        set((state) => {
          const fromIndex = allIds.indexOf(fromId);
          const toIndex = allIds.indexOf(toId);
          if (fromIndex === -1 || toIndex === -1) return state;

          const start = Math.min(fromIndex, toIndex);
          const end = Math.max(fromIndex, toIndex);
          const rangeIds = allIds.slice(start, end + 1);

          return {
            selectedIds: new Set([...state.selectedIds, ...rangeIds]),
            lastSelectedId: toId,
          };
        }),

      selectAll: (ids) =>
        set({
          selectedIds: new Set(ids),
          lastSelectedId: ids[ids.length - 1] ?? null,
        }),

      clearSelection: () =>
        set({
          selectedIds: new Set<string>(),
          lastSelectedId: null,
        }),

      // View actions
      setViewMode: (mode) => set({ viewMode: mode }),

      setDensity: (density) => set({ density }),

      togglePreviewPanel: () =>
        set((state) => ({ previewPanelOpen: !state.previewPanelOpen })),

      setActiveEmail: (id) =>
        set({
          activeEmailId: id,
          selectedIds: id ? new Set([id]) : new Set<string>(),
        }),

      setActiveThread: (threadId) =>
        set({
          activeThreadId: threadId,
          viewMode: threadId ? 'thread' : 'list',
        }),

      // Filter actions
      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
          // Clear selection when filters change
          selectedIds: new Set<string>(),
          activeEmailId: null,
        })),

      setFolder: (folder) =>
        set({
          filters: { ...get().filters, specialUse: folder, labelId: undefined },
          selectedIds: new Set<string>(),
          activeEmailId: null,
        }),

      setSearch: (search) =>
        set((state) => ({
          filters: { ...state.filters, search: search || undefined },
        })),

      clearFilters: () =>
        set({
          filters: initialFilters,
          selectedIds: new Set<string>(),
          activeEmailId: null,
        }),

      // Compose actions
      openCompose: (options) =>
        set({
          compose: {
            ...initialComposeState,
            ...options,
            isOpen: true,
          },
        }),

      openReply: (emailId, replyAll = false) =>
        set({
          compose: {
            isOpen: true,
            mode: replyAll ? 'replyAll' : 'reply',
            replyToEmailId: emailId,
          },
        }),

      openForward: (emailId) =>
        set({
          compose: {
            isOpen: true,
            mode: 'forward',
            replyToEmailId: emailId,
          },
        }),

      openDraft: (draftId) =>
        set({
          compose: {
            isOpen: true,
            mode: 'draft',
            draftId,
          },
        }),

      closeCompose: () =>
        set({
          compose: initialComposeState,
        }),

      updateCompose: (updates) =>
        set((state) => ({
          compose: { ...state.compose, ...updates },
        })),

      // Pending actions
      addPendingAction: (emailId) =>
        set((state) => {
          const newPending = new Set(state.pendingActions);
          newPending.add(emailId);
          return { pendingActions: newPending };
        }),

      removePendingAction: (emailId) =>
        set((state) => {
          const newPending = new Set(state.pendingActions);
          newPending.delete(emailId);
          return { pendingActions: newPending };
        }),

      clearPendingActions: () => set({ pendingActions: new Set<string>() }),

      // Sidebar actions
      setSidebarWidth: (width) =>
        set((state) => ({
          sidebar: {
            ...state.sidebar,
            width: Math.max(state.sidebar.minWidth, Math.min(state.sidebar.maxWidth, width)),
          },
        })),

      toggleProviderCollapse: (providerId) =>
        set((state) => {
          const newCollapsed = new Set(state.sidebar.collapsedProviders);
          if (newCollapsed.has(providerId)) {
            newCollapsed.delete(providerId);
          } else {
            newCollapsed.add(providerId);
          }
          return {
            sidebar: { ...state.sidebar, collapsedProviders: newCollapsed },
          };
        }),

      setProviderCollapsed: (providerId, collapsed) =>
        set((state) => {
          const newCollapsed = new Set(state.sidebar.collapsedProviders);
          if (collapsed) {
            newCollapsed.add(providerId);
          } else {
            newCollapsed.delete(providerId);
          }
          return {
            sidebar: { ...state.sidebar, collapsedProviders: newCollapsed },
          };
        }),

      // Reset
      reset: () =>
        set({
          selectedIds: new Set<string>(),
          lastSelectedId: null,
          viewMode: 'list',
          density: 'comfortable',
          previewPanelOpen: true,
          activeEmailId: null,
          activeThreadId: null,
          sidebar: initialSidebar,
          filters: initialFilters,
          compose: initialComposeState,
          pendingActions: new Set<string>(),
        }),
    }),
    { name: 'email-ui-store' }
  )
);

// =============================================================================
// Selector Hooks (for performance)
// =============================================================================

export const useEmailSelection = () =>
  useEmailUIStore(
    useShallow((state) => ({
      selectedIds: state.selectedIds,
      selectedCount: state.selectedIds.size,
      hasSelection: state.selectedIds.size > 0,
    }))
  );

export const useEmailFilters = () =>
  useEmailUIStore((state) => state.filters);

export const useEmailCompose = () =>
  useEmailUIStore((state) => state.compose);

export const useEmailView = () =>
  useEmailUIStore(
    useShallow((state) => ({
      viewMode: state.viewMode,
      density: state.density,
      previewPanelOpen: state.previewPanelOpen,
      activeEmailId: state.activeEmailId,
      activeThreadId: state.activeThreadId,
    }))
  );

export const useEmailSidebar = () =>
  useEmailUIStore(
    useShallow((state) => ({
      width: state.sidebar.width,
      minWidth: state.sidebar.minWidth,
      maxWidth: state.sidebar.maxWidth,
      collapsedProviders: state.sidebar.collapsedProviders,
    }))
  );
