import React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Snackbar,
  Alert as MuiAlert,
  IconButton,
} from '@mui/material';
import { Search, Menu } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  ContactLayout,
  ContactList,
  ContactSidebar,
  ContactDetail,
  ContactBulkActionBar,
} from '@/components/contacts';
import { useContactsPageData } from './contacts-page/useContactsPageData';
import { useContactsPageHandlers } from './contacts-page/useContactsPageHandlers';
import { useContactForm } from './contacts-page/useContactForm';
import { ContactFormDialog, DeleteContactDialog } from './contacts-page/ContactDialogs';
// ComposeDialog removed during email rebuild

export function Contacts() {
  const translations = useTranslations();
  const contactsCopy = translations.contacts;

  const data = useContactsPageData();
  const form = useContactForm();
  const handlers = useContactsPageHandlers(data, form, contactsCopy);

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
  } = handlers;

  // Update provider on form when providers load
  React.useEffect(() => {
    if (providers[0]?.id) {
      form.updateProviderIdIfEmpty(providers[0].id);
    }
  }, [providers, form]);

  // Render sidebar
  const renderSidebar = () => (
    <ContactSidebar
      providers={providerFilters}
      selectedProviderId={selectedProviderId}
      onProviderSelect={setSelectedProviderId}
      isSyncing={syncingProviders.size > 0}
      onSync={handleSyncContacts}
      onNewContact={openCreateContactDialog}
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
      </Box>

      {selectedIds.size > 0 && (
        <ContactBulkActionBar
          selectedCount={selectedIds.size}
          totalCount={filteredContacts.length}
          onSelectAll={handleSelectAll}
          onClearSelection={clearSelection}
          onDelete={() => handleBulkDelete()}
        />
      )}

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <ContactList
          contacts={filteredContacts}
          selectedId={selectedContact?.id}
          selectedIds={selectedIds}
          isLoading={loading}
          isLoadingMore={loadingMore}
          onContactClick={handleContactClick}
          onToggleSelect={toggleSelection}
          onEdit={(id) => {
            const contact = filteredContacts.find((c) => c.id === id);
            if (contact) {
              data.setSelectedContact(contact);
              openEditContactDialog();
            }
          }}
          onDelete={(id) => {
            const contact = filteredContacts.find((c) => c.id === id);
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
      <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', overflow: 'hidden' }}>
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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>

      {/* ComposeDialog removed during email rebuild */}
    </>
  );
}
