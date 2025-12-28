import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { emailApi, type Conversation } from '@/lib/api/email';
import { emailKeys } from '@/hooks/queries';
import { logger } from '@/lib/logger';

interface UseSelectionLogicProps {
    threads: (Email | Conversation)[];
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
    handleMarkAsRead: (emailIds: string[], isRead: boolean) => Promise<void> | void;
    handleArchive: (emailIds: string[]) => Promise<void> | void;
    handleBulkDeleteEmails: (emailIds: string[]) => Promise<void> | void;
}

export function useSelectionLogic({
    threads,
    onSuccess,
    onError,
    handleMarkAsRead,
    handleArchive,
    handleBulkDeleteEmails
}: UseSelectionLogicProps) {
    const t = useTranslations();
    const queryClient = useQueryClient();
    const selectedIds = useEmailStore((state) => state.selectedIds);
    // removed unused clearSelection declaration

    const getThreadKey = useCallback((thread: Email | Conversation) => {
        return 'threadId' in thread ? thread.threadId : thread.id;
    }, []);

    const handleSelectAll = useCallback(() => {
        const next = new Set<string>();
        for (const thread of threads) {
            const key = getThreadKey(thread);
            if (key) next.add(key);
        }
        useEmailStore.getState().setSelectedIds(next);
    }, [getThreadKey, threads]);

    const resolveEmailIdsForThread = useCallback(async (thread: Email | Conversation) => {
        if ('providerId' in thread) return [thread.id];

        try {
            const threadRes = await emailApi.getThread(thread.threadId);
            return threadRes.data.map((e) => e.id);
        } catch (error) {
            logger.error('[Mailbox] Failed to expand thread for bulk operation', { threadId: thread.threadId, error });
            return [thread.latestEmailId];
        }
    }, []);

    const resolveSelectedEmailIds = useCallback(async () => {
        const threadIds = Array.from(selectedIds);
        if (threadIds.length === 0) return { emailIds: [], threadCount: 0 };

        const selectedSet = new Set(threadIds);
        const selectedThreads = threads.filter((thread) => {
            const key = getThreadKey(thread);
            return key && selectedSet.has(key);
        });

        const emailIdArrays = await Promise.all(selectedThreads.map(resolveEmailIdsForThread));
        const emailIds = Array.from(new Set(emailIdArrays.flat())).filter(Boolean);

        return { emailIds, threadCount: threadIds.length };
    }, [getThreadKey, resolveEmailIdsForThread, selectedIds, threads]);

    // Bulk Handlers

    const handleBulkMarkRead = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;
        await handleMarkAsRead(emailIds, true);
    }, [handleMarkAsRead, resolveSelectedEmailIds]);

    const handleBulkMarkUnread = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;
        await handleMarkAsRead(emailIds, false);
    }, [handleMarkAsRead, resolveSelectedEmailIds]);

    const handleBulkDelete = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;

        // Perform immediate delete like archive (no confirmation dialog)
        // Note: Emails go to Trash first, so this is not destructive
        await handleBulkDeleteEmails(emailIds);
        useEmailStore.getState().clearSelection();
    }, [handleBulkDeleteEmails, resolveSelectedEmailIds]);

    const handleBulkStar = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;

        useEmailStore.getState().markAsStarred(emailIds, true);

        try {
            await emailApi.bulkStar(emailIds, true);
            queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
            queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
            queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
            onSuccess(t.email.messages.starred.replace('{count}', emailIds.length.toString()));
        } catch (error) {
            logger.error('Failed to star emails', { error });
            useEmailStore.getState().markAsStarred(emailIds, false);
            onError(t.email.messages.starFailed);
        }
    }, [queryClient, resolveSelectedEmailIds, t.email.messages, onSuccess, onError]);

    const handleBulkUnstar = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;
        useEmailStore.getState().markAsStarred(emailIds, false);
        try {
            await emailApi.bulkStar(emailIds, false);
            queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
            queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
            queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
            onSuccess(t.email.messages.unstarred.replace('{count}', emailIds.length.toString()));
        } catch (error) {
            logger.error('Failed to unstar emails', { error });
            useEmailStore.getState().markAsStarred(emailIds, true);
            onError(t.email.messages.unstarFailed);
        }
    }, [queryClient, resolveSelectedEmailIds, t.email.messages, onSuccess, onError]);

    const handleBulkFlag = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;
        useEmailStore.getState().markAsImportant(emailIds, true);

        try {
            await emailApi.bulkFlag(emailIds, true);
            queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
            queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
            queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
            onSuccess(t.email.messages.markedImportant.replace('{count}', emailIds.length.toString()));
        } catch (error) {
            logger.error('Failed to flag emails', { error });
            useEmailStore.getState().markAsImportant(emailIds, false);
            onError(t.email.messages.markedImportantFailed);
        }
    }, [queryClient, resolveSelectedEmailIds, t.email.messages, onSuccess, onError]);

    const handleBulkUnflag = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;
        useEmailStore.getState().markAsImportant(emailIds, false);

        try {
            await emailApi.bulkFlag(emailIds, false);
            queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
            queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
            queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
            onSuccess(t.email.messages.unmarkedImportant.replace('{count}', emailIds.length.toString()));
        } catch (error) {
            logger.error('Failed to unflag emails', { error });
            useEmailStore.getState().markAsImportant(emailIds, true);
            onError(t.email.messages.unmarkedImportantFailed);
        }
    }, [queryClient, resolveSelectedEmailIds, t.email.messages, onSuccess, onError]);

    const handleBulkArchiveDirect = useCallback(async () => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;
        useEmailStore.getState().clearSelection();
        await handleArchive(emailIds);
    }, [handleArchive, resolveSelectedEmailIds]);

    const handleBulkAddLabels = useCallback(async (labelIds: string[]) => {
        if (labelIds.length === 0) return;

        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;

        try {
            await emailApi.bulkAddLabels(emailIds, labelIds);
            useEmailStore.getState().clearSelection();
            queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
            queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
            queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
            onSuccess(t.email.messages.labelsAdded.replace('{count}', emailIds.length.toString()));
        } catch (error) {
            logger.error('Failed to add labels', { error });
            onError(t.email.messages.labelsFailed);
        }
    }, [queryClient, resolveSelectedEmailIds, t.email.messages, onSuccess, onError]);

    const handleBulkMoveToFolder = useCallback(async (folder: string) => {
        const { emailIds } = await resolveSelectedEmailIds();
        if (emailIds.length === 0) return;

        try {
            await emailApi.bulkMoveToFolder(emailIds, folder);
            useEmailStore.getState().clearSelection();
            queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
            queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
            queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
            onSuccess(t.email.messages.moved.replace('{count}', emailIds.length.toString()).replace('{folder}', folder));
        } catch (error) {
            logger.error('Failed to move emails', { error });
            onError(t.email.messages.moveFailed);
        }
    }, [queryClient, resolveSelectedEmailIds, t.email.messages, onSuccess, onError]);

    return {
        handleSelectAll,
        resolveSelectedEmailIds,
        resolveEmailIdsForThread,
        handleBulkMarkRead,
        handleBulkMarkUnread,
        handleBulkStar,
        handleBulkUnstar,
        handleBulkFlag,
        handleBulkUnflag,
        handleBulkDelete,
        handleBulkArchive: handleBulkArchiveDirect,
        handleBulkAddLabels,
        handleBulkMoveToFolder,
        selectedIds,
        getThreadKey
    };
}
