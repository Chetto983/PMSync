/**
 * Phase 148 D-10/D-11 TanStack Query hook for per-label triage accuracy.
 *
 * Cache settings per CLAUDE.md Frontend Procedure default for read-mostly hot paths:
 *   - staleTime: 5min — accuracy snapshots only mutate on user feedback (rare)
 *   - gcTime:    30min — keep in memory while user navigates label-related pages
 *   - retry:     1     — accuracy is supplementary; one retry is enough, then hide
 *
 * Hook intentionally over-fetches all three windows (default) so multiple badges
 * mounted on the same page share one cached payload. Per-badge filtering happens
 * at render time inside `LabelAccuracyBadge`.
 *
 * Phase 155 dashboard reuse: pass `{ includeBreakdown: true }` to opt into the
 * per-triageSource breakdown payload (kept opt-in to bound the settings-page payload).
 */
import { useQuery, queryOptions } from '@tanstack/react-query';
import {
  triageAccuracyApi,
  type GetLabelAccuracyParams,
  type LabelAccuracyResponse,
} from '@/lib/api/triage-accuracy';

export const labelAccuracyKeys = {
  all: ['label-accuracy'] as const,
  byParams: (params?: GetLabelAccuracyParams) =>
    [...labelAccuracyKeys.all, params ?? {}] as const,
} as const;

export function labelAccuracyOptions(params?: GetLabelAccuracyParams) {
  return queryOptions({
    queryKey: labelAccuracyKeys.byParams(params),
    queryFn: async (): Promise<LabelAccuracyResponse> =>
      triageAccuracyApi.getLabelAccuracy(params),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useLabelAccuracy(params?: GetLabelAccuracyParams) {
  return useQuery(labelAccuracyOptions(params));
}
