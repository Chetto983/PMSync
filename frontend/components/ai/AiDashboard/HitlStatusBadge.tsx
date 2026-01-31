'use client';

/**
 * HitlStatusBadge - Status Indicator Chip for HITL Actions
 *
 * Extracted from InlineActionCard.tsx renderStatusBadge().
 * Displays action status with appropriate color coding.
 */

import React from 'react';
import { Chip } from '@mui/material';

export interface HitlStatusBadgeProps {
  status?: string;
  translations?: {
    approved?: string;
    rejected?: string;
    executed?: string;
    failed?: string;
    expired?: string;
  };
}

const STATUS_CONFIG = {
  APPROVED: { color: 'success' as const, defaultLabel: 'Approved' },
  REJECTED: { color: 'error' as const, defaultLabel: 'Rejected' },
  EXECUTED: { color: 'success' as const, defaultLabel: 'Executed' },
  FAILED: { color: 'error' as const, defaultLabel: 'Failed' },
  EXPIRED: { color: 'warning' as const, defaultLabel: 'Expired' },
};

export function HitlStatusBadge({ status, translations }: HitlStatusBadgeProps) {
  // Don't show badge for PENDING status
  if (!status || status === 'PENDING') return null;

  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const label = translations?.[status.toLowerCase() as keyof typeof translations]
    ?? config.defaultLabel;

  return (
    <Chip
      size="small"
      label={label}
      color={config.color}
      sx={{ fontWeight: 600, fontSize: '0.7rem' }}
    />
  );
}

export default HitlStatusBadge;
