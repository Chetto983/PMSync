import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import { type Contact, contactsApi } from '@/lib/api/contacts';
import { useContactStore } from '@/stores/contact-store';
import { contactsKeys } from '@/hooks/queries/contacts-keys';
import { logger } from '@/lib/logger';
import type { useContactsPageData } from './useContactsPageData';
import type { useContactForm } from './useContactForm';

type PageData = ReturnType<typeof useContactsPageData>;
type FormData = ReturnType<typeof useContactForm>;

interface ContactsCopy {
  alerts?: {
    selectProvider?: string;
    failedToSave?: string;
    deleteSuccess?: string;
    deleteError?: string;
    deletedCount?: string;
  };
  createDialog?: {
    create?: string;
  };
  editDialog?: {
    success?: string;
  };
}

export function useContactsPageHandlers(
  data: PageData,
  form: FormData,
  contactsCopy: ContactsCopy,
) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    providers,
    selectedContact,
    setSelectedContact,
    setSyncingProviders,
    setSnackbar,
    setActionLoading,
    setDeleteDialogOpen,
    contactToDelete,
    setContactToDelete,
    selectedIds,
    filteredContacts,
    setSelectedIds,
    clearSelection,
    createContactMutation,
    updateContactMutation,
    deleteContactMutation,
    syncAllMutation,
    loadContacts,
  } = data;

  const {
    contactForm,
    contactDialogMode,
    setContactDialogOpen,
    resetForCreate,
    resetForEdit,
  } = form;

  // Dialog handlers
  const openCreateContactDialog = useCallback(() => {
    resetForCreate(providers);
  }, [resetForCreate, providers]);

  const openEditContactDialog = useCallback(() => {
    if (!selectedContact) return;
    resetForEdit(selectedContact, providers);
  }, [resetForEdit, selectedContact, providers]);

  const handleSubmitContact = useCallback(async () => {
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
        await createContactMutation.mutateAsync({
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
          isVip: contactForm.isVip,
          emails: contactForm.email
            ? [{ value: contactForm.email, primary: true }]
            : undefined,
          phoneNumbers: contactForm.phone
            ? [{ value: contactForm.phone, primary: true }]
            : undefined,
        });
      } else if (selectedContact) {
        await updateContactMutation.mutateAsync({
          id: selectedContact.id,
          data: {
            firstName: contactForm.firstName || undefined,
            lastName: contactForm.lastName || undefined,
            displayName: contactForm.displayName ||
              (contactForm.firstName || contactForm.lastName
                ? `${contactForm.firstName} ${contactForm.lastName}`.trim()
                : undefined),
            company: contactForm.company || undefined,
            jobTitle: contactForm.jobTitle || undefined,
            notes: contactForm.notes || undefined,
            isVip: contactForm.isVip,
            emails: contactForm.email
              ? [{ value: contactForm.email, primary: true }]
              : undefined,
            phoneNumbers: contactForm.phone
              ? [{ value: contactForm.phone, primary: true }]
              : undefined,
          },
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
  }, [contactForm, contactDialogMode, selectedContact, contactsCopy, createContactMutation, updateContactMutation, loadContacts, setContactDialogOpen, setSnackbar, setActionLoading]);

  const openDeleteDialog = useCallback((contact: Contact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  }, [setContactToDelete, setDeleteDialogOpen]);

  const handleDeleteContact = useCallback(async () => {
    if (!contactToDelete) return;

    try {
      setActionLoading(true);
      await deleteContactMutation.mutateAsync(contactToDelete.id);
      // Store removal for instant UI update (mutation's onSuccess invalidates cache)
      useContactStore.getState().deleteContact(contactToDelete.id);
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
  }, [contactToDelete, contactsCopy, deleteContactMutation, setDeleteDialogOpen, setContactToDelete, selectedContact, setSelectedContact, setSnackbar, setActionLoading]);

  // Bulk delete handler
  const handleBulkDelete = useCallback(async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    try {
      setActionLoading(true);
      await contactsApi.bulkDeleteContacts(idsToDelete);
      // Remove from Zustand store immediately for instant UI update.
      // loadContacts() returns stale cached data — store removal is the source of truth.
      for (const id of idsToDelete) {
        useContactStore.getState().deleteContact(id);
      }
      // Invalidate cache so next fetch gets fresh data (not stale cached contacts)
      queryClient.invalidateQueries({ queryKey: contactsKeys.list() });
      queryClient.invalidateQueries({ queryKey: contactsKeys.counts() });
      clearSelection();
      setSnackbar({
        open: true,
        message: (contactsCopy.alerts?.deletedCount || 'Deleted {count} contacts').replace('{count}', String(idsToDelete.length)),
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
  }, [selectedIds, contactsCopy, queryClient, clearSelection, setSnackbar, setActionLoading]);

  // Sync handler
  const handleSyncContacts = useCallback(async () => {
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

      const result = await syncAllMutation.mutateAsync();

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
  }, [providers, setSyncingProviders, syncAllMutation, loadContacts, setSnackbar]);

  // Contact click handler
  const handleContactClick = useCallback((contact: Contact) => {
    setSelectedContact(contact);
  }, [setSelectedContact]);

  // Close detail panel handler
  const handleCloseDetail = useCallback(() => {
    setSelectedContact(null);
  }, [setSelectedContact]);

  // Email handler
  const handleEmail = useCallback((email: string) => {
    if (email) {
      router.push(`/dashboard/email/compose?to=${encodeURIComponent(email)}`);
    }
  }, [router]);

  // VIP toggle handler
  const handleToggleVip = useCallback(async (id: string, isVip: boolean) => {
    useContactStore.getState().updateContact(id, { isVip });

    try {
      await updateContactMutation.mutateAsync({
        id,
        data: { isVip },
      });
    } catch {
      useContactStore.getState().updateContact(id, { isVip: !isVip });
    }
  }, [updateContactMutation]);

  // Select all handler
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
  }, [setSelectedIds, filteredContacts]);

  return {
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
  };
}
