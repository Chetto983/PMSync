/**
 * CRM Forecast API module
 *
 * Backend: CrmModule > ForecastController
 * Endpoints: /api/v1/crm/forecast
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface MonthlyAggregate {
  month: string;
  wonRevenue: number;
  wonCount: number;
  lostCount: number;
  createdValue: number;
  createdCount: number;
  closeRate: number;
  avgDealValue: number;
}

export interface ForecastPeriod {
  label: string;
  periodStart: string;
  predicted: number;
  p20: number;
  p50: number;
  p80: number;
  actual: number | null;
}

export interface ForecastResponse {
  pipelineId: string;
  pipelineName: string;
  period: 'month' | 'quarter';
  history: MonthlyAggregate[];
  forecasts: ForecastPeriod[];
  method: string;
  mae: number;
}

export interface ForecastRefreshResult {
  pipelinesProcessed: number;
  snapshotsSaved: number;
  actualsUpdated: number;
}

export interface AccuracySnapshot {
  periodStart: string;
  period: string;
  predicted: number;
  actual: number | null;
  mape: number | null;
}

export interface ForecastAccuracyResponse {
  snapshots: AccuracySnapshot[];
  avgMape: number | null;
}

// ---- API ----

const BASE = '/crm/forecast';

export const crmForecastApi = {
  getForecast: (pipelineId?: string, period?: 'month' | 'quarter') => {
    const params: Record<string, string> = {};
    if (pipelineId) params.pipelineId = pipelineId;
    if (period) params.period = period;
    return apiClient.get<ForecastResponse>(BASE, { params });
  },

  refresh: (pipelineId?: string, period?: 'month' | 'quarter') => {
    const params: Record<string, string> = {};
    if (pipelineId) params.pipelineId = pipelineId;
    if (period) params.period = period;
    return apiClient.post<ForecastRefreshResult>(`${BASE}/refresh`, null, {
      params,
    });
  },

  getAccuracy: (pipelineId: string) =>
    apiClient.get<ForecastAccuracyResponse>(`${BASE}/accuracy`, {
      params: { pipelineId },
    }),
};
