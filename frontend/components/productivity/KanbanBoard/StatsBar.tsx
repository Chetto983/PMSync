'use client';

import React from 'react';
import { Box, Typography, alpha, useTheme, Skeleton } from '@mui/material';
import { Clock, AlertTriangle, Calendar, CheckCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { FollowUpStats } from '@/hooks/queries/use-follow-ups';

interface StatsBarProps {
  stats: FollowUpStats | null | undefined;
  isLoading?: boolean;
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}

function StatItem({ icon, label, value, color, highlight }: StatItemProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        borderRadius: 2.5,
        bgcolor: highlight ? alpha(color, 0.06) : alpha(color, 0.02),
        border: highlight
          ? `1px solid ${alpha(color, 0.2)}`
          : `1px solid ${alpha(color, 0.06)}`,
        transition: 'all 0.2s ease',
        minWidth: { xs: 'calc(50% - 6px)', sm: 0 },
        flex: '1 1 0',
        '&:hover': {
          bgcolor: alpha(color, 0.08),
          borderColor: alpha(color, 0.2),
          boxShadow: `0 2px 8px ${alpha(color, 0.08)}`,
        },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2,
          bgcolor: alpha(color, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            fontSize: '1.25rem',
            lineHeight: 1.2,
            color: highlight ? color : 'text.primary',
          }}
        >
          {value}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

function StatSkeleton() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        flex: '1 1 0',
      }}
    >
      <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: 2 }} />
      <Box>
        <Skeleton width={32} height={24} />
        <Skeleton width={56} height={14} />
      </Box>
    </Box>
  );
}

export function StatsBar({ stats, isLoading }: StatsBarProps) {
  const theme = useTheme();
  const t = useTranslations();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </Box>
    );
  }

  if (!stats) return null;

  const s = t.ai.followUpTracker.stats;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <StatItem
        icon={<Clock size={18} />}
        label={s.pending}
        value={stats.pending}
        color={theme.palette.warning.main}
      />
      <StatItem
        icon={<AlertTriangle size={18} />}
        label={s.overdue}
        value={stats.overdue}
        color={theme.palette.error.main}
        highlight={stats.overdue > 0}
      />
      <StatItem
        icon={<Calendar size={18} />}
        label={s.dueToday}
        value={stats.dueToday}
        color={theme.palette.info.main}
        highlight={stats.dueToday > 0}
      />
      <StatItem
        icon={<CheckCircle size={18} />}
        label={s.resolved}
        value={stats.resolved}
        color={theme.palette.success.main}
      />
    </Box>
  );
}

export default StatsBar;
