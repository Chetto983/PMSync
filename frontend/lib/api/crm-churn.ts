/**
 * CRM Churn Prediction API module
 *
 * Backend: CrmModule > ChurnController
 * Endpoints: /api/v1/crm/churn
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface ChurnContact {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  emails: unknown;
  lastInteractedAt: string | null;
}

export interface ChurnAccount {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
}

export interface ChurnSignal {
  id: string;
  contactId: string | null;
  accountId: string | null;
  probability: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: Record<string, number>;
  reasoning: string | null;
  computedAt: string;
  contact: ChurnContact | null;
  account: ChurnAccount | null;
}

export interface ChurnListResponse {
  data: ChurnSignal[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListChurnQuery {
  sort?: 'probability' | 'computedAt';
  order?: 'asc' | 'desc';
  threshold?: number;
  riskLevel?: string;
  accountId?: string;
  page?: number;
  pageSize?: number;
}

// ---- API ----

const BASE = '/crm/churn';

export const crmChurnApi = {
  listAtRisk: (query?: ListChurnQuery) =>
    apiClient.get<ChurnListResponse>(`${BASE}/at-risk`, { params: query }),

  getContactSignal: (contactId: string) =>
    apiClient.get<ChurnSignal>(`${BASE}/contact/${contactId}`),

  getAccountSignal: (accountId: string) =>
    apiClient.get<ChurnSignal>(`${BASE}/account/${accountId}`),

  computeContact: (contactId: string) =>
    apiClient.post<ChurnSignal>(`${BASE}/contact/${contactId}/compute`),

  acknowledge: (id: string) =>
    apiClient.patch<ChurnSignal>(`${BASE}/${id}/acknowledge`),
};
