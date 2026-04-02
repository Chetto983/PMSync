import React, { useState } from 'react';
import {
  Box, Typography, Chip, useTheme, IconButton, Menu, MenuItem,
  ListItemText, Divider, Tooltip,
} from '@mui/material';
import { Zap, Clock, Star, Bell, Archive, HelpCircle, Settings, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { FollowUpIndicator } from './FollowUpIndicator';
import { useTriageOverrides, useCreateOverride, useDeleteOverride } from '@/hooks/queries/use-triage-overrides';

interface TriageStatusSectionProps {
  emailId: string;
  senderEmail?: string;
  lane?: string | null;
  intent?: string | null;
  actionability?: string | null;
}

const LANE_ICONS: Record<string, typeof Zap> = {
  'action-now': Zap, 'waiting-on-reply': Clock, 'customer-vip': Star,
  'system-alerts': Bell, 'review-later': Archive,
};

const LANE_PALETTE: Record<string, string> = {
  'action-now': 'error', 'waiting-on-reply': 'warning', 'customer-vip': 'primary',
  'system-alerts': 'info', 'review-later': 'text',
};

const OVERRIDE_ACTIONS = [
  { action: 'always-important', labelKey: 'alwaysImportant' },
  { action: 'always-review-later', labelKey: 'alwaysReviewLater' },
  { action: 'always-system-alert', labelKey: 'alwaysSystemAlert' },
  { action: 'never-follow-up', labelKey: 'neverFollowUp' },
  { action: 'always-customer-vip', labelKey: 'alwaysCustomerVip' },
] as const;

export function TriageStatusSection({
  emailId, senderEmail, lane, intent, actionability,
}: TriageStatusSectionProps) {
  const theme = useTheme();
  const t = useTranslations();
  const tr = t.ai.triage;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const { data: overrides } = useTriageOverrides();
  const createOverride = useCreateOverride();
  const deleteOverride = useDeleteOverride();

  if (!lane && !intent && !actionability) return null;

  const Icon = lane ? (LANE_ICONS[lane] ?? HelpCircle) : null;
  const paletteKey = lane ? (LANE_PALETTE[lane] ?? 'text') : 'text';
  const color = paletteKey === 'text'
    ? theme.palette.text.secondary
    : (theme.palette as unknown as Record<string, { main: string }>)[paletteKey]?.main ?? theme.palette.text.secondary;

  const laneLabel = lane
    ? ((tr.lanes as Record<string, string>)[lane.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] ?? lane)
    : null;

  const senderDomain = senderEmail ? senderEmail.split('@')[1] : null;

  // Find active overrides affecting this email
  const activeOverrides = (overrides ?? []).filter((o) => {
    if (o.type === 'sender' && senderEmail) return senderEmail.toLowerCase().includes(o.pattern);
    if (o.type === 'domain' && senderDomain) return senderDomain === o.pattern;
    return false;
  });

  const handleCreateOverride = (type: 'sender' | 'domain', action: string) => {
    const pattern = type === 'sender' ? (senderEmail ?? '') : (senderDomain ?? '');
    if (!pattern) return;
    createOverride.mutate({ type, pattern: pattern.toLowerCase(), action });
    setMenuAnchor(null);
  };

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2 }, pl: { xs: 1.5, sm: 7.5 }, py: 1, display: 'flex', flexDirection: 'column', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {tr.inbox.triageStatus}
        </Typography>
        {senderEmail && (
          <Tooltip title={tr.overrides.title}>
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.25 }}>
              <Settings size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {lane && Icon && (
          <Chip size="small" icon={<Icon size={14} />} label={laneLabel}
            sx={{ bgcolor: `${color}14`, color, border: `1px solid ${color}33`, '& .MuiChip-icon': { color } }} />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {intent && <Typography variant="caption" color="text.secondary">{tr.reasoning.intent}: {intent}</Typography>}
        {actionability && actionability !== 'none' && (
          <Typography variant="caption" color="text.secondary">{tr.reasoning.actionability}: {actionability}</Typography>
        )}
      </Box>

      {activeOverrides.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {activeOverrides.map((o) => (
            <Chip key={o.id} size="small" label={`${tr.overrides.active}: ${o.action}`}
              onDelete={() => deleteOverride.mutate(o.id)}
              deleteIcon={<Trash2 size={12} />}
              sx={{ height: 20, fontSize: '0.65rem' }} />
          ))}
        </Box>
      )}

      <FollowUpIndicator emailId={emailId} />

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {senderEmail && (
          <MenuItem disabled sx={{ opacity: 1, fontSize: '0.75rem', fontWeight: 600 }}>
            {tr.overrides.fromSender}: {senderEmail}
          </MenuItem>
        )}
        {OVERRIDE_ACTIONS.map(({ action, labelKey }) => (
          <MenuItem key={`sender-${action}`} onClick={() => handleCreateOverride('sender', action)}
            sx={{ fontSize: '0.8125rem' }}>
            <ListItemText>{(tr.overrides as Record<string, string>)[labelKey]}</ListItemText>
          </MenuItem>
        ))}
        {senderDomain && (
          <>
            <Divider />
            <MenuItem disabled sx={{ opacity: 1, fontSize: '0.75rem', fontWeight: 600 }}>
              {tr.overrides.fromDomain}: {senderDomain}
            </MenuItem>
            {OVERRIDE_ACTIONS.map(({ action, labelKey }) => (
              <MenuItem key={`domain-${action}`} onClick={() => handleCreateOverride('domain', action)}
                sx={{ fontSize: '0.8125rem' }}>
                <ListItemText>{(tr.overrides as Record<string, string>)[labelKey]}</ListItemText>
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </Box>
  );
}
