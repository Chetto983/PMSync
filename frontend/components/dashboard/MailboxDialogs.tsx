import React from 'react';
import { Snackbar, Alert as MuiAlert } from '@mui/material';
import {
  ComposeDialog,
  AdvancedSearchDialog,
  type AdvancedSearchFilters,
  LabelSelectorDialog,
  FolderSelectorDialog,
} from '@/components/email';
import { LabelManager } from '@/components/labels';
import type { UseMailboxStateReturn } from './hooks/useMailboxState';

/**
 * Props for MailboxDialogs component
 */
interface MailboxDialogsProps {
  state: UseMailboxStateReturn;
  defaultProviderId?: string;
  onAdvancedSearch: (filters: AdvancedSearchFilters) => void;
  onBulkAddLabels: (labelIds: string[]) => void;
  onBulkMoveToFolder: (folder: string) => void;
  onSent: () => void;
  selectedCount: number;
}

/**
 * All dialog components for the Mailbox
 * Extracted to reduce main component complexity
 */
export function MailboxDialogs({
  state,
  defaultProviderId,
  onAdvancedSearch,
  onBulkAddLabels,
  onBulkMoveToFolder,
  onSent,
  selectedCount,
}: MailboxDialogsProps) {
  const {
    composeState,
    closeCompose,
    advancedSearchOpen,
    setAdvancedSearchOpen,
    advancedFilters,
    resetFilters,
    labelManagerOpen,
    setLabelManagerOpen,
    labelSelectorOpen,
    setLabelSelectorOpen,
    folderSelectorOpen,
    setFolderSelectorOpen,
    snackbar,
    closeSnackbar,
    showSnackbar,
  } = state;

  return (
    <>
      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          onClose={closeSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>

      {/* Compose Dialog */}
      <ComposeDialog
        open={composeState.open}
        mode={composeState.mode}
        defaultProviderId={defaultProviderId}
        prefillData={composeState.prefill ?? undefined}
        onClose={closeCompose}
        onSent={onSent}
        onError={(message) => showSnackbar(message, 'error')}
      />

      {/* Advanced Search Dialog */}
      <AdvancedSearchDialog
        open={advancedSearchOpen}
        initialFilters={advancedFilters}
        onClose={() => setAdvancedSearchOpen(false)}
        onSearch={onAdvancedSearch}
        onReset={resetFilters}
      />

      {/* Label Manager Dialog */}
      <LabelManager
        open={labelManagerOpen}
        onClose={() => setLabelManagerOpen(false)}
      />

      {/* Label Selector Dialog (for bulk actions) */}
      <LabelSelectorDialog
        open={labelSelectorOpen}
        onClose={() => setLabelSelectorOpen(false)}
        onSelect={onBulkAddLabels}
        selectedCount={selectedCount}
      />

      {/* Folder Selector Dialog (for bulk move) */}
      <FolderSelectorDialog
        open={folderSelectorOpen}
        onClose={() => setFolderSelectorOpen(false)}
        onSelect={onBulkMoveToFolder}
        selectedCount={selectedCount}
      />
    </>
  );
}
