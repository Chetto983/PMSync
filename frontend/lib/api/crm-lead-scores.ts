/**
 * CRM Lead Scores API module
 *
 * Backend: CrmModule > LeadScoreController
 * Endpoints: /api/v1/crm/leads
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface LeadScoreContact {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  emails?: Array<{ email: string; type?: string }>;
}

export interface ComputedFeatures {
  engagement: {
    emailsSent: number;
    emailsReceived: number;
    totalInteractions: number;
    repliedRatio: number;
    avgResponseTimeHours: number;
    lastInteractionDaysAgo: number;
    meetingCount: number;
    recentActivityScore: number;
  };
  firmographic: {
    hasAccount: boolean;
    companySize: string | null;
    industryCategory: string | null;
    revenueRange: string | null;
    hasWebsite: boolean;
    hasPhone: boolean;
    hasAddress: boolean;
    accountDealCount: number;
    accountTotalValue: number;
  };
  behavioral: {
    dealCount: number;
    openDealCount: number;
    wonDealCount: number;
    lostDealCount: number;
    avgDealVelocityDays: number;
    highestDealStageProgress: number;
    lastContactRecencyDays: number;
    activityCount30d: number;
    activityCount90d: number;
    hasRecentDealActivity: boolean;
  };
}

export type LeadScoreTier = 'hot' | 'warm' | 'cold';

export interface LeadScore {
  id: string;
  contactId: string;
  score: number;
  confidence: number;
  tier: LeadScoreTier;
  features: ComputedFeatures;
  computedAt: string;
  contact: LeadScoreContact;
}

export interface ListLeadScoresParams {
  sort?: 'score' | 'computedAt';
  order?: 'asc' | 'desc';
  minScore?: number;
  tier?: LeadScoreTier;
  page?: number;
  pageSize?: number;
}

export interface ListLeadScoresResponse {
  data: LeadScore[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ScoreHistoryEntry {
  score: number;
  confidence: number;
  computedAt: string;
}

export interface ScoreHistoryResponse {
  data: ScoreHistoryEntry[];
}

export interface ComputeScoreResponse {
  score: number | null;
  tier?: LeadScoreTier;
  confidence?: number;
  reasons?: string[];
  message?: string;
}

// ---- API ----

export const crmLeadScoresApi = {
  list(params?: ListLeadScoresParams) {
    return apiClient.get<ListLeadScoresResponse>('/crm/leads/scores', {
      params,
    });
  },

  getByContact(contactId: string) {
    return apiClient.get<LeadScore>(`/crm/leads/${contactId}/score`);
  },

  getScoreHistory(contactId: string) {
    return apiClient.get<ScoreHistoryResponse>(
      `/crm/leads/${contactId}/score/history`,
    );
  },

  computeScore(contactId: string) {
    return apiClient.post<ComputeScoreResponse>(
      `/crm/leads/${contactId}/score`,
    );
  },
};
