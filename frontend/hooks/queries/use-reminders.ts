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
  type Reminder,
  type ListRemindersResponse,
  type TelegramSettings,
} from '@/lib/api/reminders';

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
  });
}

/** Mutation: mark reminder as completed */
export function useCompleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Reminder> => {
      const response = await remindersApi.complete(id);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

/** Mutation: soft-delete reminder (status → annullato) */
export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Reminder> => {
      const response = await remindersApi.delete(id);
      return response.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
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
