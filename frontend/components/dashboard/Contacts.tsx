import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Tooltip,
  Snackbar,
} from '@mui/material';
import { Search, Menu, Download, Upload, ArrowUpDown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  ContactLayout,
  ContactList,
  ContactSidebar,
  ContactDetail,
  ContactBulkActionBar,
  VCardImportDialog,
  ContactMergeDialog,
} from '@/components/contacts';
import { useContactsPageData } from './contacts-page/useContactsPageData';
import { useContactsPageHandlers } from './contacts-page/useContactsPageHandlers';
import { useContactForm } from './contacts-page/useContactForm';
import { ContactFormDialog, DeleteContactDialog } from './contacts-page/ContactDialogs';
import { useGlobalToast } from '@/lib/context/toast-context';
import { crmImportExportApi } from '@/lib/api/crm-import-export';
import { ImportContactsDialog } from './crm-import/ImportContactsDialog';
import { useLeadScoreMap } from './crm-lead-score/useLeadScoreMap';
// ComposeDialog removed during email rebuild

export function Contacts() {
  const translations = useTranslations();
  const contactsCopy = translations.contacts;
  const toast = useGlobalToast();

  const data = useContactsPageData();
  const form = useContactForm();
  const handlers = useContactsPageHandlers(data, form, contactsCopy);
  const leadScoreMap = useLeadScoreMap();

  const {
    isMobile,
    loading,
    loadingMore,
    selectedContact,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    searchQuery,
    setSearchQuery,
    providers,
    syncingProviders,
    selectedProviderId,
    setSelectedProviderId,
    selectedFilter,
    setSelectedFilter,
    pagination,
    snackbar,
    setSnackbar,
    actionLoading,
    deleteDialogOpen,
    setDeleteDialogOpen,
    contactCounts,
    filteredContacts,
    providerFilters,
    selectedIds,
    toggleSelection,
    clearSelection,
    loadMore,
  } = data;

  const {
    contactForm,
    contactDialogOpen,
    setContactDialogOpen,
    contactDialogMode,
    handleContactFormChange,
  } = form;

  const {
    openCreateContactDialog,
    openEditContactDialog,
    handleSubmitContact,
    openDeleteDialog,
    handleDeleteContact,
    handleBulkDelete,
    handleSyncContacts,
    handleContactClick,
    handleCloseDetail,
    handleEmail,
    handleToggleVip,
    handleSelectAll,
    handleUndoBulkDelete,
    dismissUndo,
    undoDeletedIds,
  } = handlers;

  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [exportingContacts, setExportingContacts] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [vcardDialogOpen, setVcardDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  // Lead score sorting: null = off, 'desc' = high to low, 'asc' = low to high
  const [scoreSort, setScoreSort] = useState<'asc' | 'desc' | null>(null);

  const scoreSortedContacts = useMemo(() => {
    if (!scoreSort) return filteredContacts;
    return [...filteredContacts].sort((a, b) => {
      const sa = leadScoreMap.get(a.id)?.score ?? -1;
      const sb = leadScoreMap.get(b.id)?.score ?? -1;
      return scoreSort === 'desc' ? sb - sa : sa - sb;
    });
  }, [filteredContacts, scoreSort, leadScoreMap]);

  const handleToggleScoreSort = useCallback(() => {
    setScoreSort((prev) => {
      if (prev === null) return 'desc';
      if (prev === 'desc') return 'asc';
      return null;
    });
  }, []);

  const handleBulkDeleteRequest = useCallback(async () => {
    setBulkDeleteDialogOpen(true);
  }, []);

  const handleBulkDeleteConfirm = useCallback(() => {
    setBulkDeleteDialogOpen(false);
    void handleBulkDelete();
  }, [handleBulkDelete]);

  // Update provider on form when providers load
  const { updateProviderIdIfEmpty } = form;
  React.useEffect(() => {
    if (providers[0]?.id) {
      updateProviderIdIfEmpty(providers[0].id);
    }
  }, [providers, updateProviderIdIfEmpty]);

  React.useEffect(() => {
    if (!snackbar.open || !snackbar.message) return;
    toast[snackbar.severity](snackbar.message);
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, [setSnackbar, snackbar, toast]);

  // Render sidebar
  const renderSidebar = () => (
    <ContactSidebar
      providers={providerFilters}
      selectedProviderId={selectedProviderId}
      onProviderSelect={setSelectedProviderId}
      isSyncing={syncingProviders.size > 0}
      onSync={handleSyncContacts}
      onNewContact={openCreateContactDialog}
      onImportVCard={() => setVcardDialogOpen(true)}
      totalCount={contactCounts.total}
      withEmailCount={contactCounts.withEmail}
      withPhoneCount={contactCounts.withPhone}
      withCompanyCount={contactCounts.withCompany}
      selectedFilter={selectedFilter || undefined}
      onFilterSelect={setSelectedFilter}
    />
  );

  // Render list
  const renderList = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        {isMobile && (
          <IconButton
            size="small"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Menu"
            sx={{ ml: -0.5 }}
          >
            <Menu size={20} />
          </IconButton>
        )}
        <TextField
          fullWidth
          size="small"
          placeholder={contactsCopy.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            },
          }}
        />
        <Tooltip title={
          scoreSort === 'desc'
            ? (translations.leadScore?.list?.sortDesc ?? 'Score: high to low')
            : scoreSort === 'asc'
              ? (translations.leadScore?.list?.sortAsc ?? 'Score: low to high')
              : (translations.leadScore?.list?.column ?? 'Sort by lead score')
        }>
          <IconButton
            size="small"
            onClick={handleToggleScoreSort}
            color={scoreSort ? 'primary' : 'default'}
          >
            <ArrowUpDown size={18} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={() => setImportDialogOpen(true)}
          title={translations.crmImportExport?.importContacts ?? 'Import'}
        >
          <Upload size={18} />
        </IconButton>
        <IconButton
          size="small"
          disabled={exportingContacts}
          onClick={async () => {
            setExportingContacts(true);
            try {
              await crmImportExportApi.exportContactsXlsx({ search: searchQuery || undefined });
            } finally {
              setExportingContacts(false);
            }
          }}
          title={translations.crmImportExport?.exportContacts ?? 'Export'}
        >
          <Download size={18} />
        </IconButton>
      </Box>

      {selectedIds.size > 0 && (
        <ContactBulkActionBar
          selectedCount={selectedIds.size}
          totalCount={scoreSortedContacts.length}
          onSelectAll={handleSelectAll}
          onClearSelection={clearSelection}
          onDelete={handleBulkDeleteRequest}
          onMerge={() => setMergeDialogOpen(true)}
        />
      )}

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <ContactList
          contacts={scoreSortedContacts}
          selectedId={selectedContact?.id}
          selectedIds={selectedIds}
          isLoading={loading}
          isLoadingMore={loadingMore}
          leadScoreMap={leadScoreMap}
          onContactClick={handleContactClick}
          onToggleSelect={toggleSelection}
          onEdit={(id) => {
            const contact = scoreSortedContacts.find((c) => c.id === id);
            if (contact) {
              data.setSelectedContact(contact);
              openEditContactDialog();
            }
          }}
          onDelete={(id) => {
            const contact = scoreSortedContacts.find((c) => c.id === id);
            if (contact) openDeleteDialog(contact);
          }}
          onEmail={handleEmail}
          onToggleVip={handleToggleVip}
          onLoadMore={loadMore}
          hasMore={pagination.hasMore}
          emptyTitle={contactsCopy.noContactsFound}
          emptySubtitle={contactsCopy.selectContactMessage}
        />
      </Box>
    </Box>
  );

  // Render detail
  const renderDetail = () => (
    selectedContact ? (
      <ContactDetail
        contact={selectedContact}
        onEdit={openEditContactDialog}
        onDelete={() => openDeleteDialog(selectedContact)}
        onEmail={handleEmail}
        onClose={handleCloseDetail}
      />
    ) : null
  );

  return (
    <>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ContactLayout
          sidebar={renderSidebar()}
          list={renderList()}
          detail={renderDetail()}
          showDetail={!!selectedContact}
          onDetailClose={handleCloseDetail}
          sidebarOpen={mobileSidebarOpen}
          onSidebarClose={() => setMobileSidebarOpen(false)}
        />
      </Box>

      <ContactFormDialog
        open={contactDialogOpen}
        onClose={() => setContactDialogOpen(false)}
        mode={contactDialogMode}
        form={contactForm}
        onFormChange={handleContactFormChange}
        onSubmit={handleSubmitContact}
        providers={providers}
        actionLoading={actionLoading}
        contactsCopy={contactsCopy}
      />

      <DeleteContactDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteContact}
        actionLoading={actionLoading}
        contactsCopy={contactsCopy}
      />
      {/* Bulk delete confirmation dialog */}
      <Dialog open={bulkDeleteDialogOpen} onClose={() => setBulkDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{contactsCopy.alerts?.deleteConfirmTitle || 'Delete'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(contactsCopy.alerts?.bulkDeleteConfirm || 'Are you sure you want to delete {count} contact(s)? This action cannot be undone.').replace('{count}', String(selectedIds.size))}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialogOpen(false)}>{translations.common.cancel}</Button>
          <Button onClick={handleBulkDeleteConfirm} color="error" variant="contained" disabled={actionLoading}>
            {translations.common.delete}
          </Button>
        </DialogActions>
      </Dialog>

      <ImportContactsDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />

      <VCardImportDialog
        open={vcardDialogOpen}
        onClose={() => setVcardDialogOpen(false)}
      />

      <ContactMergeDialog
        open={mergeDialogOpen}
        onClose={() => setMergeDialogOpen(false)}
        contactA={(() => {
          const ids = [...selectedIds];
          return scoreSortedContacts.find((c) => c.id === ids[0]) ?? null;
        })()}
        contactB={(() => {
          const ids = [...selectedIds];
          return scoreSortedContacts.find((c) => c.id === ids[1]) ?? null;
        })()}
        onMergeComplete={() => {
          clearSelection();
          setMergeDialogOpen(false);
        }}
      />

      {/* Undo bulk delete snackbar — visible for 10 seconds after bulk delete */}
      <Snackbar
        open={undoDeletedIds.length > 0}
        autoHideDuration={10000}
        onClose={dismissUndo}
        message={contactsCopy.alerts?.deletedCount
          ? contactsCopy.alerts.deletedCount.replace('{count}', String(undoDeletedIds.length))
          : `Deleted ${undoDeletedIds.length} contacts`}
        action={
          <Button color="inherit" size="small" onClick={handleUndoBulkDelete}>
            {translations.common.undo ?? 'Undo'}
          </Button>
        }
      />
    </>
  );
}
