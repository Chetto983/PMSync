export const tasksKeys = {
  all: ['tasks'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...tasksKeys.all, 'list', filters ?? {}] as const,
  views: () => [...tasksKeys.all, 'views'] as const,
} as const;
