import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmTicketsApi,
  type ListTicketsParams,
  type CreateTicketDto,
  type UpdateTicketDto,
  type CreateTicketCommentDto,
} from '@/lib/api/crm-tickets';
import { crmTicketsKeys } from './crm-tickets-keys';

// ---- Query Options ----

export function crmTicketListOptions(params?: ListTicketsParams) {
  return queryOptions({
    queryKey: crmTicketsKeys.listFiltered(params),
    queryFn: () => crmTicketsApi.list(params).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmTicketDetailOptions(id: string) {
  return queryOptions({
    queryKey: crmTicketsKeys.detail(id),
    queryFn: () => crmTicketsApi.getById(id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

export function crmTicketCommentsOptions(ticketId: string) {
  return queryOptions({
    queryKey: crmTicketsKeys.comments(ticketId),
    queryFn: () => crmTicketsApi.listComments(ticketId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!ticketId,
  });
}

// ---- Hooks ----

export function useTickets(params?: ListTicketsParams) {
  return useQuery(crmTicketListOptions(params));
}

export function useTicket(id: string) {
  return useQuery(crmTicketDetailOptions(id));
}

export function useTicketComments(ticketId: string) {
  return useQuery(crmTicketCommentsOptions(ticketId));
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTicketDto) =>
      crmTicketsApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmTicketsKeys.all });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTicketDto }) =>
      crmTicketsApi.update(id, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmTicketsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmTicketsKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      crmTicketsApi.delete(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmTicketsKeys.all });
    },
  });
}

export function useChangeTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      crmTicketsApi.changeStatus(id, status).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmTicketsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmTicketsKeys.detail(variables.id),
      });
    },
  });
}

export function useAssignTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      crmTicketsApi.assign(id, assigneeId).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmTicketsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmTicketsKeys.detail(variables.id),
      });
    },
  });
}

export function useAddTicketComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTicketCommentDto) =>
      crmTicketsApi.addComment(ticketId, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: crmTicketsKeys.comments(ticketId),
      });
      queryClient.invalidateQueries({
        queryKey: crmTicketsKeys.detail(ticketId),
      });
    },
  });
}
