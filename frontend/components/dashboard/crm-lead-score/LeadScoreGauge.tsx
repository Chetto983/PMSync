import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Paper,
  Skeleton,
  Button,
  Tooltip,
  Stack,
  useTheme,
  type Palette,
} from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLeadScore, useComputeLeadScore } from '@/hooks/queries';
import type { ComputedFeatures, LeadScoreTier } from '@/lib/api/crm-lead-scores';

// ---- Score color helpers (theme-aware) ----

function getTierColor(tier: LeadScoreTier, palette: Palette): string {
  switch (tier) {
    case 'hot':
      return palette.success.main;
    case 'warm':
      return palette.warning.main;
    case 'cold':
      return palette.grey[500];
  }
}

function getScoreArcColor(score: number, palette: Palette): string {
  if (score >= 70) return palette.success.main;
  if (score >= 40) return palette.warning.main;
  return palette.error.main;
}

// ---- Factor extraction ----

interface FactorEntry {
  key: string;
  value: number;
  label: string;
}

function extractTopFactors(
  features: ComputedFeatures,
  factorLabels: Record<string, string> | undefined,
  count: number,
): FactorEntry[] {
  const entries: FactorEntry[] = [];

  const addNumeric = (category: Record<string, unknown>, prefix: string) => {
    for (const [key, val] of Object.entries(category)) {
      if (typeof val === 'number' && val > 0) {
        entries.push({
          key: `${prefix}.${key}`,
          value: val,
          label: factorLabels?.[key] ?? key,
        });
      } else if (typeof val === 'boolean' && val) {
        entries.push({
          key: `${prefix}.${key}`,
          value: 1,
          label: factorLabels?.[key] ?? key,
        });
      }
    }
  };

  addNumeric(features.engagement, 'engagement');
  addNumeric(features.firmographic as unknown as Record<string, unknown>, 'firmographic');
  addNumeric(features.behavioral, 'behavioral');

  // Sort by value descending, take top N
  entries.sort((a, b) => b.value - a.value);
  return entries.slice(0, count);
}

// ---- Circular Gauge SVG ----

interface GaugeSvgProps {
  score: number;
  size?: number;
  palette: Palette;
}

function GaugeSvg({ score, size = 120, palette }: GaugeSvgProps) {
  const center = size / 2;
  const radius = center - 10;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const strokeDashoffset = circumference * (1 - progress);
  const arcColor = getScoreArcColor(score, palette);

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          opacity={0.1}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h4" fontWeight={700} lineHeight={1}>
          {score}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          / 100
        </Typography>
      </Box>
    </Box>
  );
}

// ---- Factor Bar ----

interface FactorBarProps {
  label: string;
  value: number;
  maxValue: number;
}

function FactorBar({ label, value, maxValue }: FactorBarProps) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  // Format display value
  const displayValue =
    value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : value % 1 !== 0
        ? value.toFixed(1)
        : String(value);

  return (
    <Box sx={{ mb: 0.75 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '70%' }}>
          {label}
        </Typography>
        <Typography variant="caption" fontWeight={600}>
          {displayValue}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 4,
          borderRadius: 2,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': { borderRadius: 2 },
        }}
      />
    </Box>
  );
}

// ---- Main Component ----

interface LeadScoreGaugeProps {
  contactId: string;
}

export function LeadScoreGauge({ contactId }: LeadScoreGaugeProps) {
  const t = useTranslations();
  const theme = useTheme();
  const tl = t.leadScore;
  const { data: scoreData, isLoading, error } = useLeadScore(contactId);
  const computeMutation = useComputeLeadScore();

  const topFactors = useMemo(() => {
    if (!scoreData?.features) return [];
    return extractTopFactors(scoreData.features, tl?.factors, 5);
  }, [scoreData?.features, tl?.factors]);

  const maxFactorValue = useMemo(
    () => (topFactors.length > 0 ? topFactors[0].value : 1),
    [topFactors],
  );

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton variant="circular" width={120} height={120} sx={{ mx: 'auto', mb: 2 }} />
        <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
        <Skeleton variant="text" width="80%" sx={{ mx: 'auto' }} />
      </Paper>
    );
  }

  if (error || !scoreData) {
    return (
      <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {tl?.noScore ?? 'No score available'}
        </Typography>
        <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 1.5 }}>
          {tl?.noScoreDescription ?? 'This contact has not been scored yet.'}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshCw size={14} />}
          onClick={() => computeMutation.mutate(contactId)}
          disabled={computeMutation.isPending}
        >
          {computeMutation.isPending
            ? (tl?.computing ?? 'Computing...')
            : (tl?.computeScore ?? 'Compute Score')}
        </Button>
      </Paper>
    );
  }

  const tierLabel = tl?.tier?.[scoreData.tier] ?? scoreData.tier;
  const tierColor = getTierColor(scoreData.tier, theme.palette);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {tl?.gauge?.title ?? 'Lead Score'}
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <GaugeSvg score={scoreData.score} palette={theme.palette} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Tooltip title={`${tl?.confidence ?? 'Confidence'}: ${Math.round(scoreData.confidence * 100)}%`}>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{ color: tierColor }}
            >
              {tierLabel}
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" display="block">
            {tl?.computedAt ?? 'Scored at'}:{' '}
            {new Date(scoreData.computedAt).toLocaleDateString()}
          </Typography>
          <Button
            size="small"
            startIcon={<RefreshCw size={12} />}
            onClick={() => computeMutation.mutate(contactId)}
            disabled={computeMutation.isPending}
            sx={{ mt: 0.5, p: 0, minWidth: 'auto', fontSize: '0.7rem' }}
          >
            {computeMutation.isPending
              ? (tl?.computing ?? '...')
              : (tl?.computeScore ?? 'Refresh')}
          </Button>
        </Box>
      </Stack>

      {/* Top Contributing Factors */}
      <Typography variant="caption" fontWeight={600} gutterBottom display="block">
        {tl?.gauge?.topFactors ?? 'Top Contributing Factors'}
      </Typography>
      {topFactors.length > 0 ? (
        topFactors.map((f) => (
          <FactorBar
            key={f.key}
            label={f.label}
            value={f.value}
            maxValue={maxFactorValue}
          />
        ))
      ) : (
        <Typography variant="caption" color="text.disabled">
          {tl?.gauge?.noFactors ?? 'No factor data available'}
        </Typography>
      )}
    </Paper>
  );
}
