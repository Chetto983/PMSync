import { useState, useCallback } from 'react';
import type { ComposePrefillData } from '@/components/email/ComposeDialog/types';
import type { AdvancedSearchFilters } from '@/components/email';

/**
 * Dialog types that can be opened in the mailbox
 */
export type MailboxDialogType =
  | 'compose'
  | 'advancedSearch'
  | 'labelManager'
  | 'labelSelector'
  | 'folderSelector'
  | null;

/**
 * Snackbar notification state
 */
export interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

/**
 * Compose dialog state
 */
export interface ComposeState {
  open: boolean;
  mode: 'compose' | 'reply' | 'forward';
  prefill: ComposePrefillData | null;
}

/**
 * Props for useMailboxState hook
 */
interface UseMailboxStateProps {
  initialSearchQuery?: string;
}

/**
 * Centralized state management for Mailbox component
 * Consolidates all useState hooks into a single manageable hook
 */
export function useMailboxState({ initialSearchQuery }: UseMailboxStateProps = {}) {
  // Folder state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Compose state (consolidated)
  const [composeState, setComposeState] = useState<ComposeState>({
    open: false,
    mode: 'compose',
    prefill: null,
  });

  // Dialog states (consolidated)
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelSelectorOpen, setLabelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);

  // Search and filters
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({});

  // Snackbar notifications
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Sync state
  const [syncLoading, setSyncLoading] = useState(false);

  // Mobile sidebar
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Conversation vs list view (persisted to localStorage)
  const [forceConversationView, setForceConversationView] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('mailagent-conversation-view');
    return stored === 'true' ? true : stored === 'false' ? false : true;
  });

  // Compose handlers
  const openCompose = useCallback((mode: 'compose' | 'reply' | 'forward' = 'compose', prefill: ComposePrefillData | null = null) => {
    setComposeState({ open: true, mode, prefill });
  }, []);

  const closeCompose = useCallback(() => {
    setComposeState({ open: false, mode: 'compose', prefill: null });
  }, []);

  // View toggle
  const toggleConversationView = useCallback(() => {
    setForceConversationView(prev => {
      const newValue = prev === null ? false : !prev;
      localStorage.setItem('mailagent-conversation-view', String(newValue));
      return newValue;
    });
  }, []);

  // Snackbar helpers
  const showSnackbar = useCallback((message: string, severity: SnackbarState['severity'] = 'info') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  const closeSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  // Reset filters
  const resetFilters = useCallback(() => {
    setAdvancedFilters({});
  }, []);

  return {
    // Folder state
    selectedFolderId,
    setSelectedFolderId,
    foldersLoading,
    setFoldersLoading,

    // Compose state
    composeState,
    setComposeState,
    openCompose,
    closeCompose,

    // Dialog states
    advancedSearchOpen,
    setAdvancedSearchOpen,
    labelManagerOpen,
    setLabelManagerOpen,
    labelSelectorOpen,
    setLabelSelectorOpen,
    folderSelectorOpen,
    setFolderSelectorOpen,

    // Search and filters
    advancedFilters,
    setAdvancedFilters,
    resetFilters,
    initialSearchQuery,

    // Snackbar
    snackbar,
    showSnackbar,
    closeSnackbar,

    // Sync
    syncLoading,
    setSyncLoading,

    // Mobile
    mobileSidebarOpen,
    setMobileSidebarOpen,

    // View mode
    forceConversationView,
    toggleConversationView,
  };
}

export type UseMailboxStateReturn = ReturnType<typeof useMailboxState>;
