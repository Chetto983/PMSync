import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useBulkMoveEmails,
  useBulkMarkRead,
  useBulkDeleteEmails,
  useUpdateEmail,
  useDeleteEmail,
  useUpdatePreferences,
} from '@/hooks/queries';
import { apiClient } from '@/lib/api';
import type { Email, ListEmailsParams } from '@/lib/api/emails';
import { useEmailUIStore } from '@/stores/email-ui-store';
import type { ThreadListItemData } from '@/components/email/list';
import type { SenderContactMap } from '@/lib/api/contacts';
import { extractEmailAddress } from '@/components/email/utils/email-formatters';
import { getAvatarUrl } from '@/lib/utils/gravatar';

/**
 * Parameters for useEmailPageActions hook.
 * Accepts all state/setters the action handlers need from the page component.
 */
export interface UseEmailPageActionsParams {
  emails: Email[];
  threads: ThreadListItemData[];
  selectedEmail: Email | null | undefined;
  senderPhotos: SenderContactMap | undefined;
  emailQueryParams: ListEmailsParams;
  optimisticUpdateEmail: (emailId: string, updates: Partial<Email>) => void;
  optimisticRemoveEmail: (emailId: string) => void;
  setSelectedThreadId: (id: string | null) => void;
  setLabelPickerOpen: (open: boolean) => void;
  setLabelPickerEmailIds: (ids: string[]) => void;
  setFolderPickerOpen: (open: boolean) => void;
  setFolderPickerEmailId: (id: string | null) => void;
  foldersData: { foldersByProvider?: Record<string, { id: string; name: string; path?: string }[]> } | undefined;
  preferences: { folderOrders?: Record<string, string[]> } | undefined;
}

/**
 * Hook that encapsulates all email page action handlers.
 * Extracted from EmailPage to keep the page component under 500 lines.
 */
