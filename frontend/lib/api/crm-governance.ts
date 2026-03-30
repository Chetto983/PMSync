/**
 * CRM AI Governance API module
 *
 * Backend: CrmModule > GovernanceController
 * Endpoints: /api/v1/crm/governance
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface GovernanceOverview {
  totalPredictions: number;
  averageAccuracy: number;
  monthlyCost: number;
  activeModels: number;
}

export interface CostBreakdown {
  predictionType: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
}

export type TimeRange = '7d' | '30d' | '90d';

// ---- API ----

const BASE = '/crm/governance';

export const crmGovernanceApi = {
  getOverview: () =>
    apiClient.get<GovernanceOverview>(`${BASE}/overview`),

  getCostBreakdown: (range: TimeRange = '30d') =>
    apiClient.get<CostBreakdown[]>(`${BASE}/costs`, { params: { range } }),
};
