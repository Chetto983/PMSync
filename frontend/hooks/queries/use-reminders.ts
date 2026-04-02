/**
 * TanStack Query hooks for Reminders & Telegram Settings
 *
 * Supports: list, detail, create, update, complete, delete.
 * Telegram: get settings, update, disconnect.
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { reminderKeys, telegramKeys } from './reminder-keys';
import {
  remindersApi,
  telegramApi,
  type ListRemindersParams,
  type CreateReminderDto,
  type UpdateReminderDto,
  type UpdateTelegramSettingsDto,
  type BulkUpdateRemindersDto,
  type Reminder,
  type ListRemindersResponse,
  type TelegramSettings,
  type UnifiedListParams,
  type UnifiedReminderItem,
  type UnifiedReminderListResponse,
  type UnifiedSource,
} from '@/lib/api/reminders';
import { getGlobalToast, getGlobalTranslations } from '@/lib/context/toast-context';

interface ReminderListEnvelope {
  data?: Reminder[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// ============================================================================
// Query Options
// ============================================================================

export function remindersListOptions(params?: ListRemindersParams) {
  return queryOptions({
    queryKey: reminderKeys.list(params as Record<string, unknown>),
    queryFn: async (): Promise<ListRemindersResponse> => {
      const response = await remindersApi.list(params);
      const envelope = response.data as ReminderListEnvelope | undefined;
      // Backend returns { data: Reminder[], meta: { total, page, limit } }
      const reminders = Array.isArray(envelope?.data) ? envelope.data : [];
      const meta = envelope?.meta ?? {};
      return {
        reminders,
        total: meta.total ?? reminders.length,
        page: meta.page ?? 1,
        limit: meta.limit ?? 20,
      };
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

export function reminderDetailOptions(id: string) {
  return queryOptions({
    queryKey: reminderKeys.detail(id),
    queryFn: async (): Promise<Reminder> => {
      const response = await remindersApi.get(id);
      return response.data?.data;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled: !!id,
  });
}

export function telegramSettingsOptions() {
  return queryOptions({
    queryKey: telegramKeys.settings(),
    queryFn: async (): Promise<TelegramSettings | null> => {
      const response = await telegramApi.getSettings();
      return response.data?.data ?? null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

// ============================================================================
// Reminder Hooks
// ============================================================================

/** Hook for reminder list with optional filters */
export function useReminders(params?: ListRemindersParams) {
  return useQuery(remindersListOptions(params));
}

/** Hook for single reminder detail */
export function useReminder(id: string) {
  return useQuery(reminderDetailOptions(id));
}

/** Mutation: create reminder (supports AI parsing via inputUtente) */
export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateReminderDto): Promise<Reminder> => {
      const response = await remindersApi.create(dto);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.createFailed);
    },
  });
}

/** Mutation: update reminder */
export function useUpdateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateReminderDto }): Promise<Reminder> => {
      const response = await remindersApi.update(id, dto);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.updateFailed);
    },
  });
}

/** Mutation: mark reminder as completed (with optimistic update) */
export function useCompleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Reminder> => {
      const response = await remindersApi.complete(id);
      return response.data?.data;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: reminderKeys.all });
      const queries = queryClient.getQueriesData<ListRemindersResponse>({ queryKey: reminderKeys.lists() });
      const snapshots = queries.map(([key, data]) => [key, data] as const);
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<ListRemindersResponse>(key, {
          ...data,
          reminders: data.reminders.map((r) =>
            r.id === id ? { ...r, status: 'completato' as const, completatoAt: new Date().toISOString() } : r,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.completeFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

/** Mutation: delete reminder permanently (with optimistic update) */
export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Reminder> => {
      const response = await remindersApi.delete(id);
      return response.data?.data;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: reminderKeys.all });
      const queries = queryClient.getQueriesData<ListRemindersResponse>({ queryKey: reminderKeys.lists() });
      const snapshots = queries.map(([key, data]) => [key, data] as const);
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData<ListRemindersResponse>(key, {
          ...data,
          reminders: data.reminders.filter((r) => r.id !== id),
          total: data.total - 1,
        });
      }
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.deleteFailed);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

