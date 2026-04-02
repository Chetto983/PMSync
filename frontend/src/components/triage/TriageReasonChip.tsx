import React, { useState } from 'react';
import {
  Chip,
  Popover,
  Box,
  Typography,
  Stack,
  LinearProgress,
  useTheme,
} from '@mui/material';
import { Zap, Clock, Star, Bell, Archive, HelpCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TriageReasonChipProps {
  lane?: string | null;
  priority?: number | null;
  priorityReason?: string | null;
  sentiment?: string | null;
  labels?: string[];
  intent?: string | null;
  actionability?: string | null;
  /** Compact mode for list rows (chip only) */
  compact?: boolean;
}

const LANE_CONFIG: Record<string, { icon: typeof Zap; paletteKey: string }> = {
  'action-now': { icon: Zap, paletteKey: 'error' },
  'waiting-on-reply': { icon: Clock, paletteKey: 'warning' },
  'customer-vip': { icon: Star, paletteKey: 'primary' },
  'system-alerts': { icon: Bell, paletteKey: 'info' },
  'review-later': { icon: Archive, paletteKey: 'text' },
};

export function TriageReasonChip({
  lane,
  priority,
  priorityReason,
  sentiment,
  labels,
  intent,
  actionability,
  compact = true,
}: TriageReasonChipProps) {
  const theme = useTheme();
  const t = useTranslations();
  const tr = t.ai.triage;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (!lane) return null;

  const config = LANE_CONFIG[lane] ?? { icon: HelpCircle, paletteKey: 'text' };
  const Icon = config.icon;
  const color =
    config.paletteKey === 'text'
      ? theme.palette.text.secondary
      : (theme.palette as unknown as Record<string, { main: string }>)[config.paletteKey]?.main ??
        theme.palette.text.secondary;

  const laneLabel =
    (tr.lanes as Record<string, string>)[
      lane.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    ] ?? lane;

  const urgency = priority != null ? Math.max(0, Math.min(100, (5 - priority) * 25)) : null;

  const handleClick = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <Chip
        size="small"
        icon={<Icon size={14} />}
        label={compact ? undefined : laneLabel}
        onClick={handleClick}
        sx={{
          height: compact ? 22 : 24,
          bgcolor: `${color}14`,
          color,
          border: `1px solid ${color}33`,
          cursor: 'pointer',
          '& .MuiChip-icon': { color, ml: compact ? 0.5 : undefined },
          ...(compact && { '& .MuiChip-label': { display: 'none' } }),
          minWidth: compact ? 28 : undefined,
        }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 320 } } }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Icon size={16} color={color} />
            <Typography variant="subtitle2">{laneLabel}</Typography>
          </Box>

          {labels && labels.length > 0 && (
            <Row label={tr.reasoning.label}>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {labels.map((l) => (
                  <Chip key={l} label={l} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                ))}
              </Box>
            </Row>
          )}

          {urgency != null && (
            <Row label={tr.reasoning.score}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={urgency}
                  sx={{ flex: 1, height: 6, borderRadius: 3 }}
                  color={urgency >= 75 ? 'error' : urgency >= 50 ? 'warning' : 'primary'}
                />
                <Typography variant="caption" color="text.secondary">
                  {priority}/5
                </Typography>
              </Box>
            </Row>
          )}

          {priorityReason && (
            <Row label={tr.reasoning.priorityReason}>
              <Typography variant="body2" color="text.secondary">
                {priorityReason}
              </Typography>
            </Row>
          )}

          {intent && (
            <Row label={tr.reasoning.intent}>
              <Typography variant="body2" color="text.secondary">
                {intent}
              </Typography>
            </Row>
          )}

          {actionability && (
            <Row label={tr.reasoning.actionability}>
              <Typography variant="body2" color="text.secondary">
                {actionability}
              </Typography>
            </Row>
          )}

          {sentiment && (
            <Row label={t.ai.triage.sentimentLabel}>
              <Typography variant="body2" color="text.secondary">
                {sentiment}
              </Typography>
            </Row>
          )}
        </Stack>
      </Popover>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  );
}
