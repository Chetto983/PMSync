/**
 * TanStack Query hooks for contacts operations
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Automatic background refetching
 * - Error handling with retry configuration
 * - Optimistic updates for mutations
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/queries
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  contactsApi,
  type ListContactsParams,
  type CreateContactDto,
  type UpdateContactDto,
  type Contact,
  type CreateLocalContactDto,
  type ExtractContactsParams,
  type ExtractContactsResult,
  type VCardImportResult,
} from '@/lib/api/contacts';
import { contactsKeys } from './contacts-keys';

// ============================================================================
// Query Options (for sharing between hooks and prefetching)
// ============================================================================

/**
 * Query options for fetching contacts list
 */
export function contactsListOptions(params?: ListContactsParams) {
  return queryOptions({
    queryKey: contactsKeys.listFiltered(params),
    queryFn: async () => {
      return await contactsApi.listContacts(params);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - contacts can change
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Query options for fetching contact counts
 */
export function contactsCountsOptions() {
  return queryOptions({
    queryKey: contactsKeys.counts(),
    queryFn: async () => {
      return await contactsApi.getContactCounts();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - counts rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Query options for fetching single contact
 */
export function contactDetailOptions(id: string) {
  return queryOptions({
    queryKey: contactsKeys.detail(id),
    queryFn: async () => {
      return await contactsApi.getContact(id);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - single contact data rarely changes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!id,
  });
}

/**
 * Query options for searching contacts
 */
export function contactsSearchOptions(query: string) {
  return queryOptions({
    queryKey: contactsKeys.search(query),
    queryFn: async () => {
      return await contactsApi.listContacts({ search: query });
    },
    staleTime: 1 * 60 * 1000, // 1 minute - search results can be stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: query.length >= 2, // Only search with 2+ characters
  });
}

/**
 * Query options for contacts by provider
 */
export function contactsByProviderOptions(providerId: string) {
  return queryOptions({
    queryKey: contactsKeys.byProvider(providerId),
    queryFn: async () => {
      return await contactsApi.listContacts({ providerId });
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!providerId,
  });
}

/**
 * Query options for contact history
 */
export function contactHistoryOptions(id: string, limit: number = 50) {
  return queryOptions({
    queryKey: ['contacts', 'history', id, limit],
    queryFn: async () => {
      return await contactsApi.getContactHistory(id, limit);
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching contacts list
 *
 * @example
 * ```tsx
 * const { data, isPending, error } = useContacts({ limit: 50 });
 * const contacts = data?.contacts ?? [];
 * ```
 */
export function useContacts(params?: ListContactsParams) {
  return useQuery(contactsListOptions(params));
}

/**
 * Hook for fetching contact counts/statistics
 *
 * @example
 * ```tsx
 * const { data: counts, isPending } = useContactCounts();
 * console.log(counts?.total, counts?.withEmail);
 * ```
 */
export function useContactCounts() {
  return useQuery(contactsCountsOptions());
}

/**
 * Hook for fetching single contact
 *
 * @example
 * ```tsx
 * const { data: contact, isPending } = useContact('contact-id');
 * ```
 */
export function useContact(id: string) {
  return useQuery(contactDetailOptions(id));
}

/**
 * Hook for searching contacts
 *
 * @example
 * ```tsx
 * const { data, isPending } = useContactSearch('john');
 * const results = data?.contacts ?? [];
 * ```
 */
export function useContactSearch(query: string) {
  return useQuery(contactsSearchOptions(query));
}

/**
 * Hook for fetching contacts by provider
 *
 * @example
 * ```tsx
 * const { data } = useContactsByProvider('provider-id');
 * const contacts = data?.contacts ?? [];
 * ```
 */
export function useContactsByProvider(providerId: string) {
  return useQuery(contactsByProviderOptions(providerId));
}

/**
 * Hook for fetching contact history
 */
export function useContactHistory(id: string, limit: number = 50) {
  return useQuery(contactHistoryOptions(id, limit));
}

/**
 * Query options for fetching contact photo on-demand
 * Only fetches if contact has provider contacts (synced from Google/Microsoft)
 */
export function contactPhotoOptions(id: string, hasProviderContacts: boolean, existingPhotoUrl: string | null | undefined) {
  return queryOptions({
    queryKey: contactsKeys.photo(id),
    queryFn: async () => {
      return await contactsApi.getContactPhoto(id);
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - photos rarely change
    gcTime: 60 * 60 * 1000, // 1 hour
    // Only fetch if:
    // 1. Has a valid contact ID
    // 2. Has provider contacts (synced from external provider)
    // 3. Does NOT already have a photoUrl
    enabled: !!id && hasProviderContacts && !existingPhotoUrl,
  });
}

/**
 * Hook for fetching contact photo on-demand
 * Lazy-loads photos for contacts synced from Google/Microsoft that don't have photoUrl yet
 *
 * @example
 * ```tsx
 * const { data: photoUrl, isLoading } = useContactPhoto(
 *   contact.id,
 *   !!contact.providerContacts?.length,
 *   contact.photoUrl
 * );
 * // Use photoUrl || contact.photoUrl for the Avatar src
 * ```
 */
export function useContactPhoto(id: string, hasProviderContacts: boolean, existingPhotoUrl: string | null | undefined) {
  return useQuery(contactPhotoOptions(id, hasProviderContacts, existingPhotoUrl));
}

/**
 * Query options for batch lookup of sender photos by email
 * Used for populating sender avatars in email list
 */
export function senderPhotosOptions(emails: string[]) {
  return queryOptions({
    queryKey: contactsKeys.senderPhotos(emails),
    queryFn: async () => {
      return await contactsApi.lookupByEmails(emails);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - sender photos rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: emails.length > 0,
  });
}

/**
 * Hook for batch lookup of sender photos by email addresses
 * Used for populating sender avatars in email list
 *
 * @example
 * ```tsx
 * const emails = threads.map(t => extractEmail(t.from));
 * const { data: senderPhotos } = useSenderPhotos(emails);
 * // senderPhotos['john@example.com']?.photoUrl
 * ```
 */
export function useSenderPhotos(emails: string[]) {
  return useQuery(senderPhotosOptions(emails));
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for creating contacts
 *
 * @example
 * ```tsx
 * const createContact = useCreateContact();
 * await createContact.mutateAsync({
 *   providerId: 'provider-id',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   emails: [{ value: 'john@example.com', primary: true }],
 * });
 * ```
 */
export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateContactDto) => {
      return await contactsApi.createContact(data);
    },
    onSuccess: () => {
      // Invalidate all contact queries to refresh lists
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
      queryClient.invalidateQueries({ queryKey: contactsKeys.counts() });
    },
  });
}

/**
 * Hook for updating contacts with optimistic updates
 *
 * @example
 * ```tsx
 * const updateContact = useUpdateContact();
 * await updateContact.mutateAsync({
 *   id: 'contact-id',
 *   data: { firstName: 'Jane' },
 * });
 * ```
 */
export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateContactDto }) => {
      return await contactsApi.updateContact(id, data);
    },
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: contactsKeys.detail(id) });

      // Snapshot the previous value
      const previousContact = queryClient.getQueryData<Contact>(contactsKeys.detail(id));

      // Optimistically update
      if (previousContact) {
        queryClient.setQueryData<Contact>(contactsKeys.detail(id), {
          ...previousContact,
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }

      return { previousContact };
    },
    onError: (_, { id }, context) => {
      // Rollback on error
      if (context?.previousContact) {
        queryClient.setQueryData(contactsKeys.detail(id), context.previousContact);
      }
    },
    onSettled: (_, __, { id }) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
    },
  });
}

/**
 * Hook for deleting contacts
 *
 * @example
 * ```tsx
 * const deleteContact = useDeleteContact();
 * await deleteContact.mutateAsync('contact-id');
 * ```
 */
export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await contactsApi.deleteContact(id);
      return id;
    },
    onSuccess: (id) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: contactsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
      queryClient.invalidateQueries({ queryKey: contactsKeys.counts() });
    },
  });
}

/**
 * Hook for syncing a provider's contacts
 *
 * @example
 * ```tsx
 * const syncProvider = useSyncContactProvider();
 * await syncProvider.mutateAsync('provider-id');
 * ```
 */
export function useSyncContactProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerId: string) => {
      return await contactsApi.syncProvider(providerId);
    },
    onSuccess: () => {
      // Invalidate all contact data after sync
      queryClient.invalidateQueries({ queryKey: contactsKeys.all });
    },
  });
}

