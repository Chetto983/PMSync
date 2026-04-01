export const tasksKeys = {
  all: ['tasks'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...tasksKeys.all, 'list', filters ?? {}] as const,
} as const;
