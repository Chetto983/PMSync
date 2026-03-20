'use client';

import React from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  alpha,
  useTheme,
  IconButton,
  Tooltip,
  Chip,
  Divider,
} from '@mui/material';
import { Search, Bell, Keyboard } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { FollowUpStats } from '@/hooks/queries/use-follow-ups';
import { StatsBar } from './StatsBar';

// ── Page header ──
interface PageHeaderProps {
  t: ReturnType<typeof useTranslations>;
  isMobile: boolean;
  stats: FollowUpStats | null | undefined;
  statsLoading: boolean;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  typeFilter?: 'WAITING_FOR' | 'TODO';
  onTypeFilterChange: (v: 'WAITING_FOR' | 'TODO' | undefined) => void;
  onShowHelp: () => void;
}

export function PageHeader({
  t,
  isMobile,
  stats,
  statsLoading,
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onShowHelp,
}: PageHeaderProps) {
  const theme = useTheme();

  return (
    <Box sx={{ px: 2, pt: 2, pb: 1 }}>
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2.5,
            bgcolor: alpha(theme.palette.warning.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'warning.main',
          }}
        >
          <Bell size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: '1.125rem' }}>
            {t.ai.followUpTracker.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t.ai.followUpTracker.kanban?.subtitle || t.ai.followUpTracker.subtitle}
          </Typography>
        </Box>
        {!isMobile && (
          <Tooltip title={t.ai.followUpTracker.kanban?.keyboard?.title || 'Keyboard Shortcuts'}>
            <IconButton size="small" onClick={onShowHelp} sx={{ color: 'text.secondary' }}>
              <Keyboard size={18} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Stats bar */}
      <StatsBar stats={stats} isLoading={statsLoading} />

      {/* Search + filter row */}
      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder={t.ai.followUpTracker.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
          sx={{
            flex: 1,
            minWidth: 200,
            '& .MuiOutlinedInput-root': { borderRadius: 2, height: 36 },
          }}
        />
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(['WAITING_FOR', 'TODO'] as const).map((type) => (
            <Chip
              key={type}
              label={type === 'WAITING_FOR' ? t.ai.followUpTracker.types.waitingFor : t.ai.followUpTracker.types.todo}
              variant={typeFilter === type ? 'filled' : 'outlined'}
              color={typeFilter === type ? 'primary' : 'default'}
              size="small"
              onClick={() => onTypeFilterChange(typeFilter === type ? undefined : type)}
              sx={{ cursor: 'pointer', fontWeight: 500 }}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ── Keyboard help dialog ──
export function KeyboardHelpDialog({
  open,
  onClose,
  t,
}: {
  open: boolean;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const kb = t.ai.followUpTracker.kanban?.keyboard;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Keyboard size={18} />
        {kb?.title || 'Keyboard Shortcuts'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {kb?.navigation || 'Navigation'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
          <ShortcutRow keys="j" label={kb?.moveDown || 'Move down'} />
          <ShortcutRow keys="k" label={kb?.moveUp || 'Move up'} />
          <ShortcutRow keys="h" label={kb?.prevColumn || 'Previous column'} />
          <ShortcutRow keys="l" label={kb?.nextColumn || 'Next column'} />
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {kb?.actions || 'Actions'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <ShortcutRow keys="Enter" label={kb?.openEmail || 'Open email'} />
          <ShortcutRow keys="r" label={kb?.resolve || 'Resolve'} />
          <ShortcutRow keys="s" label={kb?.snooze || 'Snooze'} />
          <ShortcutRow keys="?" label={kb?.showHelp || 'Show help'} />
          <ShortcutRow keys="Esc" label={kb?.clearSelection || 'Clear selection'} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.common.close || 'Close'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box
        component="kbd"
        sx={{
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
          fontSize: '0.7rem',
          fontFamily: 'monospace',
          fontWeight: 600,
          minWidth: 24,
          textAlign: 'center',
        }}
      >
        {keys}
      </Box>
    </Box>
  );
}
