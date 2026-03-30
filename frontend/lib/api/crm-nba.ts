/**
 * CRM Next Best Action API module
 *
 * Backend: CrmModule > NBAController
 * Endpoints: /api/v1/crm/nba
 */
import { apiClient } from '../api-client';

// ---- Types ----

export type NBAActionType =
  | 'EMAIL'
  | 'CALL'
  | 'MEETING'
  | 'DISCOUNT'
  | 'ESCALATE'
  | 'FOLLOW_UP';

export type NBAStatus = 'SUGGESTED' | 'ACCEPTED' | 'DISMISSED' | 'EXECUTED';

export interface NBAAction {
  id: string;
  actionType: NBAActionType;
  title: string;
  reasoning: string;
  expectedImpact: number;
  confidence: number;
  status: NBAStatus;
  contactId: string | null;
  createdAt: string;
}

export interface NBARecommendationsResponse {
  dealId: string;
  dealName: string;
  stageName: string;
  actions: NBAAction[];
}

export interface NBAEffectivenessItem {
  actionType: NBAActionType;
  suggested: number;
  accepted: number;
  executed: number;
  dismissed: number;
  acceptanceRate: number;
}

// ---- API ----

const BASE = '/crm/nba';

export const crmNbaApi = {
  getRecommendations: (dealId: string) =>
    apiClient.get<NBARecommendationsResponse>(`${BASE}/${dealId}`),

  updateStatus: (actionId: string, status: NBAStatus) =>
    apiClient.patch<NBAAction>(`${BASE}/${actionId}/status`, { status }),

  getEffectiveness: () =>
    apiClient.get<NBAEffectivenessItem[]>(`${BASE}/effectiveness/stats`),
};
