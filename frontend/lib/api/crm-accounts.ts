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

export interface AccountContactLink {
  id: string;
  accountId: string;
  contactId: string;
  tenantId: string;
  role: string | null;
  isPrimary: boolean;
  createdAt: string;
  contact: {
    id: string;
    tenantId: string;
    displayName: string | null;
    company: string | null;
    emails: Array<{ value: string; type?: string }> | null;
    phoneNumbers: Array<{ value: string; type?: string }> | null;
  };
}

export interface ContactAccountLink {
  id: string;
  accountId: string;
  contactId: string;
  tenantId: string;
  role: string | null;
  isPrimary: boolean;
  createdAt: string;
  account: {
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
  };
}

export interface LinkContactDto {
  contactId: string;
  role?: string;
}

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

  getChildren(id: string) {
    return apiClient.get<CrmAccount[]>(`/crm/accounts/${id}/children`);
  },

  getAccountsByContact(contactId: string) {
    return apiClient.get<ContactAccountLink[]>(`/crm/accounts/by-contact/${contactId}`);
  },

  getContacts(accountId: string) {
    return apiClient.get<AccountContactLink[]>(`/crm/accounts/${accountId}/contacts`);
  },

  linkContact(accountId: string, dto: LinkContactDto) {
    return apiClient.post<AccountContactLink>(`/crm/accounts/${accountId}/contacts`, dto);
  },

  unlinkContact(accountId: string, contactId: string) {
    return apiClient.delete<{ deleted: boolean }>(
      `/crm/accounts/${accountId}/contacts/${contactId}`,
    );
  },

  async exportXlsx(params?: { search?: string; industry?: string }) {
    const response = await apiClient.get('/crm/accounts/export', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
