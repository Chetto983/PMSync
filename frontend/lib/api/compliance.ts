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

// ===== LEGAL TYPES =====

export interface LegalStatus {
  tosAccepted: boolean;
  tosVersion: string | null;
  tosAcceptedAt: string | null;
  privacyPolicyAccepted: boolean;
  privacyPolicyVersion: string | null;
  privacyPolicyAcceptedAt: string | null;
  allAccepted: boolean;
}

export interface AcceptLegalDocumentPayload {
  documentType: string;
  documentVersion: string;
}

export interface LegalAcceptanceResponse {
  id: string;
  documentType: string;
  documentVersion: string;
  acceptedAt: string;
}

// ===== DATA EXPORT TYPES =====

export type DataExportStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'EXPIRED' | 'FAILED';

export interface DataExportResponse {
  id: string;
  status: DataExportStatus;
  filePath?: string | null;
  fileSize?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===== DELETION TYPES =====

export type DeletionAccountStatus = 'ACTIVE' | 'SCHEDULED';

export interface DeletionStatusResponse {
  status: DeletionAccountStatus;
  scheduledAt?: string | null;
  purgeDate?: string | null;
  daysRemaining?: number | null;
  message?: string;
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

  // ===== LEGAL ACCEPTANCE =====

  /**
   * Get legal document acceptance status
   * GET /compliance/legal/status
   */
  async getLegalStatus(): Promise<LegalStatus> {
    const response = await apiClient.get('/compliance/legal/status');
    return response.data;
  },

  /**
   * Accept a legal document (ToS or Privacy Policy)
   * POST /compliance/legal/accept
   */
  async acceptLegalDocument(data: AcceptLegalDocumentPayload): Promise<LegalAcceptanceResponse> {
    const response = await apiClient.post('/compliance/legal/accept', data);
    return response.data;
  },

  // ===== DATA EXPORT =====

  /**
   * Request a new data export
   * POST /compliance/data-export
   */
  async requestExport(): Promise<DataExportResponse> {
    const response = await apiClient.post('/compliance/data-export');
    return response.data;
  },

  /**
   * List all data exports for the current user
   * GET /compliance/data-export
   */
  async listExports(): Promise<DataExportResponse[]> {
    const response = await apiClient.get('/compliance/data-export');
    return response.data;
  },

  /**
   * Get a specific data export status
   * GET /compliance/data-export/:id
   */
  async getExportStatus(id: string): Promise<DataExportResponse> {
    const response = await apiClient.get(`/compliance/data-export/${id}`);
    return response.data;
  },

  /**
   * Download a data export (returns blob)
   * GET /compliance/data-export/:id/download
   */
  async downloadExport(id: string): Promise<Blob> {
    const response = await apiClient.get(`/compliance/data-export/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // ===== ACCOUNT DELETION =====

  /**
   * Request account deletion (30-day grace period)
   * POST /compliance/data-deletion
   */
  async requestDeletion(): Promise<DeletionStatusResponse> {
    const response = await apiClient.post('/compliance/data-deletion');
    return response.data;
  },

  /**
   * Get current deletion status
   * GET /compliance/data-deletion/status
   */
  async getDeletionStatus(): Promise<DeletionStatusResponse> {
    const response = await apiClient.get('/compliance/data-deletion/status');
    return response.data;
  },

  /**
   * Cancel a pending deletion
   * DELETE /compliance/data-deletion/cancel
   */
  async cancelDeletion(): Promise<DeletionStatusResponse> {
    const response = await apiClient.delete('/compliance/data-deletion/cancel');
    return response.data;
  },
};
