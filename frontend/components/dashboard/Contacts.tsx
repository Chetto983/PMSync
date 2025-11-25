import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Button,
  IconButton,
  Divider,
  Tabs,
  Tab,
  Stack,
  Card,
  CardContent,
  CircularProgress,
  Tooltip,
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
  Chip,
  Link,
} from '@mui/material';
import {
  Search,
  Plus,
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  Edit,
  Trash2,
  Clock,
  RefreshCw,
  Cake,
  Globe,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { contactsApi, type Contact } from '@/lib/api/contacts';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContactStore } from '@/stores/contact-store';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

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

const getContactName = (contact: Contact) => {
  if (contact.displayName) return contact.displayName;
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return contact.emails?.[0]?.value || 'Unnamed contact';
};

const getPrimaryEmail = (contact?: Contact | null) =>
  contact?.emails?.find((email) => email.primary)?.value ||
  contact?.emails?.[0]?.value ||
  '';

const getPrimaryPhone = (contact?: Contact | null) =>
  contact?.phoneNumbers?.find((phone) => phone.primary)?.value ||
  contact?.phoneNumbers?.[0]?.value ||
  '';

// Provider Icon Component - styled like email list icons
const ProviderIcon = ({ providerType, size = 16 }: { providerType: string; size?: number }) => {
  const iconSize = size * 0.6; // Logo size inside circle

  if (providerType === 'google') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: '#ffffff',
          border: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      </Box>
    );
  } else if (providerType === 'microsoft') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: '#ffffff',
          border: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <path d="M11.4 3H3v8.4h8.4V3z" fill="#F25022" />
          <path d="M21 3h-8.4v8.4H21V3z" fill="#7FBA00" />
          <path d="M11.4 12.6H3V21h8.4v-8.4z" fill="#00A4EF" />
          <path d="M21 12.6h-8.4V21H21v-8.4z" fill="#FFB900" />
        </svg>
      </Box>
    );
  }
  return null;
};

