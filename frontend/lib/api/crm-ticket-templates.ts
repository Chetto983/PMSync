import { apiClient } from '../api-client';

export interface TicketTemplate {
  id: string;
  tenantId: string;
  name: string;
  body: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listTicketTemplates(category?: string): Promise<TicketTemplate[]> {
  const { data } = await apiClient.get('/crm/ticket-templates', {
    params: category ? { category } : undefined,
  });
  return data;
}

export async function createTicketTemplate(dto: {
  name: string;
  body: string;
  category?: string;
}): Promise<TicketTemplate> {
  const { data } = await apiClient.post('/crm/ticket-templates', dto);
  return data;
}

export async function updateTicketTemplate(
  id: string,
  dto: { name?: string; body?: string; category?: string | null },
): Promise<TicketTemplate> {
  const { data } = await apiClient.patch(`/crm/ticket-templates/${id}`, dto);
  return data;
}

export async function deleteTicketTemplate(id: string): Promise<void> {
  await apiClient.delete(`/crm/ticket-templates/${id}`);
}
