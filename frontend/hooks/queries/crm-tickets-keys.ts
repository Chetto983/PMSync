import type { ListTicketsParams } from '@/lib/api/crm-tickets';

export const crmTicketsKeys = {
  all: ['crm-tickets'] as const,
  list: () => [...crmTicketsKeys.all, 'list'] as const,
  listFiltered: (params?: ListTicketsParams) => [...crmTicketsKeys.list(), params ?? {}] as const,
  details: () => [...crmTicketsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmTicketsKeys.details(), id] as const,
  comments: (ticketId: string) => [...crmTicketsKeys.all, 'comments', ticketId] as const,
} as const;
