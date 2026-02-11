import { apiClient } from '../api-client';

// ===== TYPES =====

export interface GdprStatus {
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  dataProcessingAgreementUrl?: string;
  cookiePolicyUrl?: string;
  dataRetentionDays?: number;
  dataExportEnabled: boolean;
  dataDeleteEnabled: boolean;
  cookieConsentEnabled: boolean;
  lastUpdated?: string;
}

export interface ConsentState {
  feature: string;
  label: string;
  description: string;
  granted: boolean;
  lastUpdated: string | null;
  version: number | null;
  required: boolean;
}

export interface ConsentHistoryEntry {
  id: string;
  feature: string;
  granted: boolean;
  version: number;
  createdAt: string;
  ipAddress?: string | null;
}

// ===== API CLIENT =====

export const complianceApi = {
  /**
   * Get GDPR compliance status
   * GET /compliance/gdpr/status
   */
  async getGdprStatus(): Promise<GdprStatus> {
    const response = await apiClient.get('/compliance/gdpr/status');
    return response.data;
  },

  /**
   * Get current consent state for all features
   * GET /compliance/consent
   */
  async getConsent(): Promise<ConsentState[]> {
    const response = await apiClient.get('/compliance/consent');
    return response.data;
  },

  /**
   * Update consent for a specific feature
   * POST /compliance/consent
   */
  async updateConsent(feature: string, granted: boolean): Promise<ConsentState> {
    const response = await apiClient.post('/compliance/consent', { feature, granted });
    return response.data;
  },

  /**
   * Get consent change history, optionally filtered by feature
   * GET /compliance/consent/history
   */
  async getConsentHistory(feature?: string): Promise<ConsentHistoryEntry[]> {
    const params = feature ? { feature } : {};
    const response = await apiClient.get('/compliance/consent/history', { params });
    return response.data;
  },
};