/**
 * Hook for syncing all providers' contacts
 *
 * @example
 * ```tsx
 * const syncAll = useSyncAllContacts();
 * await syncAll.mutateAsync();
 * ```
 */
export function useSyncAllContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await contactsApi.syncAll();
    },
    onSuccess: () => {
      // Invalidate all contact data after sync
      queryClient.invalidateQueries({ queryKey: contactsKeys.all });
    },
  });
}

/**
 * Hook for toggling contact starred status
 *
 * @example
 * ```tsx
 * const toggleStar = useToggleContactStar();
 * await toggleStar.mutateAsync({ id: 'contact-id', isStarred: true });
 * ```
 */
export function useToggleContactStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isStarred }: { id: string; isStarred: boolean }) => {
      return await contactsApi.updateContact(id, { isStarred } as UpdateContactDto);
    },
    onMutate: async ({ id, isStarred }) => {
      await queryClient.cancelQueries({ queryKey: contactsKeys.detail(id) });

      const previousContact = queryClient.getQueryData<Contact>(contactsKeys.detail(id));

      if (previousContact) {
        queryClient.setQueryData<Contact>(contactsKeys.detail(id), {
          ...previousContact,
          isStarred,
        });
      }

      return { previousContact };
    },
    onError: (_, { id }, context) => {
      if (context?.previousContact) {
        queryClient.setQueryData(contactsKeys.detail(id), context.previousContact);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
    },
  });
}

/**
 * Hook for toggling contact favorite status
 *
 * @example
 * ```tsx
 * const toggleFavorite = useToggleContactFavorite();
 * await toggleFavorite.mutateAsync({ id: 'contact-id', isFavorite: true });
 * ```
 */
