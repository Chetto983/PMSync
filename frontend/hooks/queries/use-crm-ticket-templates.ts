import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crmTicketTemplateKeys } from './crm-ticket-templates-keys';
import {
  listTicketTemplates,
  createTicketTemplate,
  updateTicketTemplate,
  deleteTicketTemplate,
} from '@/lib/api/crm-ticket-templates';

export function ticketTemplateListOptions(category?: string) {
  return queryOptions({
    queryKey: crmTicketTemplateKeys.list(category),
    queryFn: () => listTicketTemplates(category),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useTicketTemplates(category?: string) {
  return useQuery(ticketTemplateListOptions(category));
}

export function useCreateTicketTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTicketTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: crmTicketTemplateKeys.all }),
  });
}

export function useUpdateTicketTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; name?: string; body?: string; category?: string | null }) =>
      updateTicketTemplate(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmTicketTemplateKeys.all }),
  });
}

export function useDeleteTicketTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTicketTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: crmTicketTemplateKeys.all }),
  });
}
