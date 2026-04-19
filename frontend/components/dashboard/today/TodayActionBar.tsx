/**
 * TodayActionBar — primary actions row for the Today dashboard.
 *
 * Keeps the page useful in both empty and populated states by surfacing the
 * four most likely next moves: ask AI, open mail, check calendar, review tasks.
 */

'use client';

import { Box, Button, Stack } from '@mui/material';
import { Calendar, CheckSquare, Mail, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface Props {
  onAskAi: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function TodayActionBar({ onAskAi, onRefresh, refreshing = false }: Props) {
  const t = useTranslations();

  return (
    <Box
      sx={{
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        alignItems={{ xs: 'stretch', md: 'center' }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<Sparkles size={16} />}
          onClick={onAskAi}
        >
          {t.ai.title}
        </Button>
        <Button
          component="a"
          href="/dashboard/email"
          variant="outlined"
          size="small"
          startIcon={<Mail size={16} />}
        >
          {t.nav.mail}
        </Button>
        <Button
          component="a"
          href="/dashboard/calendar"
          variant="outlined"
          size="small"
          startIcon={<Calendar size={16} />}
        >
          {t.nav.calendar}
        </Button>
        <Button
          component="a"
          href="/dashboard/tasks"
          variant="outlined"
          size="small"
          startIcon={<CheckSquare size={16} />}
        >
          {t.nav.tasks}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="text"
          size="small"
          onClick={onRefresh}
          disabled={refreshing}
          startIcon={<RefreshCw size={16} />}
        >
          {refreshing ? t.common.refreshing : t.common.refresh}
        </Button>
      </Stack>
    </Box>
  );
}
