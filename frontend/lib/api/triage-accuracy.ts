/**
 * Phase 148 D-09 frontend API module for triage accuracy read endpoint.
 *
 * Calls GET /api/v1/ai/triage/label-accuracy. The apiClient baseURL already
 * includes /api/v1, so the path passed here is the module-relative
 * '/ai/triage/label-accuracy' (Plan 05 SUMMARY confirms — do NOT prefix).
 *
 * Response shape matches the D-09 contract verbatim. Importing the types from
 * the backend would couple frontend → backend, so we declare them here. If
 * the backend shape changes, this file is the single update site.
 */
import { apiClient } from '../api-client';

export type AccuracyWindowKey = '7d' | '30d' | 'all';
export type AccuracyTriageSource = 'llm' | 'rule' | 'llm+rule';

export interface LabelAccuracyWindow {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  tp: number;
  fp: number;
  fn: number;
  sampleSize: number;
  wilsonPrecLow: number | null;
  wilsonPrecHigh: number | null;
  wilsonRecLow: number | null;
  wilsonRecHigh: number | null;
  state: 'learning' | 'ready';
}

export interface LabelAccuracyEntry {
  labelId: string;
  labelName: string | null;
  labelSlug: string | null;
  windows: Partial<Record<AccuracyWindowKey, LabelAccuracyWindow>>;
  triageSourceBreakdown?: Partial<
    Record<
      AccuracyTriageSource,
      Pick<LabelAccuracyWindow, 'precision' | 'recall' | 'f1' | 'sampleSize'> | null
    >
  >;
  lastUpdatedAt: string | null;
}

export interface LabelAccuracyResponse {
  labels: LabelAccuracyEntry[];
  computedAt: string;
}

export interface GetLabelAccuracyParams {
  windows?: AccuracyWindowKey[];
  includeBreakdown?: boolean;
}

export const triageAccuracyApi = {
  async getLabelAccuracy(
    params?: GetLabelAccuracyParams,
  ): Promise<LabelAccuracyResponse> {
    const query: Record<string, string> = {};
    if (params?.windows && params.windows.length > 0) {
      query.windows = params.windows.join(',');
    }
    if (params?.includeBreakdown) {
      query.includeBreakdown = 'true';
    }
    const response = await apiClient.get('/ai/triage/label-accuracy', {
      params: query,
    });
    return response.data;
  },
};

/** Convenience standalone export for tree-shake-friendly callers. */
export function getLabelAccuracy(
  params?: GetLabelAccuracyParams,
): Promise<LabelAccuracyResponse> {
  return triageAccuracyApi.getLabelAccuracy(params);
}