export function useEmailPageActions(params: UseEmailPageActionsParams) {
  const {
    emails,
    threads,
    selectedEmail,
    senderPhotos,
    optimisticUpdateEmail,
    optimisticRemoveEmail,
    setSelectedThreadId,
    setLabelPickerOpen,
    setLabelPickerEmailIds,
    setFolderPickerOpen,
    setFolderPickerEmailId,
    foldersData,
    preferences,
  } = params;

  const router = useRouter();
  const toast = useToast();
  const t = useTranslations();
  const { clearSelection } = useEmailUIStore();

  // Mutations
  const moveEmails = useBulkMoveEmails();
  const markRead = useBulkMarkRead();
  const bulkDelete = useBulkDeleteEmails();
  const updateEmail = useUpdateEmail();
  const deleteEmail = useDeleteEmail();
  const updatePreferences = useUpdatePreferences();

  // Format single email for ExpandedMessage component
  const selectedEmailData = useMemo(() => {
    if (!selectedEmail) return null;
    const senderEmail = extractEmailAddress(selectedEmail.from);
    const senderInfo = senderPhotos?.[senderEmail];
    const isKnownContact = !!senderInfo;
    return {
      id: selectedEmail.id,
      from: selectedEmail.from,
      to: selectedEmail.to || [],
      cc: selectedEmail.cc,
      date: new Date(selectedEmail.receivedAt).toLocaleDateString(),
      subject: selectedEmail.subject || '',
      body: selectedEmail.bodyHtml || selectedEmail.bodyText || '',
      isUnread: !selectedEmail.isRead,
      isFlagged: selectedEmail.isFlagged || selectedEmail.isStarred || false,
      hasAttachments: (selectedEmail.attachments?.length ?? 0) > 0,
      attachments: selectedEmail.attachments?.map((att) => ({
        id: att.id,
        name: att.filename,
        size: att.size,
        contentId: att.contentId,
      })),
      avatarUrl: getAvatarUrl(senderEmail, senderInfo?.photoUrl, isKnownContact),
      aiPriority: selectedEmail.aiPriority ?? null,
      aiPriorityReason: selectedEmail.aiPriorityReason ?? null,
      aiSentiment: selectedEmail.aiSentiment ?? null,
      aiLabels: selectedEmail.aiLabels ?? null,
    };
  }, [selectedEmail, senderPhotos]);

  const handleReply = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?mode=reply&emailId=${messageId}`);
  }, [router]);

  const handleReplyAll = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?mode=replyAll&emailId=${messageId}`);
  }, [router]);

  const handleForward = useCallback((messageId: string) => {
    router.push(`/dashboard/email/compose?mode=forward&emailId=${messageId}`);
  }, [router]);

  const handleFlagMessage = useCallback(async (messageId: string) => {
    if (!selectedEmailData || selectedEmailData.id !== messageId) return;
    try {
      await updateEmail.mutateAsync({
        emailId: messageId,
        dto: { isFlagged: !selectedEmailData.isFlagged },
      });
    } catch {
      toast.error(t.common.genericError);
    }
  }, [selectedEmailData, updateEmail, toast, t]);

  const handleLabelsMessage = useCallback((messageId: string) => {
    setLabelPickerEmailIds([messageId]);
    setLabelPickerOpen(true);
  }, [setLabelPickerEmailIds, setLabelPickerOpen]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    optimisticRemoveEmail(messageId);
    setSelectedThreadId(null);

    try {
      await deleteEmail.mutateAsync(messageId);
      toast.success(t.common.success ?? 'Deleted');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [deleteEmail, toast, t, optimisticRemoveEmail, setSelectedThreadId]);

  const handleArchiveMessage = useCallback(async (messageId: string) => {
    optimisticRemoveEmail(messageId);
    setSelectedThreadId(null);

    try {
      await moveEmails.mutateAsync({ emailIds: [messageId], targetFolder: 'ARCHIVE' });
      toast.success(t.common.success ?? 'Archived');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [moveEmails, toast, t, optimisticRemoveEmail, setSelectedThreadId]);

  const handleMoveMessage = useCallback((messageId: string) => {
    setFolderPickerEmailId(messageId);
    setFolderPickerOpen(true);
  }, [setFolderPickerEmailId, setFolderPickerOpen]);

  const handleMoveMessageToFolder = useCallback(async (messageId: string, targetFolder: string) => {
    optimisticRemoveEmail(messageId);
    setSelectedThreadId(null);

    try {
      await moveEmails.mutateAsync({ emailIds: [messageId], targetFolder });
      toast.success(t.common.success ?? 'Moved');
    } catch {
      toast.error(t.common.genericError);
    }
  }, [moveEmails, toast, t, optimisticRemoveEmail, setSelectedThreadId]);

  const handleDownloadAttachment = useCallback(async (messageId: string, attachmentId: string) => {
    try {
      const response = await apiClient.get<Blob>(`/emails/${messageId}/attachments/${attachmentId}/download`, {
        responseType: 'blob',
      });

      if (response.status !== 200) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const disposition = response.headers['content-disposition'];
      let filename = 'attachment';
      if (disposition && disposition.indexOf('attachment') !== -1) {
        const matches = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/.exec(disposition);
        if (matches) {
          filename = decodeURIComponent(matches[1] || matches[2]);
        }
      }

      if (filename === 'attachment' && selectedEmailData) {
        const att = selectedEmailData.attachments?.find(a => a.id === attachmentId);
        if (att) filename = att.name;
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Download failed', error);
      toast.error(t.common.genericError || 'Download failed');
    }
  }, [selectedEmailData, toast, t]);

  const handleBulkMarkAsRead = useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => optimisticUpdateEmail(id, { isRead: true }));
      try {
        await markRead.mutateAsync({ emailIds: ids, isRead: true });
        clearSelection();
        toast.success(t.common.success ?? 'Done');
      } catch {
        ids.forEach((id) => optimisticUpdateEmail(id, { isRead: false }));
        toast.error(t.common.genericError);
      }
    },
    [markRead, toast, t, optimisticUpdateEmail, clearSelection]
  );

  const handleBulkMarkAsUnread = useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => optimisticUpdateEmail(id, { isRead: false }));
      try {
        await markRead.mutateAsync({ emailIds: ids, isRead: false });
        clearSelection();
        toast.success(t.common.success ?? 'Done');
      } catch {
        ids.forEach((id) => optimisticUpdateEmail(id, { isRead: true }));
        toast.error(t.common.genericError);
      }
    },
    [markRead, toast, t, optimisticUpdateEmail, clearSelection]
  );

  const handleBulkArchive = useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => optimisticRemoveEmail(id));
      try {
        await moveEmails.mutateAsync({ emailIds: ids, targetFolder: 'ARCHIVE' });
        clearSelection();
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [moveEmails, toast, t, optimisticRemoveEmail, clearSelection]
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => optimisticRemoveEmail(id));
      try {
        await bulkDelete.mutateAsync(ids);
        clearSelection();
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [bulkDelete, toast, t, optimisticRemoveEmail, clearSelection]
  );

  const handleBulkMove = useCallback((_ids: string[]) => {
    toast.info(t.threadActions?.folderPickerComingSoon || 'Folder picker coming soon');
  }, [toast, t]);

  const handleBulkLabel = useCallback((ids: string[]) => {
    setLabelPickerEmailIds(ids);
    setLabelPickerOpen(true);
  }, [setLabelPickerEmailIds, setLabelPickerOpen]);

  const handleFlag = useCallback(
    async (id: string) => {
      const email = threads.find((t) => t.id === id);
      if (!email) return;
      try {
        await updateEmail.mutateAsync({
          emailId: id,
          dto: { isFlagged: !email.isFlagged },
        });
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [threads, updateEmail, toast, t]
  );

  const handleArchive = useCallback(
    async (id: string) => {
      try {
        await moveEmails.mutateAsync({ emailIds: [id], targetFolder: 'ARCHIVE' });
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [moveEmails, toast, t]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEmail.mutateAsync(id);
        toast.success(t.common.success ?? 'Done');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [deleteEmail, toast, t]
  );

  const handleLabelPickerSuccess = useCallback(() => {
    toast.success(t.common.success ?? 'Labels added');
    setLabelPickerOpen(false);
    setLabelPickerEmailIds([]);
  }, [toast, t, setLabelPickerOpen, setLabelPickerEmailIds]);

  const handleLabelPickerClose = useCallback(() => {
    setLabelPickerOpen(false);
    setLabelPickerEmailIds([]);
  }, [setLabelPickerOpen, setLabelPickerEmailIds]);

  // Get current label IDs for selected emails (intersection of all labels)
  const getCurrentLabelIds = useCallback(
    (ids: string[]): string[] => {
      const extractLabelIds = (emailLabels?: { label?: { id: string } }[]): string[] =>
        emailLabels?.map((el) => el.label?.id).filter((id): id is string => !!id) || [];

      if (ids.length === 1 && selectedEmail && selectedEmail.id === ids[0]) {
        return extractLabelIds(selectedEmail.emailLabels);
      }

      const selectedEmails = emails.filter((e) => ids.includes(e.id));
      if (selectedEmails.length === 0) return [];

      const firstEmailLabels = new Set(extractLabelIds(selectedEmails[0].emailLabels));

      if (selectedEmails.length === 1) {
        return Array.from(firstEmailLabels);
      }

      for (let i = 1; i < selectedEmails.length; i++) {
        const emailLabelsSet = new Set(extractLabelIds(selectedEmails[i].emailLabels));
        firstEmailLabels.forEach((labelId) => {
          if (!emailLabelsSet.has(labelId)) {
            firstEmailLabels.delete(labelId);
          }
        });
      }
      return Array.from(firstEmailLabels);
    },
    [emails, selectedEmail]
  );

  const handleEmailDrop = useCallback(
    async (emailIds: string[], folderId: string, folderName: string) => {
      const draggedEmails = threads.filter((t) => emailIds.includes(t.id));
      if (draggedEmails.length === 0) return;

      const emailProviderId = draggedEmails[0].providerId;
      if (!emailProviderId) {
        toast.error(t.errors?.missingProviderInfo || 'Email provider information is missing');
        return;
      }

      try {
        await moveEmails.mutateAsync({ emailIds, targetFolder: folderId });
        const message =
          emailIds.length === 1
            ? t.emailList.emailMoved.replace('{folder}', folderName)
            : t.emailList.emailsMoved
              .replace('{count}', emailIds.length.toString())
              .replace('{folder}', folderName);
        toast.success(message);
      } catch {
        toast.error(t.errors?.moveFailed || 'Failed to move email(s). Please try again.');
      }
    },
    [threads, moveEmails, toast, t]
  );

  const handleFolderReorder = useCallback(
    (providerId: string, activeId: string, overId: string) => {
      const providerFolders = foldersData?.foldersByProvider?.[providerId] || [];
      const currentOrder = preferences?.folderOrders?.[providerId] || providerFolders.map((f) => f.id);

      const oldIndex = currentOrder.indexOf(activeId);
      const newIndex = currentOrder.indexOf(overId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const newOrder = [...currentOrder];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, activeId);

      updatePreferences.mutate({
        folderOrders: {
          ...(preferences?.folderOrders || {}),
          [providerId]: newOrder,
        },
      });
    },
    [foldersData?.foldersByProvider, preferences?.folderOrders, updatePreferences]
  );

  return {
    handleReply, handleReplyAll, handleForward, handleFlagMessage,
    handleLabelsMessage, handleDeleteMessage, handleArchiveMessage,
    handleMoveMessage, handleMoveMessageToFolder, handleDownloadAttachment,
    handleBulkMarkAsRead, handleBulkMarkAsUnread, handleBulkArchive,
    handleBulkDelete, handleBulkMove, handleBulkLabel,
    handleFlag, handleArchive, handleDelete,
    handleLabelPickerSuccess, handleLabelPickerClose, getCurrentLabelIds,
    handleEmailDrop, handleFolderReorder,
    selectedEmailData, updateEmail, toast,
  };
}
