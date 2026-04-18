/**
 * TodayKpiChip — outlined anchor-chip for the TodayHeader KPI strip (145.1-03).
 *
 * Uses `component="a" href` so Cmd/Ctrl/middle-click opens in a new tab natively
 * (fixes WR-06 for chips). Hover transition collapses under prefers-reduced-motion
 * per UI-SPEC §Accessibility.
 */

'use client';

import { Chip, Box, Typography, Skeleton } from '@mui/material';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  count: number;
  secondary?: string;
  label: string;
  href: string;
  loading?: boolean;
}

export function TodayKpiChip({ icon: Icon, count, secondary, label, href, loading }: Props) {
  if (loading) return <Skeleton variant="rounded" width={72} height={32} />;
  return (
    <Chip
      component="a"
      href={href}
      clickable
      variant="outlined"
      size="small"
      aria-label={label}
      icon={<Icon size={16} aria-hidden />}
      label={
        <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography
            component="span"
            sx={{
              fontSize: 14,
              fontWeight: 600,
              color: 'text.primary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </Typography>
          {secondary && (
            <Typography component="span" sx={{ fontSize: 12, color: 'primary.main' }}>
              · {secondary}
            </Typography>
          )}
        </Box>
      }
      sx={{
        height: 32,
        px: 0.5,
        transition: 'all 150ms ease-out',
        // Reduced-motion fallback per UI-SPEC §Accessibility line 221.
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
        '&:hover': { boxShadow: 1, borderColor: 'grey.300' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    />
  );
}
