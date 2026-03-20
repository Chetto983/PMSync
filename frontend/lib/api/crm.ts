/**
 * CRM Intelligence API
 *
 * Stale contact detection endpoint.
 * Other CRM endpoints (relationship graph, scoring, interactions, etc.)
 * removed — no backend endpoints exist for them.
 */
import { apiClient } from '../api-client';

export interface ContactRelationshipStats {
  contactId: string;
  email?: string;
  displayName?: string | null;
  lastInteraction?: string | null;
  totalInteractions: number;
  emailsSent?: number;
  emailsReceived?: number;
  relationshipScore: number | null;
  recencyScore: number | null;
  frequencyScore: number | null;
  reciprocityScore: number | null;
  trendScore: number | null;
  isStale: boolean;
  daysSinceLastContact: number | null;
  previousFrequency?: string;
  suggestedAction?: string;
  trend?: 'increasing' | 'stable' | 'decreasing';
}

export interface StaleContactsParams {
  days?: number;
  limit?: number;
}

export const crmApi = {
  /**
   * Get stale contacts (no interaction in X days).
   * Backend: GET /api/v1/ai/crm/stale-contacts
   */
  getStaleContacts(params?: StaleContactsParams) {
    return apiClient.get<{
      success: boolean;
      staleContacts: ContactRelationshipStats[];
      count: number;
      thresholdDays: number;
    }>('/ai/crm/stale-contacts', { params });
  },
};
