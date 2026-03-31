/**
 * CRM Tickets API module
 *
 * Backend: CrmModule > TicketController
 * Endpoints: /api/v1/crm/tickets
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface Ticket {
  id: string;
  tenantId: string;
  subject: string;
  description: string | null;
  status: string; // open, in_progress, waiting, resolved, closed
  priority: string; // low, medium, high, urgent
  assigneeId: string | null;
  contactId: string | null;
  accountId: string | null;
  emailId: string | null;
  emailThreadId: string | null;
  slaDeadline: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; name: string; email: string } | null;
  contact?: { id: string; tenantId: string; displayName: string | null; emails?: unknown } | null;
  account?: { id: string; name: string } | null;
  comments?: TicketComment[];
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string; email: string };
}

export interface ListTicketsParams {
  search?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  contactId?: string;
  accountId?: string;
  limit?: number;
  offset?: number;
}

export interface ListTicketsResponse {
  data: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateTicketDto {
  subject: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  contactId?: string;
  accountId?: string;
  emailId?: string;
  emailThreadId?: string;
  slaDeadline?: string;
}

export interface UpdateTicketDto {
  subject?: string;
  description?: string | null;
  priority?: string;
  assigneeId?: string | null;
  contactId?: string | null;
  accountId?: string | null;
  slaDeadline?: string | null;
}

export interface CreateTicketCommentDto {
  body: string;
  isInternal?: boolean;
}

// ---- API ----

export const crmTicketsApi = {
  list(params?: ListTicketsParams) {
    return apiClient.get<ListTicketsResponse>('/crm/tickets', { params });
  },

  getById(id: string) {
    return apiClient.get<Ticket>(`/crm/tickets/${id}`);
  },

  create(dto: CreateTicketDto) {
    return apiClient.post<Ticket>('/crm/tickets', dto);
  },

  update(id: string, dto: UpdateTicketDto) {
    return apiClient.patch<Ticket>(`/crm/tickets/${id}`, dto);
  },

  delete(id: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/tickets/${id}`);
  },

  changeStatus(id: string, status: string) {
    return apiClient.patch<Ticket>(`/crm/tickets/${id}/status`, { status });
  },

  assign(id: string, assigneeId: string | null) {
    return apiClient.patch<Ticket>(`/crm/tickets/${id}/assign`, { assigneeId });
  },

  listComments(ticketId: string) {
    return apiClient.get<TicketComment[]>(`/crm/tickets/${ticketId}/comments`);
  },

  addComment(ticketId: string, dto: CreateTicketCommentDto) {
    return apiClient.post<TicketComment>(`/crm/tickets/${ticketId}/comments`, dto);
  },
};
