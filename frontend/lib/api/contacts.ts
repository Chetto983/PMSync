import { apiClient } from '../api-client';

export interface ContactEmail {
  value: string;
  type?: string | null;
  primary?: boolean | null;
}

export interface ContactPhone {
  value: string;
  type?: string | null;
  primary?: boolean | null;
}

export interface ContactAddress {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  type?: string | null;
}

export interface ContactProviderSummary {
  id: string;
  email: string;
  providerType: 'google' | 'microsoft' | 'generic';
  displayName?: string | null;
}

export interface ProviderContact {
  id: string;
  providerId: string;
  externalId: string;
  provider: ContactProviderSummary;
}

export interface Contact {
  id: string;
  tenantId: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  prefix?: string | null;
  suffix?: string | null;
  emails?: ContactEmail[] | null;
  phoneNumbers?: ContactPhone[] | null;
  addresses?: ContactAddress[] | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  websites?: Array<{ url: string; type?: string | null }> | null;
  socialProfiles?: Array<{ platform?: string | null; username?: string | null; url?: string | null }> | null;
  notes?: string | null;
  photoUrl?: string | null;
  photoEtag?: string | null;
  isDeleted: boolean;
  isStarred: boolean;
  isFavorite: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any> | null;
  // Provider contacts - links to external provider contacts
  providerContacts?: ProviderContact[];
}

export interface ListContactsParams {
  providerId?: string;
  search?: string;
  company?: string;
  limit?: number;
  offset?: number;
}

export interface ListContactsResponse {
  contacts: Contact[];
  total: number;
}

export interface CreateContactDto {
  providerId: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  emails?: ContactEmail[];
  phoneNumbers?: ContactPhone[];
  company?: string;
  jobTitle?: string;
  notes?: string;
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}

export const contactsApi = {
  async listContacts(params: ListContactsParams = {}): Promise<ListContactsResponse> {
    const response = await apiClient.get('/contacts', { params });
    return response.data;
  },

  async getContact(id: string): Promise<Contact> {
    const response = await apiClient.get(`/contacts/${id}`);
    return response.data;
  },

  async createContact(dto: CreateContactDto): Promise<Contact> {
    const response = await apiClient.post('/contacts', dto);
    return response.data;
  },

  async updateContact(id: string, dto: UpdateContactDto): Promise<Contact> {
    const response = await apiClient.patch(`/contacts/${id}`, dto);
    return response.data;
  },

  async deleteContact(id: string): Promise<void> {
    await apiClient.delete(`/contacts/${id}`);
  },

  async syncProvider(providerId: string): Promise<{ success: boolean; contactsSynced: number }> {
    const response = await apiClient.post(`/contacts/sync/${providerId}`);
    return response.data;
  },

  async syncAll(): Promise<{
    success: boolean;
    message: string;
    queued: number;
    providers?: Array<{ id: string; email: string; type: string }>;
  }> {
    const response = await apiClient.post('/contacts/sync-all');
    return response.data;
  },
};

