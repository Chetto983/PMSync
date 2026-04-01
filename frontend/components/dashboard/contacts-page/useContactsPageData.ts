import { useState, useEffect, useCallback, useRef, useMemo, type SetStateAction } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import { type Contact, type ContactCounts } from '@/lib/api/contacts';
import {
  useContactCounts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useSyncAllContacts,
  contactsListOptions,
  contactDetailOptions,
} from '@/hooks/queries/use-contacts';
import { useStaleContacts } from '@/hooks/queries/use-dashboard';
import { logger } from '@/lib/logger';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { useContactStore } from '@/stores/contact-store';
import {
  websocketClient,
  type RealtimeContactEvent,
  type RealtimeSyncStatus,
  type RealtimeContactCountsEvent,
} from '@/lib/websocket-client';
import { type ProviderFilter } from '@/components/contacts';

export function useContactsPageData() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Store state
  const {
    contacts: storeContacts,
    setContacts: setStoreContacts,
    selectedIds,
    toggleSelection,
    clearSelection,
    setSelectedIds,
  } = useContactStore();

  // TanStack Query client for imperative fetching
  const queryClient = useQueryClient();

  // TanStack Query hooks for data fetching and mutations
  const { data: contactCountsData, refetch: refetchContactCounts } = useContactCounts();
  const createContactMutation = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContact();
  const syncAllMutation = useSyncAllContacts();

  // Local state
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [syncingProviders, setSyncingProviders] = useState<Set<string>>(new Set());
  // Persist filters in URL search params
  const router = useRouter();

  const selectedProviderId = (router.query.provider as string) || null;
  const selectedFilter = (router.query.filter as string) || null;
  const selectedContactId = (router.query.id as string) || null;
  const { data: staleContactsData } = useStaleContacts({ limit: 200 });

  const setSelectedProviderId = useCallback(
    (value: SetStateAction<string | null>) => {
      const next = typeof value === 'function' ? value(selectedProviderId) : value;
      const query = { ...router.query };
      if (next) {
        query.provider = next;
      } else {
        delete query.provider;
      }
      // Clear filter when changing provider
      delete query.filter;
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router, selectedProviderId],
  );

  const setSelectedFilter = useCallback(
    (value: SetStateAction<string | null>) => {
      const next = typeof value === 'function' ? value(selectedFilter) : value;
      const query = { ...router.query };
      if (next) {
        query.filter = next;
      } else {
        delete query.filter;
      }
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router, selectedFilter],
  );
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, hasMore: true, total: 0 });

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

  // Dialog state
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  // Contact counts from TanStack Query (with fallback for initial render)
  const contactCounts: ContactCounts = contactCountsData ?? {
    total: 0,
    withEmail: 0,
    withPhone: 0,
    withCompany: 0,
    byProvider: [],
  };

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

  // Load contacts using TanStack Query
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
      const response = await queryClient.fetchQuery(
        contactsListOptions({
          search: debouncedSearchQuery || undefined,
          limit: paginationRef.current.limit,
          offset,
        })
      );
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

      if (previouslySelectedId) {
        const previousContact = (reset ? contactsData : currentContactsForSelection).find(
          (c) => c.id === previouslySelectedId
        );
        if (previousContact) {
          setSelectedContact(previousContact);
        } else if (!isMobile) {
          setSelectedContact(reset ? contactsData[0] : currentContactsForSelection[0] || contactsData[0]);
        }
      } else if (!isMobile && reset) {
        setSelectedContact(contactsData[0]);
      }
    } catch (error) {
      logger.error('Failed to load contacts', { error });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearchQuery, setStoreContacts, setPagination, queryClient, isMobile]);

  // Keep selection in sync with store updates
  useEffect(() => {
    if (!storeContacts.length) {
      if (!selectedContactId) {
        setSelectedContact(null);
      }
      return;
    }
    if (
      selectedContact &&
      !storeContacts.find((c) => c.id === selectedContact.id) &&
      (!selectedContactId || selectedContact.id !== selectedContactId)
    ) {
      setSelectedContact(storeContacts[0]);
    }
  }, [storeContacts, selectedContact, selectedContactId]);

  useEffect(() => {
    if (!router.isReady || !selectedContactId) return;

    const existingContact = storeContacts.find((contact) => contact.id === selectedContactId);
    if (existingContact) {
      setSelectedContact(existingContact);
      return;
    }

    let active = true;

    void queryClient
      .fetchQuery(contactDetailOptions(selectedContactId))
      .then((contact) => {
        if (!active) return;
        setSelectedContact(contact);
      })
      .catch((error) => {
        logger.error('Failed to load selected contact from route', { error, contactId: selectedContactId });
      });

    return () => {
      active = false;
    };
  }, [queryClient, router.isReady, selectedContactId, storeContacts]);

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

  // WebSocket event handling
  useEffect(() => {
    const handleContactNew = async (event: RealtimeContactEvent) => {
      logger.debug('[Contacts] WebSocket: contact:new', { event });
      if (event.contactId) {
        try {
          const contact = await queryClient.fetchQuery(contactDetailOptions(event.contactId));
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
          const contact = await queryClient.fetchQuery(contactDetailOptions(event.contactId));
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

    const handleContactCounts = (_event: RealtimeContactCountsEvent) => {
      logger.debug('[Contacts] WebSocket: contact:counts - refetching via TanStack Query');
      void refetchContactCounts();
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
  }, [queryClient, refetchContactCounts]);

  // Load providers
  const loadProviders = useCallback(async () => {
    try {
      const providerData = await providersApi.getProviders();
      setProviders(providerData || []);
      return providerData || [];
    } catch (error) {
      logger.error('Failed to load providers', { error });
      return [];
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Filter contacts based on selected provider and quick filter
  const filteredContacts = useMemo(() => {
    let result = storeContacts;
    const staleContactIds = new Set((staleContactsData?.contacts ?? []).map((contact) => contact.id));

    if (selectedProviderId) {
      result = result.filter((c) =>
        c.providerContacts?.some((pc) => pc.providerId === selectedProviderId)
      );
    }

    if (selectedFilter === 'hasEmail') {
      result = result.filter((c) => c.emails && c.emails.length > 0);
    } else if (selectedFilter === 'hasPhone') {
      result = result.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
    } else if (selectedFilter === 'hasCompany') {
      result = result.filter((c) => !!c.company);
    } else if (selectedFilter === 'stale') {
      result = result.filter((c) => staleContactIds.has(c.id));
    }

    return result;
  }, [storeContacts, selectedProviderId, selectedFilter, staleContactsData?.contacts]);

  // Provider filters for sidebar
  const providerFilters: ProviderFilter[] = useMemo(() => {
    return providers
      .filter((p) => p.supportsContacts)
      .map((p) => {
        const dbCount = contactCounts.byProvider.find((bp) => bp.providerId === p.id);
        return {
          id: p.id,
          label: p.email,
          count: dbCount?.count ?? 0,
        };
      });
  }, [providers, contactCounts.byProvider]);

  return {
    // State
    isMobile,
    loading,
    loadingMore,
    selectedContact,
    setSelectedContact,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    searchQuery,
    setSearchQuery,
    providers,
    syncingProviders,
    setSyncingProviders,
    selectedProviderId,
    setSelectedProviderId,
    selectedFilter,
    setSelectedFilter,
    pagination,
    snackbar,
    setSnackbar,
    actionLoading,
    setActionLoading,
    deleteDialogOpen,
    setDeleteDialogOpen,
    contactToDelete,
    setContactToDelete,
    // Computed
    contactCounts,
    filteredContacts,
    providerFilters,
    selectedIds,
    toggleSelection,
    clearSelection,
    setSelectedIds,
    storeContacts,
    // Mutations
    createContactMutation,
    updateContactMutation,
    deleteContactMutation,
    syncAllMutation,
    // Actions
    loadContacts,
    loadMore,
  };
}
