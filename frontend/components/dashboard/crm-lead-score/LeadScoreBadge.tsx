import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { LeadScoreTier } from '@/lib/api/crm-lead-scores';

interface LeadScoreBadgeProps {
  score: number;
  tier?: LeadScoreTier;
  size?: 'small' | 'medium';
}

function getScoreColor(score: number): 'success' | 'warning' | 'default' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'default';
}

function inferTier(score: number): LeadScoreTier {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export function LeadScoreBadge({ score, tier, size = 'small' }: LeadScoreBadgeProps) {
  const t = useTranslations();
  const tl = t.leadScore;
  const resolvedTier = tier ?? inferTier(score);
  const tierLabel = tl?.tier?.[resolvedTier] ?? resolvedTier;
  const label = `${score} · ${tierLabel}`;
  const tooltipText = tl?.badge?.label ?? 'Lead Score';

  return (
    <Tooltip title={`${tooltipText}: ${score}/100`}>
      <Chip
        label={label}
        size={size}
        color={getScoreColor(score)}
        variant="outlined"
        sx={size === 'small' ? { height: 18, fontSize: '0.65rem' } : undefined}
      />
    </Tooltip>
  );
}
