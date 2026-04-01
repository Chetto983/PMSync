/**
 * CRM Suggestions API module
 *
 * Backend: CrmModule > SuggestionController
 * Endpoints: /api/v1/crm/suggestions
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface CrmSuggestion {
  id: string;
  tenantId: string;
  type: string; // account, deal, ticket, link
  status: string; // pending, accepted, dismissed
  entityData: Record<string, unknown>;
  sourceType: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListSuggestionsParams {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface ListSuggestionsResponse {
  data: CrmSuggestion[];
  total: number;
}

export interface BulkSuggestionDto {
  ids: string[];
  action: 'accept' | 'dismiss';
}

export interface BulkSuggestionResult {
  accepted: number;
  dismissed: number;
  errors: number;
}

// ---- API ----

export const crmSuggestionsApi = {
  list(params?: ListSuggestionsParams) {
    return apiClient.get<ListSuggestionsResponse>('/crm/suggestions', { params });
  },

  accept(id: string) {
    return apiClient.post<CrmSuggestion>(`/crm/suggestions/${id}/accept`);
  },

  dismiss(id: string) {
    return apiClient.post<CrmSuggestion>(`/crm/suggestions/${id}/dismiss`);
  },

  bulk(dto: BulkSuggestionDto) {
    return apiClient.post<BulkSuggestionResult>('/crm/suggestions/bulk', dto);
  },
};