export function Contacts() {
  const router = useRouter();
  const translations = useTranslations();
  const contactsCopy = translations.dashboard.contacts;
  const [loading, setLoading] = useState(true);
  const {
    contacts: storeContacts,
    setContacts: setStoreContacts,
  } = useContactStore();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
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
  const selectedContactIdRef = useRef<string | null>(null);
  const paginationRef = useRef({ offset: 0, limit: 50, hasMore: true, total: 0 });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [syncingProviders, setSyncingProviders] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, hasMore: true, total: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

  const loadContacts = useCallback(async (reset: boolean = true) => {
    try {
      if (reset) {
        setLoading(true);
        const newPagination = { offset: 0, limit: 50, hasMore: true, total: 0 };
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
        const merged = [...storeContacts, ...contactsData];
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
      const updatedSelection =
        (previouslySelectedId && (reset ? contactsData : storeContacts).find((contact) => contact.id === previouslySelectedId)) ||
        (reset ? contactsData[0] : storeContacts[0] || contactsData[0]);
      setSelectedContact(updatedSelection);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearchQuery, setStoreContacts, storeContacts]);

  // Keep selection in sync with store updates (e.g., realtime)
  useEffect(() => {
    if (!storeContacts.length) {
      setSelectedContact(null);
      return;
    }
    if (!selectedContact || !storeContacts.find((c) => c.id === selectedContact.id)) {
      setSelectedContact(storeContacts[0]);
    }
  }, [storeContacts, selectedContact]);

  const loadMore = useCallback(() => {
    if (!loadingMore && pagination.hasMore) {
      loadContacts(false);
    }
  }, [loadContacts, loadingMore, pagination.hasMore]);

  // Initial load: sync from providers then load contacts
  useEffect(() => {
    const initialLoad = async () => {
      // First, trigger sync from Google/Microsoft (non-blocking)
      try {
        console.log('[Contacts] Triggering initial sync from providers...');
        const result = await contactsApi.syncAll();
        if (result.success) {
          console.log(`[Contacts] Sync queued: ${result.queued} providers`);
        }
      } catch (syncError) {
        console.warn('[Contacts] Initial sync failed:', syncError);
      }

      // Then load contacts from database
      await loadContacts();
    };
    initialLoad();
  }, [loadContacts]);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    if (!pagination.hasMore || loadingMore) return;

    const sentinel = sentinelRef.current;
    const listRoot = listRef.current;
    if (!sentinel || !listRoot) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && pagination.hasMore && !loadingMore) {
          loadMore();
        }
      },
      {
        root: listRoot,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [loadMore, pagination.hasMore, loadingMore]);

  const loadProviders = useCallback(async () => {
    try {
      const providerData = await providersApi.getProviders();
      setProviders(providerData || []);
      setContactForm((prev) => ({
        ...prev,
        providerId: prev.providerId || providerData?.[0]?.id,
      }));
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

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
      // Get providerId from first provider contact, or use first available provider
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
        message: contactsCopy.alerts.selectProvider,
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
          ? `${contactsCopy.createDialog.create} ✓`
          : contactsCopy.editDialog.success,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to save contact:', error);
      setSnackbar({
        open: true,
        message: contactsCopy.alerts.failedToSave,
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
        message: contactsCopy.alerts.deleteSuccess,
        severity: 'success',
      });
    } catch (error) {
      console.error('Failed to delete contact:', error);
      setSnackbar({
        open: true,
        message: contactsCopy.alerts.deleteError,
        severity: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

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
      // Get contact-enabled providers
      const contactProviders = providers.filter((p) => p.supportsContacts);

      if (contactProviders.length === 0) {
        setSnackbar({
          open: true,
          message: 'No connected providers support contacts.',
          severity: 'warning',
        });
        return;
      }

      // Mark all as syncing
      setSyncingProviders(new Set(contactProviders.map((p) => p.id)));

      // Trigger bulk sync (queued via BullMQ workers - tenant isolated)
      const result = await contactsApi.syncAll();

      if (result.success) {
        setSnackbar({
          open: true,
          message: result.message || `Queued ${result.queued} sync job(s). Syncing in background...`,
          severity: 'info',
        });

        // Poll for updates every 3 seconds for 30 seconds
        let attempts = 0;
        const maxAttempts = 10;
        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            await loadContacts();
          } catch (err) {
            console.error('Failed to reload contacts:', err);
          }

          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setSyncingProviders(new Set());
            setSnackbar({
              open: true,
              message: contactsCopy.alerts?.syncSuccess?.replace('{count}', 'all') ||
                       'Contact sync completed in background',
              severity: 'success',
            });
          }
        }, 3000);
      } else {
        setSnackbar({
          open: true,
          message: result.message || 'Failed to queue sync',
          severity: 'error',
        });
        setSyncingProviders(new Set());
      }
    } catch (error) {
      console.error('Failed to sync contacts:', error);
      setSnackbar({
        open: true,
        message: 'Failed to sync contacts from providers.',
        severity: 'error',
      });
      setSyncingProviders(new Set());
    }
  };

  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
    setTabValue(0);
  };

  const formatDate = (date?: Date) => {
    if (!date) return contactsCopy.details.never;
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return contactsCopy.details.today;
    if (diffDays === 1) return contactsCopy.details.yesterday;
    if (diffDays < 7) return contactsCopy.details.daysAgo.replace('{days}', String(diffDays));
    return d.toLocaleDateString();
  };

  const selectedContactName = selectedContact ? getContactName(selectedContact) : '';
  const selectedContactEmail = getPrimaryEmail(selectedContact);
  const selectedContactInteractionDate = selectedContact?.updatedAt
    ? new Date(selectedContact.updatedAt)
    : undefined;

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', overflow: 'hidden' }}>
      {/* Contacts List */}
      <Paper
        sx={{
          width: { xs: '100%', md: 360 },
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
              {contactsCopy.title}
            </Typography>
            <Tooltip title={contactsCopy.sync}>
              <IconButton
                size="small"
                onClick={handleSyncContacts}
                disabled={syncingProviders.size > 0 || providers.length === 0}
                color="primary"
              >
                <RefreshCw
                  size={18}
                  className={syncingProviders.size > 0 ? 'animate-spin' : ''}
                />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              size="small"
              startIcon={<Plus size={18} />}
              onClick={openCreateContactDialog}
            >
              {contactsCopy.new}
            </Button>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder={contactsCopy.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Contacts List */}
        <List
          ref={listRef}
          sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', p: 0, m: 0 }}
        >
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : storeContacts.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {contactsCopy.noContactsFound}
              </Typography>
            </Box>
          ) : (
            <>
              {storeContacts.map((contact) => (
                <React.Fragment key={contact.id}>
                  <ListItemButton
                    selected={selectedContact?.id === contact.id}
                    onClick={() => handleContactClick(contact)}
                    sx={{ px: 2, py: 1.5 }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        src={contact.photoUrl || undefined}
                        sx={{ bgcolor: 'primary.main' }}
                      >
                        {!contact.photoUrl && (getContactName(contact)?.[0]?.toUpperCase() || 'U')}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2">{getContactName(contact)}</Typography>
                          {contact.providerContacts?.map((pc) => (
                            <Tooltip key={pc.id} title={pc.provider.providerType === 'google' ? 'Gmail' : 'Outlook'}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <ProviderIcon providerType={pc.provider.providerType} size={16} />
                              </Box>
                            </Tooltip>
                          ))}
                        </Box>
                      }
                      secondary={
                        contact.company || getPrimaryEmail(contact) ? (
                          <Typography variant="caption" color="text.secondary">
                            {contact.company || getPrimaryEmail(contact)}
                          </Typography>
                        ) : null
                      }
                    />
                  </ListItemButton>
                  <Divider />
                </React.Fragment>
              ))}
              {/* Infinite scroll sentinel */}
              {pagination.hasMore && (
                <Box ref={sentinelRef} sx={{ py: 2, textAlign: 'center' }}>
                  {loadingMore && <CircularProgress size={24} />}
                </Box>
              )}
            </>
          )}
        </List>
      </Paper>

      {/* Contact Detail Panel */}
      {selectedContact ? (
        <Box
          sx={{
            flex: 1,
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
              <Avatar sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: '2rem' }}>
                {selectedContactName?.[0]?.toUpperCase() || 'U'}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {selectedContactName}
                </Typography>
                {(selectedContact.jobTitle || selectedContact.company) && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {selectedContact.jobTitle}
                    {selectedContact.company && ` at ${selectedContact.company}`}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={openEditContactDialog}>
                    <Edit size={18} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    onClick={() => selectedContact && openDeleteDialog(selectedContact)}
                    disabled={actionLoading}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Mail size={18} />}
                disabled={!selectedContactEmail}
                onClick={() =>
                  selectedContactEmail &&
                  router.push(`/dashboard/email/compose?to=${selectedContactEmail}`)
                }
              >
                {contactsCopy.actions.email}
              </Button>
            </Stack>
          </Box>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
              <Tab label={contactsCopy.tabs.details} />
              <Tab label={contactsCopy.tabs.activity} />
              <Tab label={contactsCopy.tabs.notes} />
            </Tabs>
          </Box>

          {/* Tab Content */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 3 }}>
            <TabPanel value={tabValue} index={0}>
              {/* Provider Sources */}
              {selectedContact.providerContacts && selectedContact.providerContacts.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    {contactsCopy.details.syncedFrom}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {selectedContact.providerContacts.map((pc) => (
                      <Chip
                        key={pc.id}
                        icon={<ProviderIcon providerType={pc.provider.providerType} size={20} />}
                        label={`${pc.provider.providerType === 'google' ? 'Gmail' : 'Outlook'}: ${pc.provider.email}`}
                        size="small"
                        sx={{
                          bgcolor: 'action.hover',
                          '& .MuiChip-icon': { ml: 0.5 },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* Email Addresses */}
              {selectedContact.emails && selectedContact.emails.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.emailAddresses}
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {selectedContact.emails.map((email, idx) => (
                      <Card variant="outlined" key={idx}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Mail size={18} color="#0B7EFF" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {email.type || contactsCopy.details.custom} {email.primary && `(${contactsCopy.details.primary})`}
                            </Typography>
                          </Box>
                          <Link href={`mailto:${email.value}`} underline="hover">
                            <Typography variant="body1">{email.value}</Typography>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Phone Numbers */}
              {selectedContact.phoneNumbers && selectedContact.phoneNumbers.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.phoneNumbers}
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {selectedContact.phoneNumbers.map((phone, idx) => (
                      <Card variant="outlined" key={idx}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Phone size={18} color="#00C853" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {phone.type || contactsCopy.details.custom} {phone.primary && `(${contactsCopy.details.primary})`}
                            </Typography>
                          </Box>
                          <Link href={`tel:${phone.value}`} underline="hover">
                            <Typography variant="body1">{phone.value}</Typography>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Addresses */}
              {selectedContact.addresses && selectedContact.addresses.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.addresses}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {selectedContact.addresses.map((address, idx) => (
                      <Card variant="outlined" key={idx}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <MapPin size={18} color="#9C27B0" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {address.type || 'Address'}
                            </Typography>
                          </Box>
                          <Typography variant="body1">
                            {[address.street, address.city, address.state, address.postalCode, address.country]
                              .filter(Boolean)
                              .join(', ')}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Professional Information */}
              {(selectedContact.company || selectedContact.jobTitle || selectedContact.department) && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.professional}
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {selectedContact.company && (
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Building size={18} color="#FF9800" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {contactsCopy.details.company}
                            </Typography>
                          </Box>
                          <Typography variant="body1">{selectedContact.company}</Typography>
                        </CardContent>
                      </Card>
                    )}
                    {selectedContact.jobTitle && (
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Building size={18} color="#FF9800" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {contactsCopy.details.jobTitle}
                            </Typography>
                          </Box>
                          <Typography variant="body1">{selectedContact.jobTitle}</Typography>
                        </CardContent>
                      </Card>
                    )}
                    {selectedContact.department && (
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Building size={18} color="#FF9800" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {contactsCopy.details.department}
                            </Typography>
                          </Box>
                          <Typography variant="body1">{selectedContact.department}</Typography>
                        </CardContent>
                      </Card>
                    )}
                  </Box>
                </Box>
              )}

              {/* Important Dates */}
              {(selectedContact.birthday || selectedContact.anniversary) && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.importantDates}
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {selectedContact.birthday && (
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Cake size={18} color="#E91E63" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {contactsCopy.details.birthday}
                            </Typography>
                          </Box>
                          <Typography variant="body1">
                            {new Date(selectedContact.birthday).toLocaleDateString()}
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                    {selectedContact.anniversary && (
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Calendar size={18} color="#E91E63" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {contactsCopy.details.anniversary}
                            </Typography>
                          </Box>
                          <Typography variant="body1">
                            {new Date(selectedContact.anniversary).toLocaleDateString()}
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                  </Box>
                </Box>
              )}

              {/* Websites */}
              {selectedContact.websites && selectedContact.websites.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.websites}
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {selectedContact.websites.map((website, idx) => (
                      <Card variant="outlined" key={idx}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Globe size={18} color="#4CAF50" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {website.type || 'Website'}
                            </Typography>
                          </Box>
                          <Link href={website.url} target="_blank" rel="noopener noreferrer" underline="hover">
                            <Typography variant="body1">{website.url}</Typography>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Social Profiles */}
              {selectedContact.socialProfiles && selectedContact.socialProfiles.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.details.socialProfiles}
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                    {selectedContact.socialProfiles.map((profile, idx) => (
                      <Card variant="outlined" key={idx}>
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Globe size={18} color="#2196F3" />
                            <Typography variant="subtitle2" color="text.secondary">
                              {profile.platform || 'Social'}
                            </Typography>
                          </Box>
                          {profile.url ? (
                            <Link href={profile.url} target="_blank" rel="noopener noreferrer" underline="hover">
                              <Typography variant="body1">
                                {profile.username || profile.url}
                              </Typography>
                            </Link>
                          ) : (
                            <Typography variant="body1">{profile.username}</Typography>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Notes */}
              {selectedContact.notes && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {contactsCopy.notes.title}
                  </Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2">{selectedContact.notes}</Typography>
                    </CardContent>
                  </Card>
                </Box>
              )}

              {/* Last Interaction */}
              <Box>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Clock size={18} color="#757575" />
                      <Typography variant="subtitle2" color="text.secondary">
                        {contactsCopy.details.lastInteraction}
                      </Typography>
                    </Box>
                    <Typography variant="body1">
                      {formatDate(selectedContactInteractionDate)}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.activity.title}
              </Typography>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  {contactsCopy.activity.noActivity}
                </Typography>
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.notes.title}
              </Typography>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  {contactsCopy.notes.noNotes}
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Plus size={18} />}
                  sx={{ mt: 2 }}
                >
                  {contactsCopy.notes.addNote}
                </Button>
              </Box>
            </TabPanel>
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="body1" color="text.secondary">
            {contactsCopy.selectContactMessage}
          </Typography>
        </Box>
      )}

      <Dialog
        open={contactDialogOpen}
        onClose={() => setContactDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {contactDialogMode === 'create' ? contactsCopy.createDialog.title : contactsCopy.editDialog.title}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            {/* Provider Selection */}
            <FormControl fullWidth disabled={contactDialogMode === 'edit'}>
              <InputLabel>{contactsCopy.createDialog.provider}</InputLabel>
              <Select
                label={contactsCopy.createDialog.provider}
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
                  label={contactsCopy.createDialog.name}
                  value={contactForm.displayName}
                  onChange={(event) => handleContactFormChange('displayName', event.target.value)}
                  fullWidth
                  helperText="Display name (optional if first/last name provided)"
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
                  label={contactsCopy.createDialog.email}
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
                  label={contactsCopy.createDialog.company}
                  value={contactForm.company}
                  onChange={(event) => handleContactFormChange('company', event.target.value)}
                  fullWidth
                />
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                  <TextField
                    label={contactsCopy.createDialog.jobTitle}
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
              label={contactsCopy.createDialog.notes}
              value={contactForm.notes}
              onChange={(event) => handleContactFormChange('notes', event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)}>{contactsCopy.createDialog.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleSubmitContact}
            disabled={actionLoading || (contactDialogMode === 'create' && !contactForm.providerId)}
          >
            {contactDialogMode === 'create' ? contactsCopy.createDialog.create : contactsCopy.editDialog.save}
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
        <DialogTitle>{contactsCopy.alerts.deleteConfirmTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {contactsCopy.alerts.deleteConfirmDescription}
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
    </Box>
  );
}
