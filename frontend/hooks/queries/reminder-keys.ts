/**
 * Query Key Factory for Reminders & Telegram Settings
 *
 * Hierarchical structure for cache invalidation.
 */

export const reminderKeys = {
  all: ['reminders'] as const,
  lists: () => [...reminderKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...reminderKeys.lists(), filters] as const,
  detail: (id: string) => [...reminderKeys.all, 'detail', id] as const,
};

export const telegramKeys = {
  all: ['telegram'] as const,
  settings: () => [...telegramKeys.all, 'settings'] as const,
};