export function useToggleContactFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      return await contactsApi.updateContact(id, { isFavorite } as UpdateContactDto);
    },
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: contactsKeys.detail(id) });

      const previousContact = queryClient.getQueryData<Contact>(contactsKeys.detail(id));

      if (previousContact) {
        queryClient.setQueryData<Contact>(contactsKeys.detail(id), {
          ...previousContact,
          isFavorite,
        });
      }

      return { previousContact };
    },
    onError: (_, { id }, context) => {
      if (context?.previousContact) {
        queryClient.setQueryData(contactsKeys.detail(id), context.previousContact);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
    },
  });
}

// ============================================================================
// Local Contact & Import Mutation Hooks
// ============================================================================

/**
 * Hook for creating local-only contacts (no provider sync)
 *
 * @example
 * ```tsx
 * const createLocal = useCreateLocalContact();
 * await createLocal.mutateAsync({
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   emails: [{ value: 'john@example.com', primary: true }],
 * });
 * ```
 */
export function useCreateLocalContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateLocalContactDto) => {
      return await contactsApi.createLocalContact(data);
    },
    onSuccess: () => {
      // Invalidate contact queries to refresh lists
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
      queryClient.invalidateQueries({ queryKey: contactsKeys.counts() });
    },
  });
}

/**
 * Hook for extracting contacts from email headers
 * Useful for IMAP providers without native contacts API
 *
 * @example
 * ```tsx
 * const extractContacts = useExtractContactsFromEmails();
 * const result = await extractContacts.mutateAsync({
 *   providerId: 'provider-id',
 *   excludePublicDomains: true, // Exclude gmail.com, yahoo.com, etc.
 * });
 * console.log(`Created ${result.created} contacts`);
 * ```
 */
export function useExtractContactsFromEmails() {
  const queryClient = useQueryClient();

  return useMutation<ExtractContactsResult, Error, ExtractContactsParams>({
    mutationFn: async (params: ExtractContactsParams = {}) => {
      return await contactsApi.extractContactsFromEmails(params);
    },
    onSuccess: () => {
      // Invalidate all contact data after extraction
      queryClient.invalidateQueries({ queryKey: contactsKeys.all });
    },
  });
}

/**
 * Hook for importing contacts from vCard (.vcf) file
 * Supports vCard 3.0 and 4.0 formats (Outlook, Apple, Google exports)
 *
 * @example
 * ```tsx
 * const importVCard = useImportFromVCard();
 *
 * // From file input
 * const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
 *   const file = e.target.files?.[0];
 *   if (file) {
 *     const result = await importVCard.mutateAsync({ file });
 *     console.log(`Imported ${result.imported} contacts`);
 *   }
 * };
 *
 * // From raw vCard content
 * const result = await importVCard.mutateAsync({
 *   content: 'BEGIN:VCARD\nVERSION:3.0\n...\nEND:VCARD',
 * });
 * ```
 */
export function useImportFromVCard() {
  const queryClient = useQueryClient();

  return useMutation<VCardImportResult, Error, { file?: File; content?: string }>({
    mutationFn: async ({ file, content }) => {
      if (file) {
        return await contactsApi.importFromVCard(file);
      } else if (content) {
        return await contactsApi.importFromVCardContent(content);
      }
      throw new Error('Either file or content must be provided');
    },
    onSuccess: () => {
      // Invalidate all contact data after import
      queryClient.invalidateQueries({ queryKey: contactsKeys.all });
    },
  });
}

// ============================================================================
// VIP Contact Hooks
// ============================================================================

/**
 * Query options for fetching VIP contacts
 */
export function vipContactsOptions() {
  return queryOptions({
    queryKey: contactsKeys.vip(),
    queryFn: async () => {
      return await contactsApi.listVipContacts();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook for fetching VIP contacts list
 *
 * @example
 * ```tsx
 * const { data, isPending } = useVipContacts();
 * const vipContacts = data?.contacts ?? [];
 * ```
 */
export function useVipContacts() {
  return useQuery(vipContactsOptions());
}

/**
 * Hook for toggling contact VIP status
 *
 * @example
 * ```tsx
 * const toggleVip = useToggleVip();
 * await toggleVip.mutateAsync('contact-id');
 * ```
 */
export function useToggleVip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return await contactsApi.toggleVip(id);
    },
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: contactsKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: contactsKeys.vip() });

      // Snapshot the previous value
      const previousContact = queryClient.getQueryData<Contact>(contactsKeys.detail(id));

      // Optimistically update
      if (previousContact) {
        queryClient.setQueryData<Contact>(contactsKeys.detail(id), {
          ...previousContact,
          isVip: !previousContact.isVip,
        });
      }

      return { previousContact };
    },
    onError: (_, id, context) => {
      // Rollback on error
      if (context?.previousContact) {
        queryClient.setQueryData(contactsKeys.detail(id), context.previousContact);
      }
    },
    onSettled: (_, __, id) => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: contactsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactsKeys.vip() });
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
    },
  });
}