/** Hook: search reminders by text query */
export function useSearchReminders(q: string) {
  return useQuery({
    queryKey: reminderKeys.search(q),
    queryFn: async (): Promise<ListRemindersResponse> => {
      const response = await remindersApi.search({ q });
      const envelope = response.data as ReminderListEnvelope | undefined;
      const reminders = Array.isArray(envelope?.data) ? envelope.data : [];
      const meta = envelope?.meta ?? {};
      return {
        reminders,
        total: meta.total ?? reminders.length,
        page: meta.page ?? 1,
        limit: meta.limit ?? 20,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    enabled: q.length >= 2,
  });
}

/** Mutation: bulk-update reminders (status/priority) */
export function useBulkUpdateReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: BulkUpdateRemindersDto): Promise<{ updated: number }> => {
      const response = await remindersApi.bulkUpdate(dto);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.bulkUpdateFailed);
    },
  });
}

// ============================================================================
// Unified Hooks (Reminder + EmailFollowUp)
// ============================================================================

interface UnifiedListEnvelope {
  data?: UnifiedReminderItem[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    counts?: { user: number; aiFollowUp: number };
  };
}

export function unifiedRemindersListOptions(params?: UnifiedListParams) {
  return queryOptions({
    queryKey: reminderKeys.unifiedList(params as Record<string, unknown>),
    queryFn: async (): Promise<UnifiedReminderListResponse> => {
      const response = await remindersApi.listUnified(params);
      const envelope = response.data as UnifiedListEnvelope | undefined;
      const items = Array.isArray(envelope?.data) ? envelope.data : [];
      const meta = envelope?.meta ?? {};
      return {
        items,
        total: meta.total ?? items.length,
        page: meta.page ?? 1,
        limit: meta.limit ?? 30,
        counts: meta.counts ?? { user: 0, aiFollowUp: 0 },
      };
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

/** Hook for unified reminder + follow-up list */
export function useUnifiedReminders(params?: UnifiedListParams) {
  return useQuery(unifiedRemindersListOptions(params));
}

/** Mutation: resolve a unified item */
export function useResolveUnified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, source }: { id: string; source: UnifiedSource }) => {
      const response = await remindersApi.resolveUnified(id, source);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.completeFailed);
    },
  });
}

/** Mutation: snooze a unified item */
export function useSnoozeUnified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, source, dueDate }: { id: string; source: UnifiedSource; dueDate: string }) => {
      const response = await remindersApi.snoozeUnified(id, source, dueDate);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.updateFailed);
    },
  });
}

/** Mutation: convert follow-up to reminder */
export function useConvertFollowUpToReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (followUpId: string) => {
      const response = await remindersApi.convertToReminder(followUpId);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
      getGlobalToast().success(getGlobalTranslations().ai.reminders.followUp.converted);
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.createFailed);
    },
  });
}

/** Mutation: bulk-delete reminders permanently */
export function useBulkDeleteReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<{ deleted: number }> => {
      const response = await remindersApi.bulkDelete(ids);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
    onError: () => {
      getGlobalToast().error(getGlobalTranslations().ai.reminders.errors.bulkDeleteFailed);
    },
  });
}

// ============================================================================
// Telegram Settings Hooks
// ============================================================================

/** Hook for Telegram settings */
export function useTelegramSettings() {
  return useQuery(telegramSettingsOptions());
}

/** Mutation: update Telegram settings */
export function useUpdateTelegramSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateTelegramSettingsDto): Promise<TelegramSettings> => {
      const response = await telegramApi.updateSettings(dto);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: telegramKeys.all });
    },
  });
}

/** Mutation: disconnect Telegram */
export function useDisconnectTelegram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<null> => {
      await telegramApi.disconnect();
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: telegramKeys.all });
    },
  });
}
