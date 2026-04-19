/**
 * TodayKpiChip — readable anchor-chip for the TodayHeader KPI strip.
 *
 * The chip keeps the icon affordance, but shows a visible text label so the strip
 * can be scanned without relying on icon recall alone.
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
  if (loading) return <Skeleton variant="rounded" width={132} height={36} />;
  const tintedBg = color ? `${color}14` : undefined;
  const tintedBgHover = color ? `${color}29` : undefined;
  const countBg = color ? `${color}20` : 'action.hover';
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
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            component="span"
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: 'text.primary',
              lineHeight: 1.2,
            }}
          >
            {label}
          </Typography>
          <Box
            component="span"
            sx={{
              minWidth: 22,
              px: 0.75,
              py: 0.125,
              borderRadius: '999px',
              bgcolor: countBg,
            }}
          >
            <Typography
              component="span"
              sx={{
                display: 'block',
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: color ?? 'text.primary',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.35,
              }}
            >
              {count}
            </Typography>
          </Box>
          {secondary && (
            <Typography
              component="span"
              sx={{
                fontSize: 12,
                color: 'primary.main',
                lineHeight: 1.2,
              }}
            >
              {secondary}
            </Typography>
          )}
        </Box>
      }
      sx={{
        height: 36,
        px: 0.75,
        bgcolor: tintedBg,
        borderColor: color ? color : undefined,
        transition: 'all 150ms ease-out',
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
        '& .MuiChip-icon': color ? { color } : undefined,
      }}
    />
  );
}
