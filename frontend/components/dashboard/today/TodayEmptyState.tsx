/**
 * TodayEmptyState — Celebratory empty state per UI-SPEC § Empty State (D-07).
 *
 * - Paper elevation=0, py: 8, centered
 * - PartyPopper icon (48px) in 80px success-tinted circle
 * - "You're all caught up!" heading (h5, weight 600)
 * - Body variants:
 *     - When `nextItem` provided: "No urgent items right now…" + dimmed preview row
 *     - When no nextItem: "Nothing on your plate today…"
 */

'use client';

import { Box, Paper, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { PartyPopper } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { TodayFeedItem } from '@/lib/api/dashboard';
import { TodayFeedItem as Row } from './TodayFeedItem';

interface TodayEmptyStateProps {
  nextItem?: TodayFeedItem;
}

export function TodayEmptyState({ nextItem }: TodayEmptyStateProps) {
  const t = useTranslations();
  const theme = useTheme();
  const copy = t.dashboard.today.empty;

  return (
    <Paper
      elevation={0}
      sx={{
        py: 8,
        px: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        bgcolor: 'transparent',
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          bgcolor: alpha(theme.palette.success.main, 0.12),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
        }}
      >
        <PartyPopper size={48} color={theme.palette.success.main} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
        {copy.title}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ maxWidth: 400, mb: nextItem ? 3 : 0 }}
      >
        {nextItem ? copy.body : copy.bodyClean}
      </Typography>
      {nextItem && (
        <Box sx={{ width: '100%', maxWidth: 480, opacity: 0.6 }}>
          <Row item={nextItem} disabled />
        </Box>
      )}
    </Paper>
  );
}
