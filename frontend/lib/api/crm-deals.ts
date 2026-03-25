/**
 * CRM Deals API module
 *
 * Backend: CrmModule > DealController
 * Endpoints: /api/v1/crm/deals
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface CrmDealStage {
  id: string;
  name: string;
  color: string | null;
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface CrmDealPipeline {
  id: string;
  name: string;
}

export interface CrmDealAccount {
  id: string;
  name: string;
}

export interface CrmDealContact {
  id: string;
  tenantId: string;
  displayName: string | null;
  company: string | null;
}

export interface CrmDealContactLink {
  id: string;
  dealId: string;
  contactId: string;
  tenantId: string;
  role: string | null;
  createdAt: string;
  contact: CrmDealContact;
}

export interface CrmDeal {
  id: string;
  tenantId: string;
  pipelineId: string;
  stageId: string;
  accountId: string | null;
  name: string;
  amount: string | null; // Decimal comes as string from Prisma
  currency: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  priority: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  pipeline?: CrmDealPipeline;
  stage?: CrmDealStage;
  account?: CrmDealAccount | null;
  dealContacts?: CrmDealContactLink[];
  _count?: { dealContacts: number; dealProducts: number; activities: number };
}

export interface CrmDealListResponse {
  data: CrmDeal[];
  total: number;
}

export interface ListDealsQuery {
  search?: string;
  pipelineId?: string;
  stageId?: string;
  accountId?: string;
  contactId?: string;
  expectedCloseDateFrom?: string;
  expectedCloseDateTo?: string;
  amountMin?: number;
  amountMax?: number;
  priority?: string;
  limit?: number;
  offset?: number;
}

export interface CreateDealDto {
  name: string;
  pipelineId: string;
  stageId: string;
  accountId?: string;
  amount?: number;
  currency?: string;
  expectedCloseDate?: string;
  priority?: string;
  source?: string;
  notes?: string;
}

export interface UpdateDealDto {
  name?: string;
  pipelineId?: string;
  stageId?: string;
  accountId?: string | null;
  amount?: number | null;
  currency?: string;
  expectedCloseDate?: string | null;
  closedAt?: string | null;
  priority?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface LinkDealContactDto {
  contactId: string;
  role?: string;
}

// ---- Activity Types ----

export interface CrmActivity {
  id: string;
  tenantId: string;
  dealId: string;
  type: 'STAGE_CHANGE' | 'NOTE' | 'EMAIL' | 'CALL' | 'MEETING' | 'TASK';
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CrmActivityListResponse {
  data: CrmActivity[];
  total: number;
}

export interface CreateActivityDto {
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'TASK';
  description?: string;
  date?: string;
  durationMinutes?: number;
}

export interface ListActivitiesQuery {
  limit?: number;
  offset?: number;
}

// ---- API ----

export const crmDealsApi = {
  list(query?: ListDealsQuery) {
    return apiClient.get<CrmDealListResponse>('/crm/deals', { params: query });
  },

  getById(id: string) {
    return apiClient.get<CrmDeal>(`/crm/deals/${id}`);
  },

  create(dto: CreateDealDto) {
    return apiClient.post<CrmDeal>('/crm/deals', dto);
  },

  update(id: string, dto: UpdateDealDto) {
    return apiClient.patch<CrmDeal>(`/crm/deals/${id}`, dto);
  },

  delete(id: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/deals/${id}`);
  },

  // Stage transition
  changeStage(dealId: string, stageId: string) {
    return apiClient.patch<CrmDeal>(`/crm/deals/${dealId}/stage`, { stageId });
  },

  // Deal-Contact associations
  getContacts(dealId: string) {
    return apiClient.get<CrmDealContactLink[]>(`/crm/deals/${dealId}/contacts`);
  },

  linkContact(dealId: string, dto: LinkDealContactDto) {
    return apiClient.post<CrmDealContactLink>(`/crm/deals/${dealId}/contacts`, dto);
  },

  unlinkContact(dealId: string, contactId: string) {
    return apiClient.delete<{ deleted: boolean }>(
      `/crm/deals/${dealId}/contacts/${contactId}`,
    );
  },

  // Activities
  listActivities(dealId: string, query?: ListActivitiesQuery) {
    return apiClient.get<CrmActivityListResponse>(`/crm/deals/${dealId}/activities`, {
      params: query,
    });
  },

  createActivity(dealId: string, dto: CreateActivityDto) {
    return apiClient.post<CrmActivity>(`/crm/deals/${dealId}/activities`, dto);
  },
};
