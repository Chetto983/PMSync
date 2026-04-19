/**
 * TodayKpiChip — outlined anchor-chip for the TodayHeader KPI strip (145.1-03).
 *
 * Uses `component="a" href` so Cmd/Ctrl/middle-click opens in a new tab natively
 * (fixes WR-06 for chips). Hover transition collapses under prefers-reduced-motion
 * per UI-SPEC §Accessibility.
 *
 * Optional `color` prop (added in 145.1-06) accepts a theme-native semantic token
 * and drives icon color + outline + 8% tinted background (16% on hover). Omitting
 * `color` preserves the original neutral grayscale rendering so existing tests and
 * consumers remain unaffected.
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
  /**
   * Theme-native semantic color (e.g. `pmSyncColors.semantic.email`) for icon +
   * outline + tinted bg. Optional — chip stays neutral when omitted.
   */
  color?: string;
}

export function TodayKpiChip({ icon: Icon, count, secondary, label, href, loading, color }: Props) {
  if (loading) return <Skeleton variant="rounded" width={72} height={32} />;
  // Tint alpha suffixes follow the MUI-idiomatic pattern used elsewhere in the
  // codebase (e.g. crm-deals/KanbanBoard uses `stage.color + '14'`). 14 hex = ~8%
  // alpha, 29 hex = ~16% alpha — subtle enough to stay legible on both themes.
  const tintedBg = color ? `${color}14` : undefined;
  const tintedBgHover = color ? `${color}29` : undefined;
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
        bgcolor: tintedBg,
        borderColor: color ? color : undefined,
        transition: 'all 150ms ease-out',
        // Reduced-motion fallback per UI-SPEC §Accessibility line 221.
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
        '&:hover': {
          boxShadow: 1,
          borderColor: color ? color : 'grey.300',
          bgcolor: tintedBgHover,
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: color ? color : 'primary.main',
          outlineOffset: 2,
        },
        // Scope the icon wrapper so the semantic color wins over theme defaults.
        // MuiChip-icon is MUI v7's public class for the Chip icon slot.
        '& .MuiChip-icon': color ? { color } : undefined,
      }}
    />
  );
}
