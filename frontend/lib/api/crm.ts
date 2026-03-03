/**
 * CRM Intelligence API
 *
 * Frontend client for the CRM Intelligence (P1.7) backend endpoints.
 * Provides relationship tracking, contact scoring, and reconnection reminders.
 *
 * Features:
 * - Stale contact detection
 * - Relationship scoring (recency, frequency, reciprocity, trend)
 * - Interaction history tracking
 * - Relationship graph visualization
 * - Reconnection reminders
 *
 * @see backend/src/modules/ai/services/relationship-intelligence.service.ts
 */
import { apiClient } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export type InteractionType = 'EMAIL_SENT' | 'EMAIL_RECEIVED' | 'MEETING' | 'CALL' | 'NOTE';

export interface ContactRelationshipStats {
  contactId: string;
  email: string;
  displayName?: string | null;
  lastInteraction: string | null;
  totalInteractions: number;
  emailsSent: number;
  emailsReceived: number;
  relationshipScore: number | null;
  recencyScore: number | null;
  frequencyScore: number | null;
  reciprocityScore: number | null;
  trendScore: number | null;
  isStale: boolean;
  daysSinceLastContact: number | null;
}

export interface ContactInteraction {
  id: string;
  contactId: string;
  interactionType: InteractionType;
  direction: 'INBOUND' | 'OUTBOUND';
  subject?: string | null;
  summary?: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface RelationshipGraphNode {
  contactId: string;
  email: string;
  displayName?: string | null;
  relationshipScore: number | null;
  depth: number;
}

export interface StaleContactsParams {
  days?: number;
  limit?: number;
}

export interface ReconnectCandidatesParams {
  days?: number;
  limit?: number;
}

export interface TopContactsParams {
  limit?: number;
}

export interface InteractionHistoryParams {
  limit?: number;
  offset?: number;
}

export interface RecordInteractionPayload {
  interactionType: 'MEETING' | 'CALL' | 'NOTE';
  subject?: string;
  summary?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RelationshipGraphParams {
  depth?: number;
  limit?: number;
}

// ============================================================================
// API Client
// ============================================================================

export const crmApi = {
  /**
   * Get stale contacts (no interaction in X days).
   * Important contacts you may have lost touch with.
   *
   * @param params.days - Days threshold (default: 60)
   * @param params.limit - Max contacts to return (default: 20)
   */
  getStaleContacts(params?: StaleContactsParams) {
    return apiClient.get<{
      success: boolean;
      staleContacts: ContactRelationshipStats[];
      count: number;
      thresholdDays: number;
    }>('/api/v1/ai/crm/stale-contacts', { params });
  },

  /**
   * Get contacts needing reconnection (for scheduled reminders).
   * Returns stale contacts that haven't had a reconnect reminder sent recently.
   *
   * @param params.days - Days since last reminder (default: 7)
   * @param params.limit - Max contacts to return (default: 10)
   */
  getReconnectCandidates(params?: ReconnectCandidatesParams) {
    return apiClient.get<{
      success: boolean;
      candidates: ContactRelationshipStats[];
      count: number;
    }>('/api/v1/ai/crm/reconnect', { params });
  },

  /**
   * Get top contacts by relationship score.
   * Returns your most important contacts ranked by relationship score.
   * Score is calculated based on: recency (40%), frequency (30%), reciprocity (20%), trend (10%).
   *
   * @param params.limit - Max contacts to return (default: 10)
   */
  getTopContacts(params?: TopContactsParams) {
    return apiClient.get<{
      success: boolean;
      topContacts: ContactRelationshipStats[];
      count: number;
    }>('/api/v1/ai/crm/top-contacts', { params });
  },

  /**
   * Batch recalculate all relationship scores (admin/backfill).
   * Use this after importing historical data or for periodic refresh.
   */
  recalculateAll() {
    return apiClient.post<{
      success: boolean;
      message: string;
      jobId?: string;
    }>('/api/v1/ai/crm/recalculate-all');
  },

  /**
   * Get relationship stats for a specific contact.
   * Returns detailed relationship statistics including:
   * - Last interaction date
   * - Total interactions (sent + received)
   * - Relationship score components
   * - Stale status
   *
   * @param contactId - Contact ID
   */
  getContactStats(contactId: string) {
    return apiClient.get<{
      success: boolean;
      stats: ContactRelationshipStats;
    }>(`/api/v1/ai/crm/contacts/${encodeURIComponent(contactId)}`);
  },

  /**
   * Get interaction history for a contact.
   * Includes emails sent/received, meetings, calls, and notes.
   *
   * @param contactId - Contact ID
   * @param params.limit - Max interactions to return (default: 50)
   * @param params.offset - Offset for pagination (default: 0)
   */
  getContactInteractions(contactId: string, params?: InteractionHistoryParams) {
    return apiClient.get<{
      success: boolean;
      interactions: ContactInteraction[];
      count: number;
    }>(`/api/v1/ai/crm/contacts/${encodeURIComponent(contactId)}/interactions`, { params });
  },

  /**
   * Record a manual interaction with a contact (call, meeting, note).
   * Email interactions are recorded automatically during sync.
   *
   * @param contactId - Contact ID
   * @param payload - Interaction details
   */
  recordInteraction(contactId: string, payload: RecordInteractionPayload) {
    return apiClient.post<{
      success: boolean;
      interaction: ContactInteraction;
    }>(`/api/v1/ai/crm/contacts/${encodeURIComponent(contactId)}/interactions`, payload);
  },

  /**
   * Recalculate relationship score for a contact.
   * Returns the score components and total score.
   *
   * @param contactId - Contact ID
   */
  recalculateContactScore(contactId: string) {
    return apiClient.post<{
      success: boolean;
      stats: ContactRelationshipStats;
    }>(`/api/v1/ai/crm/contacts/${encodeURIComponent(contactId)}/recalculate`);
  },

  /**
   * Get relationship graph for a contact (connected contacts).
   * Returns contacts connected to the specified contact through shared
   * email threads or meetings. Uses recursive CTE for graph traversal.
   *
   * @param contactId - Contact ID
   * @param params.depth - Graph traversal depth (default: 2)
   * @param params.limit - Max connected contacts (default: 20)
   */
  getRelationshipGraph(contactId: string, params?: RelationshipGraphParams) {
    return apiClient.get<{
      success: boolean;
      graph: RelationshipGraphNode[];
      count: number;
    }>(`/api/v1/ai/crm/contacts/${encodeURIComponent(contactId)}/graph`, { params });
  },

  /**
   * Mark a contact as reminded (to prevent reminder spam).
   * Records that a reconnect reminder was sent for this contact.
   * Prevents sending multiple reminders in a short time period.
   *
   * @param contactId - Contact ID
   */
  markAsReminded(contactId: string) {
    return apiClient.post<{
      success: boolean;
      message: string;
    }>(`/api/v1/ai/crm/contacts/${encodeURIComponent(contactId)}/reminded`);
  },
};
