import { apiClient } from '../api-client';

export interface ProviderConfig {
  id: string;
  providerType: 'google' | 'microsoft' | 'generic';
  email: string;
  displayName?: string;
  /** Free-form purpose/category (e.g., Work, Personal, Legal, Info, Kork, etc.) */
  scope?: string;
  supportsEmail: boolean;
  supportsCalendar: boolean;
  supportsContacts: boolean;
  isDefault: boolean;
  isActive: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProviderDto {
  displayName?: string;
  /** Free-form purpose/category (e.g., Work, Personal, Legal, Info, etc.) */
  scope?: string;
  isDefault?: boolean;
}

export interface OAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface ProviderAlias {
  providerId: string;
  email: string;
  name?: string;
}

export interface ConnectGoogleDto {
  email?: string; // Optional - will be obtained from OAuth2 if not provided
  authorizationCode: string;
  state?: string; // CSRF state parameter for validation
  supportsCalendar?: boolean;
  supportsContacts?: boolean;
  isDefault?: boolean;
}

export interface ConnectMicrosoftDto {
  email?: string; // Optional - will be obtained from OAuth2 if not provided
  authorizationCode: string;
  state?: string; // CSRF state parameter for validation
  supportsCalendar?: boolean;
  supportsContacts?: boolean;
  isDefault?: boolean;
}

export interface ConnectGenericDto {
  email: string;
  displayName?: string;
  imapHost: string;
  imapPort?: number;
  imapUsername: string;
  imapPassword: string;
  imapUseTls?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpUseTls?: boolean;
  caldavUrl?: string;
  caldavUsername?: string;
  caldavPassword?: string;
  carddavUrl?: string;
  carddavUsername?: string;
  carddavPassword?: string;
  supportsCalendar?: boolean;
  supportsContacts?: boolean;
  isDefault?: boolean;
}

export interface TestCredentialsDto {
  imapHost: string;
  imapPort?: number;
  imapUsername: string;
  imapPassword: string;
  imapUseTls?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpUseTls?: boolean;
}

export interface TestCredentialsResult {
  imap: { success: boolean; message: string };
  smtp: { success: boolean; message: string; skipped?: boolean };
}

export const providersApi = {
  // Google
  async getGoogleAuthUrl(scopes?: string[]): Promise<OAuthUrlResponse> {
    const response = await apiClient.post('/providers/google/auth-url', { scopes });
    return response.data;
  },

  async connectGoogle(dto: ConnectGoogleDto): Promise<ProviderConfig> {
    const response = await apiClient.post('/providers/google/connect', dto);
    return response.data;
  },

  // Microsoft
  async getMicrosoftAuthUrl(scopes?: string[]): Promise<OAuthUrlResponse> {
    const response = await apiClient.post('/providers/microsoft/auth-url', { scopes });
    return response.data;
  },

  async connectMicrosoft(dto: ConnectMicrosoftDto): Promise<ProviderConfig> {
    const response = await apiClient.post('/providers/microsoft/connect', dto);
    return response.data;
  },

  // Generic
  async connectGeneric(dto: ConnectGenericDto): Promise<ProviderConfig> {
    const response = await apiClient.post('/providers/generic/connect', dto);
    return response.data;
  },

  async testGenericCredentials(dto: TestCredentialsDto): Promise<TestCredentialsResult> {
    const response = await apiClient.post('/providers/generic/test', dto);
    return response.data;
  },

  // Common
  async getProviders(): Promise<ProviderConfig[]> {
    const response = await apiClient.get('/providers');
    return response.data;
  },

  async getProvider(id: string): Promise<ProviderConfig> {
    const response = await apiClient.get(`/providers/${id}`);
    return response.data;
  },

  async getAliases(id: string): Promise<ProviderAlias[]> {
    const response = await apiClient.get(`/providers/${id}/aliases`);
    return response.data;
  },

  async deleteProvider(id: string): Promise<void> {
    await apiClient.delete(`/providers/${id}`);
  },

  async updateProvider(id: string, dto: UpdateProviderDto): Promise<ProviderConfig> {
    const response = await apiClient.patch(`/providers/${id}`, dto);
    return response.data;
  },

  // Sync operations
  async syncProvider(id: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/email-sync/sync/${id}`);
    return response.data;
  },

  async syncAll(): Promise<{
    success: boolean;
    deletedEmails: number;
    deletedEmbeddings: number;
    storageCleanup: {
      deleted: number;
      failed: number;
    };
    webhooks: {
      renewed: number;
      failed: number;
    };
    providersQueued: number;
    message: string;
  }> {
    const response = await apiClient.post('/email-sync/sync-all');
    return response.data;
  },
};
