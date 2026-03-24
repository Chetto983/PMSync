/**
 * CRM Accounts API module
 *
 * Backend: CrmModule > AccountController
 * Endpoints: /api/v1/crm/accounts
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface CrmAccountAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface CrmAccount {
  id: string;
  tenantId: string;
  name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  revenue: string | null; // Decimal comes as string
  currency: string | null;
  address: CrmAccountAddress | null;
  phone: string | null;
  description: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  parent?: { id: string; name: string } | null;
  children?: { id: string; name: string }[];
  _count?: { contacts: number; deals: number; children: number };
}

export interface ListAccountsParams {
  search?: string;
  industry?: string;
  size?: string;
  parentId?: string;
  limit?: number;
  offset?: number;
}

export interface ListAccountsResponse {
  data: CrmAccount[];
  total: number;
}

export interface CreateAccountDto {
  name: string;
  website?: string;
  industry?: string;
  size?: string;
  revenue?: number;
  currency?: string;
  address?: CrmAccountAddress;
  phone?: string;
  description?: string;
  parentId?: string;
}

export interface UpdateAccountDto extends Partial<CreateAccountDto> {}

// ---- API ----

export const crmAccountsApi = {
  list(params?: ListAccountsParams) {
    return apiClient.get<ListAccountsResponse>('/crm/accounts', { params });
  },

  getById(id: string) {
    return apiClient.get<CrmAccount>(`/crm/accounts/${id}`);
  },

  create(dto: CreateAccountDto) {
    return apiClient.post<CrmAccount>('/crm/accounts', dto);
  },

  update(id: string, dto: UpdateAccountDto) {
    return apiClient.patch<CrmAccount>(`/crm/accounts/${id}`, dto);
  },

  delete(id: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/accounts/${id}`);
  },
};
