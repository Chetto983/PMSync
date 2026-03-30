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

export interface AccuracyPoint {
  date: string;
  modelType: string;
  metric: string;
  value: number;
}

export interface MonthlyCostTrend {
  month: string;
  predictionType: string;
  totalCost: number;
  callCount: number;
}

export interface DriftResult {
  feature: string;
  psi: number;
  status: 'stable' | 'warning' | 'critical';
  baselineN: number;
  currentN: number;
  checkedAt: string;
}

export type TimeRange = '7d' | '30d' | '90d';

// ---- API ----

const BASE = '/crm/governance';

export const crmGovernanceApi = {
  getOverview: () =>
    apiClient.get<GovernanceOverview>(`${BASE}/overview`),

  getAccuracy: (range: TimeRange = '30d') =>
    apiClient.get<AccuracyPoint[]>(`${BASE}/accuracy`, { params: { range } }),

  getCostBreakdown: (range: TimeRange = '30d') =>
    apiClient.get<CostBreakdown[]>(`${BASE}/costs`, { params: { range } }),

  getMonthlyCostTrend: () =>
    apiClient.get<MonthlyCostTrend[]>(`${BASE}/costs/trend`),

  getDriftResults: () =>
    apiClient.get<DriftResult[]>(`${BASE}/drift`),

  runDriftCheck: () =>
    apiClient.post<DriftResult[]>(`${BASE}/drift/check`),
};
