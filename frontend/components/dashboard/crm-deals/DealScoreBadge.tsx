import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

interface DealScoreBadgeProps {
  score: number;
  size?: 'small' | 'medium';
}

function getScoreColor(score: number): 'success' | 'warning' | 'default' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'default';
}

function getScoreLabel(
  score: number,
  ts?: { hot?: string; warm?: string; cold?: string },
): string {
  if (score >= 70) return ts?.hot ?? 'Hot';
  if (score >= 40) return ts?.warm ?? 'Warm';
  return ts?.cold ?? 'Cold';
}

export function DealScoreBadge({ score, size = 'small' }: DealScoreBadgeProps) {
  const t = useTranslations();
  const ts = t.crmDeals?.score;

  if (score <= 0) return null;

  const label = `${score} · ${getScoreLabel(score, ts)}`;
  const tooltipText = ts?.label ?? 'Deal Score';

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
