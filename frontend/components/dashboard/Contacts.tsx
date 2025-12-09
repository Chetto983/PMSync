import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert as MuiAlert,
  DialogContentText,
  Typography,
} from '@mui/material';
import { Search } from 'lucide-react';
import { contactsApi, type Contact, type ContactCounts } from '@/lib/api/contacts';
import { logger } from '@/lib/logger';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContactStore } from '@/stores/contact-store';
import { websocketClient, type RealtimeContactEvent, type RealtimeSyncStatus, type RealtimeContactCountsEvent } from '@/lib/websocket-client';
import {
  ContactLayout,
  ContactList,
  ContactSidebar,
  ContactDetail,
  ContactBulkActionBar,
  type ProviderFilter,
} from '@/components/contacts';
import { ComposeDialog } from '@/components/email/ComposeDialog/ComposeDialog';

type ContactFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  department: string;
  birthday: string;
  website: string;
  notes: string;
  providerId?: string;
};

const getPrimaryEmail = (contact?: Contact | null) =>
  contact?.emails?.find((email) => email.primary)?.value ||
  contact?.emails?.[0]?.value ||
  '';

const getPrimaryPhone = (contact?: Contact | null) =>
  contact?.phoneNumbers?.find((phone) => phone.primary)?.value ||
  contact?.phoneNumbers?.[0]?.value ||
  '';

