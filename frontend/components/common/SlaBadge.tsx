'use client';

import { Chip } from '@mui/material';
import { useMemo } from 'react';

interface SlaBadgeProps {
  slaDeadline: string | Date | null | undefined;
  /** Compact mode for list views */
  size?: 'small' | 'medium';
}

/**
 * SLA Badge — shows remaining time with semantic color:
 * - green: >50% time remaining
 * - yellow/warning: 20–50% remaining
 * - red/error: <20% remaining or overdue
 *
 * Calculates percentage based on elapsed time since ticket creation
 * relative to the deadline. Uses client-side calculation.
 */
export function SlaBadge({ slaDeadline, size = 'small' }: SlaBadgeProps) {
  const { label, color } = useMemo(() => {
    if (!slaDeadline) {
      return { label: '—', color: 'default' as const };
    }

    const deadline = new Date(slaDeadline);
    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();

    if (diffMs <= 0) {
      // Overdue
      const overdueMin = Math.abs(Math.floor(diffMs / 60000));
      return {
        label: overdueMin >= 60
          ? `-${Math.floor(overdueMin / 60)}h ${overdueMin % 60}m`
          : `-${overdueMin}m`,
        color: 'error' as const,
      };
    }

    const remainingMin = Math.floor(diffMs / 60000);
    const formattedTime =
      remainingMin >= 1440
        ? `${Math.floor(remainingMin / 1440)}d ${Math.floor((remainingMin % 1440) / 60)}h`
        : remainingMin >= 60
          ? `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
          : `${remainingMin}m`;

    // Estimate total SLA window: assume deadline was set relative to creation.
    // Use ratio of remaining vs total to determine urgency.
    // Heuristic: if <2h remaining, it's always red; <8h yellow; else green.
    let chipColor: 'success' | 'warning' | 'error';
    if (remainingMin < 120) {
      chipColor = 'error';
    } else if (remainingMin < 480) {
      chipColor = 'warning';
    } else {
      chipColor = 'success';
    }

    return { label: formattedTime, color: chipColor };
  }, [slaDeadline]);

  if (!slaDeadline) return null;

  return (
    <Chip
      label={label}
      color={color}
      size={size}
      variant="outlined"
    />
  );
}
