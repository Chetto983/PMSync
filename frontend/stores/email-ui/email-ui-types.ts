/**
 * Email UI Store - Shared Types & Initial State
 *
 * All type definitions and initial state constants for the email UI store slices.
 */

import type { StateCreator } from 'zustand';

// =============================================================================
// Kanban Types
// =============================================================================

export type KanbanColumnId = 'inbox' | 'to-reply' | 'following-up' | 'done';

/**
 * Kanban column assignments - LOCAL ONLY state
 * Maps emailId -> columnId
 * NOTE: Backend persistence for kanban status is out of scope for this phase
 */
export type KanbanColumnAssignments = Record<string, KanbanColumnId>;

// =============================================================================
// Types
// =============================================================================

export type EmailViewMode = 'list' | 'thread' | 'kanban';
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
  from?: string;
  to?: string;
  subject?: string;
  startDate?: string;
  endDate?: string;
  /** Filter emails from VIP contacts only */
  fromVip?: boolean;
  /** Kanban column status filter (local state only) */
  kanbanStatus?: 'inbox' | 'to-reply' | 'following-up' | 'done';
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

export interface EmailUIState {
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

  // AI prompt bridge (ephemeral, not persisted)
  pendingAiPrompt: string | null;

  // Kanban state (LOCAL ONLY - not persisted to backend)
  kanbanAssignments: KanbanColumnAssignments;

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

  // Actions - AI prompt bridge
  setPendingAiPrompt: (prompt: string) => void;
  clearPendingAiPrompt: () => void;

  // Actions - Sidebar
  setSidebarWidth: (width: number) => void;
  toggleProviderCollapse: (providerId: string) => void;
  setProviderCollapsed: (providerId: string, collapsed: boolean) => void;

  // Actions - Kanban
  setEmailKanbanColumn: (emailId: string, columnId: KanbanColumnId) => void;
  moveEmailToColumn: (emailId: string, columnId: KanbanColumnId) => void;
  getEmailColumn: (emailId: string) => KanbanColumnId;
  clearKanbanAssignments: () => void;
  /** Remove kanban assignments for emails that no longer exist */
  pruneKanbanAssignments: (validEmailIds: Set<string>) => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Slice Creator Type
// =============================================================================

export type EmailUISlice<T> = StateCreator<EmailUIState, [], [], T>;

// =============================================================================
// Initial State Constants
// =============================================================================

export const initialComposeState: ComposeState = {
  isOpen: false,
  mode: 'new',
};

export const initialFilters: EmailFilters = {
  specialUse: 'INBOX',
};

export const initialSidebar: SidebarConfig = {
  width: 220,
  minWidth: 180,
  maxWidth: 350,
  collapsedProviders: new Set<string>(),
};
