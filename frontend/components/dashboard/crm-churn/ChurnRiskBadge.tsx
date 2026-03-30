import React from 'react';
import { Chip, Tooltip, Box, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useChurnContactSignal, useChurnAccountSignal } from '@/hooks/queries/use-crm-churn';

interface ChurnRiskBadgeProps {
  contactId?: string;
  accountId?: string;
  size?: 'small' | 'medium';
}

const RISK_COLORS: Record<string, 'error' | 'warning' | 'success'> = {
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'success',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ChurnRiskBadge({
  contactId,
  accountId,
  size = 'small',
}: ChurnRiskBadgeProps) {
  const t = useTranslations();
  const tb = t.churn?.badge;
  const tr = t.churn?.riskLevels;

  const contactQuery = useChurnContactSignal(contactId ?? '');
  const accountQuery = useChurnAccountSignal(accountId ?? '');

  const signal = contactId ? contactQuery.data : accountQuery.data;
  const isLoading = contactId ? contactQuery.isLoading : accountQuery.isLoading;

  if (isLoading || !signal) return null;
  if (signal.probability < 0.3) return null;

  const riskLabel =
    tr?.[signal.riskLevel as keyof typeof tr] ?? signal.riskLevel;
  const pctLabel = `${(signal.probability * 100).toFixed(0)}%`;

  const tooltipContent = (
    <Box>
      <Typography variant="body2" fontWeight={600}>
        {tb?.churnRisk ?? 'Churn Risk'}: {riskLabel}
      </Typography>
      <Typography variant="caption">
        {tb?.probability ?? 'Probability'}: {pctLabel}
      </Typography>
      {signal.reasoning && (
        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
          {signal.reasoning}
        </Typography>
      )}
      <Typography variant="caption" display="block" color="text.disabled">
        {tb?.assessedOn ?? 'Assessed on'} {formatDate(signal.computedAt)}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent}>
      <Chip
        label={`${pctLabel} · ${riskLabel}`}
        size={size}
        color={RISK_COLORS[signal.riskLevel] ?? 'default'}
        variant="outlined"
        sx={
          size === 'small'
            ? { height: 18, fontSize: '0.65rem' }
            : undefined
        }
      />
    </Tooltip>
  );
}
