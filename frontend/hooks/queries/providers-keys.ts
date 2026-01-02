/**
 * Query keys for providers
 */

export const providersKeys = {
  all: ['providers'] as const,
  list: () => [...providersKeys.all, 'list'] as const,
  detail: (id: string) => [...providersKeys.all, 'detail', id] as const,
  aliases: (id: string) => [...providersKeys.all, 'aliases', id] as const,
};
