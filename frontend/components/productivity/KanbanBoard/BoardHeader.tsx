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
    <Box sx={{ px: 2, pt: 2.5, pb: 1 }}>
      {/* Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2.5,
            bgcolor: alpha(theme.palette.warning.main, 0.08),
            border: `1px solid ${alpha(theme.palette.warning.main, 0.12)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'warning.main',
          }}
        >
          <Bell size={22} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              lineHeight: 1.2,
              fontSize: '1.25rem',
              letterSpacing: -0.25,
            }}
          >
            {t.ai.followUpTracker.title}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '0.8125rem',
              mt: 0.25,
              lineHeight: 1.4,
            }}
          >
            {t.ai.followUpTracker.subtitle}
          </Typography>
        </Box>
        {!isMobile && (
          <Tooltip title={t.ai.followUpTracker.kanban?.keyboard?.title || 'Keyboard Shortcuts'}>
            <IconButton
              size="small"
              onClick={onShowHelp}
              sx={{
                color: 'text.secondary',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                width: 36,
                height: 36,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.2),
                },
              }}
            >
              <Keyboard size={16} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Stats */}
      <StatsBar stats={stats} isLoading={statsLoading} />

      {/* Search + filter */}
      <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
            '& .MuiOutlinedInput-root': {
              borderRadius: 2.5,
              height: 38,
              bgcolor: alpha(theme.palette.background.paper, 0.8),
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(theme.palette.primary.main, 0.3),
              },
            },
          }}
        />
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {(['WAITING_FOR', 'TODO'] as const).map((type) => (
            <Chip
              key={type}
              label={
                type === 'WAITING_FOR'
                  ? t.ai.followUpTracker.types.waitingFor
                  : t.ai.followUpTracker.types.todo
              }
              variant={typeFilter === type ? 'filled' : 'outlined'}
              color={typeFilter === type ? 'primary' : 'default'}
              size="small"
              onClick={() => onTypeFilterChange(typeFilter === type ? undefined : type)}
              sx={{
                cursor: 'pointer',
                fontWeight: 500,
                height: 30,
                borderRadius: 2,
                '&:hover': {
                  boxShadow: `0 1px 4px ${alpha(theme.palette.common.black, 0.08)}`,
                },
              }}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// ── Keyboard help ──
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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontWeight: 700,
          fontSize: '1rem',
        }}
      >
        <Keyboard size={18} />
        {kb?.title || 'Keyboard Shortcuts'}
      </DialogTitle>
      <DialogContent>
        <Typography
          variant="overline"
          sx={{
            color: 'text.secondary',
            mb: 1,
            display: 'block',
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {kb?.navigation || 'Navigation'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2.5 }}>
          <ShortcutRow keys="j" label={kb?.moveDown || 'Move down'} />
          <ShortcutRow keys="k" label={kb?.moveUp || 'Move up'} />
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Typography
          variant="overline"
          sx={{
            color: 'text.secondary',
            mb: 1,
            mt: 2,
            display: 'block',
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {kb?.actions || 'Actions'}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ShortcutRow keys="Enter" label={kb?.openEmail || 'Open email'} />
          <ShortcutRow keys="r" label={kb?.resolve || 'Resolve'} />
          <ShortcutRow keys="s" label={kb?.snooze || 'Snooze'} />
          <ShortcutRow keys="?" label={kb?.showHelp || 'Show help'} />
          <ShortcutRow keys="Esc" label={kb?.clearSelection || 'Clear selection'} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          size="small"
          sx={{ borderRadius: 2, textTransform: 'none' }}
        >
          {t.common.close || 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.4) },
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
        {label}
      </Typography>
      <Box
        component="kbd"
        sx={{
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.action.hover, 0.6),
          border: '1px solid',
          borderColor: 'divider',
          fontSize: '0.6875rem',
          fontFamily: 'monospace',
          fontWeight: 600,
          minWidth: 28,
          textAlign: 'center',
          color: 'text.primary',
        }}
      >
        {keys}
      </Box>
    </Box>
  );
}