export function Contacts() {
  const translations = useTranslations();
  const contactsCopy = translations.contacts;

  // Store state
  const {
    contacts: storeContacts,
    setContacts: setStoreContacts,
    selectedIds,
    toggleSelection,
    clearSelection,
    setSelectedIds,
  } = useContactStore();

  // Local state
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [syncingProviders, setSyncingProviders] = useState<Set<string>>(new Set());
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, hasMore: true, total: 0 });

  // Dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogMode, setContactDialogMode] = useState<'create' | 'edit'>('create');
  const [contactForm, setContactForm] = useState<ContactFormState>({
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    phone: '',
    company: '',
    jobTitle: '',
    department: '',
    birthday: '',
    website: '',
    notes: '',
    providerId: undefined,
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Contact counts from DB (fast, efficient)
  const [contactCounts, setContactCounts] = useState<ContactCounts>({
    total: 0,
    withEmail: 0,
    withPhone: 0,
    withCompany: 0,
    byProvider: [],
  });

  // Compose dialog state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeToEmail, setComposeToEmail] = useState<string>('');

  // Refs
  const selectedContactIdRef = useRef<string | null>(null);
  const paginationRef = useRef({ offset: 0, limit: 200, hasMore: true, total: 0 });

  // Sync refs with state
  useEffect(() => {
    selectedContactIdRef.current = selectedContact?.id ?? null;
  }, [selectedContact]);

  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load contacts - using larger batch size for faster bulk loading
  const loadContacts = useCallback(async (reset: boolean = true) => {
    try {
      if (reset) {
        setLoading(true);
        const newPagination = { offset: 0, limit: 200, hasMore: true, total: 0 };
        paginationRef.current = newPagination;
        setPagination(newPagination);
      } else {
        setLoadingMore(true);
      }

      const offset = reset ? 0 : paginationRef.current.offset;
      const response = await contactsApi.listContacts({
        search: debouncedSearchQuery || undefined,
        limit: paginationRef.current.limit,
        offset,
      });
      const contactsData = response.contacts || [];

      if (reset) {
        setStoreContacts(contactsData);
      } else {
        const currentContacts = useContactStore.getState().contacts;
        const merged = [...currentContacts, ...contactsData];
        setStoreContacts(merged);
      }

      const newPagination = {
        offset: offset + contactsData.length,
        limit: paginationRef.current.limit,
        hasMore: contactsData.length === paginationRef.current.limit,
        total: response.total,
      };
      paginationRef.current = newPagination;
      setPagination(newPagination);

      if (contactsData.length === 0 && reset) {
        setSelectedContact(null);
        return;
      }

      const previouslySelectedId = selectedContactIdRef.current;
      const currentContactsForSelection = useContactStore.getState().contacts;
      const updatedSelection =
        (previouslySelectedId && (reset ? contactsData : currentContactsForSelection).find((c) => c.id === previouslySelectedId)) ||
        (reset ? contactsData[0] : currentContactsForSelection[0] || contactsData[0]);
      setSelectedContact(updatedSelection);
    } catch (error) {
      logger.error('Failed to load contacts', { error });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearchQuery, setStoreContacts, setPagination]);

  // Keep selection in sync with store updates
  useEffect(() => {
    if (!storeContacts.length) {
      setSelectedContact(null);
      return;
    }
    if (!selectedContact || !storeContacts.find((c) => c.id === selectedContact.id)) {
      setSelectedContact(storeContacts[0]);
    }
  }, [storeContacts, selectedContact]);

  // Load more contacts (infinite scroll)
  const loadMore = useCallback(() => {
    if (!loadingMore && pagination.hasMore) {
      loadContacts(false);
    }
  }, [loadContacts, loadingMore, pagination.hasMore]);

  // Initial load
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Load contact counts from DB (efficient - runs once on mount)
  const loadContactCounts = useCallback(async () => {
    try {
      const counts = await contactsApi.getContactCounts();
      setContactCounts(counts);
    } catch (error) {
      logger.error('Failed to load contact counts', { error });
    }
  }, []);

  useEffect(() => {
    loadContactCounts();
  }, [loadContactCounts]);

  // WebSocket event handling
  useEffect(() => {
    const handleContactNew = async (event: RealtimeContactEvent) => {
      logger.debug('[Contacts] WebSocket: contact:new', { event });
      if (event.contactId) {
        try {
          const contact = await contactsApi.getContact(event.contactId);
          useContactStore.getState().addContact(contact);
        } catch (error) {
          logger.error('Failed to fetch new contact', { error });
        }
      }
    };

    const handleContactUpdate = async (event: RealtimeContactEvent) => {
      logger.debug('[Contacts] WebSocket: contact:update', { event });
      if (event.contactId) {
        try {
          const contact = await contactsApi.getContact(event.contactId);
          useContactStore.getState().updateContact(event.contactId, contact);
        } catch (error) {
          logger.error('Failed to fetch updated contact', { error });
        }
      }
    };

    const handleContactDelete = (event: RealtimeContactEvent) => {
      logger.debug('[Contacts] WebSocket: contact:delete', { event });
      if (event.contactId) {
        useContactStore.getState().deleteContact(event.contactId);
      }
    };

    const handleSyncStatus = (event: RealtimeSyncStatus) => {
      if (event.status === 'completed') {
        logger.info('[Contacts] WebSocket: sync completed', { providerId: event.providerId });
        setSyncingProviders((prev) => {
          const next = new Set(prev);
          next.delete(event.providerId);
          return next;
        });
      }
    };

    // Real-time contact counts updates from DB
    const handleContactCounts = (event: RealtimeContactCountsEvent) => {
      logger.debug('[Contacts] WebSocket: contact:counts', { event });
      setContactCounts({
        total: event.total,
        withEmail: event.withEmail,
        withPhone: event.withPhone,
        withCompany: event.withCompany,
        byProvider: event.byProvider,
      });
    };

    const unsubNew = websocketClient.onContactNew(handleContactNew);
    const unsubUpdate = websocketClient.onContactUpdate(handleContactUpdate);
    const unsubDelete = websocketClient.onContactDelete(handleContactDelete);
    const unsubSync = websocketClient.onSyncStatus(handleSyncStatus);
    const unsubCounts = websocketClient.onContactCounts(handleContactCounts);

    return () => {
      unsubNew();
      unsubUpdate();
      unsubDelete();
      unsubSync();
      unsubCounts();
    };
  }, []);

  // Load providers
  const loadProviders = useCallback(async () => {
    try {
      const providerData = await providersApi.getProviders();
      setProviders(providerData || []);
      setContactForm((prev) => ({
        ...prev,
        providerId: prev.providerId || providerData?.[0]?.id,
      }));
    } catch (error) {
      logger.error('Failed to load providers', { error });
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Filter contacts based on selected provider and quick filter
  const filteredContacts = useMemo(() => {
    let result = storeContacts;

    // Filter by provider
    if (selectedProviderId) {
      result = result.filter((c) =>
        c.providerContacts?.some((pc) => pc.providerId === selectedProviderId)
      );
    }

    // Filter by quick filters
    if (selectedFilter === 'hasEmail') {
      result = result.filter((c) => c.emails && c.emails.length > 0);
    } else if (selectedFilter === 'hasPhone') {
      result = result.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
    } else if (selectedFilter === 'hasCompany') {
      result = result.filter((c) => !!c.company);
    }

    return result;
  }, [storeContacts, selectedProviderId, selectedFilter]);

  // Provider filters for sidebar - use DB counts for efficiency
  const providerFilters: ProviderFilter[] = useMemo(() => {
    return providers
      .filter((p) => p.supportsContacts)
      .map((p) => {
        // Use DB count from byProvider if available, otherwise fallback to client-side
        const dbCount = contactCounts.byProvider.find((bp) => bp.providerId === p.id);
        return {
          id: p.id,
          label: p.email,
          count: dbCount?.count ?? 0,
        };
      });
  }, [providers, contactCounts.byProvider]);

  // Dialog handlers
  const openCreateContactDialog = () => {
    setContactDialogMode('create');
    setContactForm({
      firstName: '',
      lastName: '',
      displayName: '',
      email: '',
      phone: '',
      company: '',
      jobTitle: '',
      department: '',
      birthday: '',
      website: '',
      notes: '',
      providerId: providers[0]?.id,
    });
    setContactDialogOpen(true);
  };

  const openEditContactDialog = () => {
    if (!selectedContact) return;
    setContactDialogMode('edit');
    setContactForm({
      firstName: selectedContact.firstName || '',
      lastName: selectedContact.lastName || '',
      displayName: selectedContact.displayName || '',
      email: getPrimaryEmail(selectedContact),
      phone: getPrimaryPhone(selectedContact),
      company: selectedContact.company || '',
      jobTitle: selectedContact.jobTitle || '',
      department: selectedContact.department || '',
      birthday: selectedContact.birthday ? new Date(selectedContact.birthday).toISOString().split('T')[0] : '',
      website: selectedContact.websites?.[0]?.url || '',
      notes: selectedContact.notes || '',
      providerId: selectedContact.providerContacts?.[0]?.providerId || providers[0]?.id,
    });
    setContactDialogOpen(true);
  };

  const handleContactFormChange = (field: keyof ContactFormState, value: string) => {
    setContactForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitContact = async () => {
    if (!contactForm.providerId) {
      setSnackbar({
        open: true,
        message: contactsCopy.alerts?.selectProvider || 'Please select a provider',
        severity: 'warning',
      });
      return;
    }

    try {
      setActionLoading(true);
      if (contactDialogMode === 'create') {
        await contactsApi.createContact({
          providerId: contactForm.providerId,
          firstName: contactForm.firstName || undefined,
          lastName: contactForm.lastName || undefined,
          displayName: contactForm.displayName ||
            (contactForm.firstName || contactForm.lastName
              ? `${contactForm.firstName} ${contactForm.lastName}`.trim()
              : undefined),
          company: contactForm.company || undefined,
          jobTitle: contactForm.jobTitle || undefined,
          notes: contactForm.notes || undefined,
          emails: contactForm.email
            ? [{ value: contactForm.email, primary: true }]
            : undefined,
          phoneNumbers: contactForm.phone
            ? [{ value: contactForm.phone, primary: true }]
            : undefined,
        });
      } else if (selectedContact) {
        await contactsApi.updateContact(selectedContact.id, {
          firstName: contactForm.firstName || undefined,
          lastName: contactForm.lastName || undefined,
          displayName: contactForm.displayName ||
            (contactForm.firstName || contactForm.lastName
              ? `${contactForm.firstName} ${contactForm.lastName}`.trim()
              : undefined),
          company: contactForm.company || undefined,
          jobTitle: contactForm.jobTitle || undefined,
          notes: contactForm.notes || undefined,
          emails: contactForm.email
            ? [{ value: contactForm.email, primary: true }]
            : undefined,
          phoneNumbers: contactForm.phone
            ? [{ value: contactForm.phone, primary: true }]
            : undefined,
        });
      }

      await loadContacts();
      setContactDialogOpen(false);
      setSnackbar({
        open: true,
        message: contactDialogMode === 'create'
          ? `${contactsCopy.createDialog?.create || 'Create Contact'} ✓`
          : contactsCopy.editDialog?.success || 'Contact updated successfully.',
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to save contact', { error });
      setSnackbar({
        open: true,
        message: contactsCopy.alerts?.failedToSave || 'Failed to save contact. Please try again.',
        severity: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteDialog = (contact: Contact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;

    try {
      setActionLoading(true);
      await contactsApi.deleteContact(contactToDelete.id);
      await loadContacts();
      setDeleteDialogOpen(false);
      setContactToDelete(null);
      if (selectedContact?.id === contactToDelete.id) {
        setSelectedContact(null);
      }
      setSnackbar({
        open: true,
        message: contactsCopy.alerts?.deleteSuccess || 'Contact deleted successfully.',
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to delete contact', { error });
      setSnackbar({
        open: true,
        message: contactsCopy.alerts?.deleteError || 'Unable to delete this contact. Please try again.',
        severity: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    try {
      setActionLoading(true);
      // Delete contacts one by one (could be optimized with bulk API)
      await Promise.all(idsToDelete.map((id) => contactsApi.deleteContact(id)));
      clearSelection();
      await loadContacts();
      setSnackbar({
        open: true,
        message: `Deleted ${idsToDelete.length} contacts`,
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to delete contacts', { error });
      setSnackbar({
        open: true,
        message: contactsCopy.alerts?.deleteError || 'Unable to delete contacts',
        severity: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Sync handler
  const handleSyncContacts = async () => {
    if (providers.length === 0) {
      setSnackbar({
        open: true,
        message: 'No providers connected. Please connect a provider first.',
        severity: 'warning',
      });
      return;
    }

    try {
      const contactProviders = providers.filter((p) => p.supportsContacts);

      if (contactProviders.length === 0) {
        setSnackbar({
          open: true,
          message: 'No connected providers support contacts.',
          severity: 'warning',
        });
        return;
      }

      setSyncingProviders(new Set(contactProviders.map((p) => p.id)));

      const result = await contactsApi.syncAll();

      if (result.success) {
        setSnackbar({
          open: true,
          message: result.message || `Queued ${result.queued} sync job(s). Syncing in background...`,
          severity: 'info',
        });

        setTimeout(() => {
          setSyncingProviders((prev) => {
            if (prev.size > 0) {
              loadContacts();
              return new Set();
            }
            return prev;
          });
        }, 60000);
      } else {
        setSnackbar({
          open: true,
          message: result.message || 'Failed to queue sync',
          severity: 'error',
        });
        setSyncingProviders(new Set());
      }
    } catch (error) {
      logger.error('Failed to sync contacts', { error });
      setSnackbar({
        open: true,
        message: 'Failed to sync contacts from providers.',
        severity: 'error',
      });
      setSyncingProviders(new Set());
    }
  };

  // Contact click handler
  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
  };

  // Email handler - open compose dialog directly
  const handleEmail = (email: string) => {
    setComposeToEmail(email);
    setComposeOpen(true);
  };

  // Select all handler for bulk action bar
  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
  };

  // Render sidebar - use DB counts for fast, accurate display
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
      {/* Search Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
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

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <ContactBulkActionBar
          selectedCount={selectedIds.size}
          totalCount={filteredContacts.length}
          onSelectAll={handleSelectAll}
          onClearSelection={clearSelection}
          onDelete={handleBulkDelete}
        />
      )}

      {/* Contact List */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <ContactList
          contacts={filteredContacts}
          selectedId={selectedContact?.id}
          selectedIds={selectedIds}
          isLoading={loading}
          onContactClick={handleContactClick}
          onToggleSelect={toggleSelection}
          onEdit={(id) => {
            const contact = filteredContacts.find((c) => c.id === id);
            if (contact) {
              setSelectedContact(contact);
              openEditContactDialog();
            }
          }}
          onDelete={(id) => {
            const contact = filteredContacts.find((c) => c.id === id);
            if (contact) openDeleteDialog(contact);
          }}
          onEmail={handleEmail}
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
        onClose={() => setSelectedContact(null)}
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
        />
      </Box>

      {/* Create/Edit Contact Dialog */}
      <Dialog
        open={contactDialogOpen}
        onClose={() => setContactDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {contactDialogMode === 'create' ? contactsCopy.createDialog?.title || 'New Contact' : contactsCopy.editDialog?.title || 'Edit Contact'}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            {/* Provider Selection */}
            <FormControl fullWidth disabled={contactDialogMode === 'edit'}>
              <InputLabel>{contactsCopy.createDialog?.provider || 'Provider'}</InputLabel>
              <Select
                label={contactsCopy.createDialog?.provider || 'Provider'}
                value={contactForm.providerId || ''}
                onChange={(event) =>
                  handleContactFormChange('providerId', String(event.target.value))
                }
              >
                {providers.map((provider) => (
                  <MenuItem key={provider.id} value={provider.id}>
                    {provider.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Personal Information */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Personal Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <TextField
                    label="First Name"
                    value={contactForm.firstName}
                    onChange={(event) => handleContactFormChange('firstName', event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Last Name"
                    value={contactForm.lastName}
                    onChange={(event) => handleContactFormChange('lastName', event.target.value)}
                    fullWidth
                  />
                </Box>
                <TextField
                  label={contactsCopy.createDialog?.name || 'Name'}
                  value={contactForm.displayName}
                  onChange={(event) => handleContactFormChange('displayName', event.target.value)}
                  fullWidth
                  helperText={contactsCopy.createDialog?.displayNameHelper || 'Display name'}
                />
                <TextField
                  label="Birthday"
                  type="date"
                  value={contactForm.birthday}
                  onChange={(event) => handleContactFormChange('birthday', event.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            </Box>

            {/* Contact Information */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Contact Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label={contactsCopy.createDialog?.email || 'Email'}
                  type="email"
                  value={contactForm.email}
                  onChange={(event) => handleContactFormChange('email', event.target.value)}
                  fullWidth
                  required
                />
                <TextField
                  label="Phone Number"
                  type="tel"
                  value={contactForm.phone}
                  onChange={(event) => handleContactFormChange('phone', event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Website"
                  type="url"
                  value={contactForm.website}
                  onChange={(event) => handleContactFormChange('website', event.target.value)}
                  fullWidth
                  placeholder="https://example.com"
                />
              </Box>
            </Box>

            {/* Professional Information */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Professional Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label={contactsCopy.createDialog?.company || 'Company'}
                  value={contactForm.company}
                  onChange={(event) => handleContactFormChange('company', event.target.value)}
                  fullWidth
                />
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <TextField
                    label={contactsCopy.createDialog?.jobTitle || 'Job Title'}
                    value={contactForm.jobTitle}
                    onChange={(event) => handleContactFormChange('jobTitle', event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Department"
                    value={contactForm.department}
                    onChange={(event) => handleContactFormChange('department', event.target.value)}
                    fullWidth
                  />
                </Box>
              </Box>
            </Box>

            {/* Notes */}
            <TextField
              label={contactsCopy.createDialog?.notes || 'Notes'}
              value={contactForm.notes}
              onChange={(event) => handleContactFormChange('notes', event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)}>{contactsCopy.createDialog?.cancel || 'Cancel'}</Button>
          <Button
            variant="contained"
            onClick={handleSubmitContact}
            disabled={actionLoading || (contactDialogMode === 'create' && !contactForm.providerId)}
          >
            {contactDialogMode === 'create' ? contactsCopy.createDialog?.create || 'Create' : contactsCopy.editDialog?.save || 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{contactsCopy.alerts?.deleteConfirmTitle || 'Delete'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {contactsCopy.alerts?.deleteConfirmDescription || 'Are you sure?'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={actionLoading}>
            {contactsCopy.createDialog.cancel}
          </Button>
          <Button
            onClick={handleDeleteContact}
            color="error"
            variant="contained"
            disabled={actionLoading}
          >
            {contactsCopy.alerts.deleteConfirmTitle}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
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

      {/* Compose Email Dialog */}
      <ComposeDialog
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setComposeToEmail('');
        }}
        prefillData={{
          to: composeToEmail ? [composeToEmail] : [],
        }}
        onSent={() => {
          setComposeOpen(false);
          setComposeToEmail('');
          setSnackbar({
            open: true,
            message: 'Email sent successfully',
            severity: 'success',
          });
        }}
        onError={(message) => {
          setSnackbar({
            open: true,
            message,
            severity: 'error',
          });
        }}
      />
    </>
  );
}
