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
  currentTosVersion?: string | null;
  currentPpVersion?: string | null;
}

interface RawLegalStatus {
  tosAccepted?: boolean;
  tosVersion?: string | null;
  tosAcceptedAt?: string | null;
  privacyPolicyAccepted?: boolean;
  privacyPolicyVersion?: string | null;
  privacyPolicyAcceptedAt?: string | null;
  ppAccepted?: boolean;
  ppVersion?: string | null;
  currentTosVersion?: string | null;
  currentPpVersion?: string | null;
  allAccepted?: boolean;
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

interface RawDataExportResponse {
  exportId?: string;
  id?: string;
  status: DataExportStatus;
  filePath?: string | null;
  fileSize?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

function normalizeDataExportResponse(raw: RawDataExportResponse): DataExportResponse {
  return {
    id: raw.id ?? raw.exportId ?? '',
    status: raw.status,
    filePath: raw.filePath ?? null,
    fileSize: raw.fileSize ?? null,
    expiresAt: raw.expiresAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt ?? raw.createdAt,
  };
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
    // ResponseEnvelopeInterceptor wraps in { data, meta } — unwrap
    const body = response.data;
    return Array.isArray(body) ? body : (body?.data ?? []);
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
    const response = await apiClient.get<RawLegalStatus>('/compliance/legal/status');
    const raw = response.data ?? {};
    const tosAccepted = raw.tosAccepted ?? false;
    const privacyPolicyAccepted = raw.privacyPolicyAccepted ?? raw.ppAccepted ?? false;

    return {
      tosAccepted,
      tosVersion: raw.tosVersion ?? null,
      tosAcceptedAt: raw.tosAcceptedAt ?? null,
      privacyPolicyAccepted,
      privacyPolicyVersion: raw.privacyPolicyVersion ?? raw.ppVersion ?? null,
      privacyPolicyAcceptedAt: raw.privacyPolicyAcceptedAt ?? null,
      allAccepted: raw.allAccepted ?? (tosAccepted && privacyPolicyAccepted),
      currentTosVersion: raw.currentTosVersion ?? raw.tosVersion ?? null,
      currentPpVersion:
        raw.currentPpVersion ?? raw.privacyPolicyVersion ?? raw.ppVersion ?? null,
    };
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
    const response = await apiClient.post<RawDataExportResponse>('/compliance/data-export');
    return normalizeDataExportResponse(response.data);
  },

  /**
   * List all data exports for the current user
   * GET /compliance/data-export
   */
  async listExports(): Promise<DataExportResponse[]> {
    const response = await apiClient.get<
      RawDataExportResponse[] | { exports?: RawDataExportResponse[] }
    >('/compliance/data-export');
    const data = response.data;
    const exports = Array.isArray(data) ? data : data?.exports ?? [];
    return exports.map(normalizeDataExportResponse);
  },

  /**
   * Get a specific data export status
   * GET /compliance/data-export/:id
   */
  async getExportStatus(id: string): Promise<DataExportResponse> {
    const response = await apiClient.get<RawDataExportResponse>(`/compliance/data-export/${id}`);
    return normalizeDataExportResponse(response.data);
  },

  /**
   * Download a data export (returns blob)
   * GET /compliance/data-export/:id/download
   */
  async downloadExport(id: string): Promise<Blob> {
    if (!id) {
      throw new Error('Missing export ID');
    }

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
