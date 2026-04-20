/**
 * Phase 148 D-10 / D-11 / D-12: traffic-light accuracy pill.
 *
 * Extracted as a standalone component so Phase 155 dashboard can reuse it
 * (chart axis tick, leaderboard cell). Props intentionally minimal.
 *
 * Behavior contract:
 *   - sampleSize < 20 OR window state === 'learning' → neutral "Learning…" pill
 *   - F1 >= 0.85 → success.main (green)
 *   - 0.6 <= F1 < 0.85 → warning.main (yellow)
 *   - F1 < 0.6 → error.main (red)
 *   - Loading / error / missing-label / missing-window → render null (silent;
 *     accuracy is supplementary info — failing loudly is worse UX than hiding).
 *
 * All copy comes from `t.email.labels.accuracy.*` (D-12 strings, N-2 path).
 * Colors come from MUI theme tokens via `sx` — no hex, no Tailwind.
 */
import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { useLabelAccuracy } from '@/hooks/queries/use-label-accuracy';
import {
  type AccuracyWindowKey,
  type LabelAccuracyWindow,
} from '@/lib/api/triage-accuracy';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';

// D-10 thresholds + D-11 cold-start threshold
const F1_GREEN = 0.85;
const F1_YELLOW = 0.6;
const LEARNING_THRESHOLD = 20;
const WINDOW_DAYS: Record<AccuracyWindowKey, number> = {
  '7d': 7,
  '30d': 30,
  // 'all' has no fixed window-days figure; the badge default uses '30d'. If
  // a caller chooses '*all*' the tooltip falls back to 30 (the most common
  // user-facing horizon) rather than printing a meaningless 0.
  all: 30,
};

interface LabelAccuracyBadgeProps {
  labelId: string;
  /** Window used to compute the pill + tooltip content. Default '30d'. */
  window?: AccuracyWindowKey;
}

/** Format a template string like `"Precision: {value}%"` with a map of substitutions. */
function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) =>
    k in values ? String(values[k]) : `{${k}}`,
  );
}

export function LabelAccuracyBadge({
  labelId,
  window = '30d',
}: LabelAccuracyBadgeProps): React.ReactElement | null {
  const { data, isLoading, isError } = useLabelAccuracy();
  const t = useTranslations();
  useLocale(); // consume to re-render on locale flip even when t is memoized

  if (isLoading || isError || !data) return null;

  const entry = data.labels.find((l) => l.labelId === labelId);
  if (!entry) return null;

  const w: LabelAccuracyWindow | undefined = entry.windows[window];
  const learning = !w || w.sampleSize < LEARNING_THRESHOLD || w.state === 'learning';

  if (learning) {
    const current = w?.sampleSize ?? 0;
    const tooltipContent = fmt(t.email.labels.accuracy.tooltip.learning, {
      current,
      threshold: LEARNING_THRESHOLD,
    });
    return (
      <Tooltip title={tooltipContent} arrow enterDelay={400}>
        <Chip
          size="small"
          variant="outlined"
          label={t.email.labels.accuracy.pill.learning}
          sx={{
            color: 'text.secondary',
            borderColor: 'divider',
            height: 20,
            fontSize: '0.6875rem',
            ml: 0.5,
            flexShrink: 0,
          }}
        />
      </Tooltip>
    );
  }

  const f1 = w.f1 ?? 0;
  const color =
    f1 >= F1_GREEN
      ? 'success.main'
      : f1 >= F1_YELLOW
        ? 'warning.main'
        : 'error.main';

  const precisionPct = Math.round((w.precision ?? 0) * 100);
  const recallPct = Math.round((w.recall ?? 0) * 100);
  const precisionCi = Math.round(
    (((w.wilsonPrecHigh ?? 0) - (w.wilsonPrecLow ?? 0)) / 2) * 100,
  );
  const recallCi = Math.round(
    (((w.wilsonRecHigh ?? 0) - (w.wilsonRecLow ?? 0)) / 2) * 100,
  );
  const windowDays = WINDOW_DAYS[window];

  const tooltipContent = (
    <>
      <div>
        {fmt(t.email.labels.accuracy.tooltip.precision, {
          value: precisionPct,
          ci: precisionCi,
        })}
      </div>
      <div>
        {fmt(t.email.labels.accuracy.tooltip.recall, {
          value: recallPct,
          ci: recallCi,
        })}
      </div>
      <div>
        {fmt(t.email.labels.accuracy.tooltip.sampleSize, {
          count: w.sampleSize,
          days: windowDays,
        })}
      </div>
    </>
  );

  const percent = Math.round(f1 * 100);
  const label = fmt(t.email.labels.accuracy.pill.ready, { percent });

  return (
    <Tooltip title={tooltipContent} arrow enterDelay={400}>
      <Chip
        size="small"
        variant="outlined"
        label={label}
        sx={{
          color,
          borderColor: color,
          height: 20,
          fontSize: '0.6875rem',
          fontWeight: 600,
          ml: 0.5,
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}

export default LabelAccuracyBadge;
