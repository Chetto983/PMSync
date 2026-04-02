import React from 'react';
import { Box, Typography, Chip, useTheme } from '@mui/material';
import { Zap, Clock, Star, Bell, Archive, HelpCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { FollowUpIndicator } from './FollowUpIndicator';

interface TriageStatusSectionProps {
  emailId: string;
  lane?: string | null;
  labels?: string[] | null;
  priorityReason?: string | null;
  intent?: string | null;
  actionability?: string | null;
}

const LANE_ICONS: Record<string, typeof Zap> = {
  'action-now': Zap,
  'waiting-on-reply': Clock,
  'customer-vip': Star,
  'system-alerts': Bell,
  'review-later': Archive,
};

const LANE_PALETTE: Record<string, string> = {
  'action-now': 'error',
  'waiting-on-reply': 'warning',
  'customer-vip': 'primary',
  'system-alerts': 'info',
  'review-later': 'text',
};

export function TriageStatusSection({
  emailId,
  lane,
  labels,
  priorityReason,
  intent,
  actionability,
}: TriageStatusSectionProps) {
  const theme = useTheme();
  const t = useTranslations();
  const tr = t.ai.triage;

  if (!lane && (!labels || labels.length === 0)) return null;

  const Icon = lane ? (LANE_ICONS[lane] ?? HelpCircle) : null;
  const paletteKey = lane ? (LANE_PALETTE[lane] ?? 'text') : 'text';
  const color =
    paletteKey === 'text'
      ? theme.palette.text.secondary
      : (theme.palette as unknown as Record<string, { main: string }>)[paletteKey]?.main ??
        theme.palette.text.secondary;

  const laneLabel = lane
    ? ((tr.lanes as Record<string, string>)[
        lane.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
      ] ?? lane)
    : null;

  return (
    <Box
      sx={{
        px: { xs: 1.5, sm: 2 },
        pl: { xs: 1.5, sm: 7.5 },
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {tr.inbox.triageStatus}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {lane && Icon && (
          <Chip
            size="small"
            icon={<Icon size={14} />}
            label={laneLabel}
            sx={{
              bgcolor: `${color}14`,
              color,
              border: `1px solid ${color}33`,
              '& .MuiChip-icon': { color },
            }}
          />
        )}

        {labels && labels.map((label) => (
          <Chip
            key={label}
            size="small"
            label={label}
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        ))}
      </Box>

      {priorityReason && (
        <Typography variant="caption" color="text.secondary">
          {tr.reasoning.priorityReason}: {priorityReason}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {intent && (
          <Typography variant="caption" color="text.secondary">
            {tr.reasoning.intent}: {intent}
          </Typography>
        )}
        {actionability && actionability !== 'none' && (
          <Typography variant="caption" color="text.secondary">
            {tr.reasoning.actionability}: {actionability}
          </Typography>
        )}
      </Box>

      <FollowUpIndicator emailId={emailId} />
    </Box>
  );
}
