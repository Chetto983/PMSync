/**
 * TodayEmptyState — calm empty state with quick exits into the main work pillars.
 *
 * The page can be genuinely empty, but it should still offer a useful next move.
 */

'use client';

import { Box, Button, Stack, Typography } from '@mui/material';
import { Calendar, CheckSquare, Mail, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function TodayEmptyState() {
  const t = useTranslations();
  return (
    <Box
      maxWidth={720}
      mx="auto"
      py={{ xs: 5, md: 7 }}
      px={{ xs: 3, md: 4 }}
      textAlign="center"
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        data-testid="today-empty-icon"
        sx={{
          width: 56,
          height: 56,
          mx: 'auto',
          display: 'grid',
          placeItems: 'center',
          borderRadius: '18px',
          bgcolor: 'action.hover',
          color: 'primary.main',
        }}
        aria-hidden
      >
        <Sparkles size={28} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mt: 2, color: 'text.primary' }}>
        {t.dashboard.today.empty.title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        {t.dashboard.today.empty.body}
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="center"
        sx={{ mt: 3 }}
      >
        <Button
          component="a"
          href="/dashboard/email"
          variant="contained"
          startIcon={<Mail size={16} />}
        >
          {t.nav.mail}
        </Button>
        <Button
          component="a"
          href="/dashboard/calendar"
          variant="outlined"
          startIcon={<Calendar size={16} />}
        >
          {t.nav.calendar}
        </Button>
        <Button
          component="a"
          href="/dashboard/tasks"
          variant="outlined"
          startIcon={<CheckSquare size={16} />}
        >
          {t.nav.tasks}
        </Button>
      </Stack>
    </Box>
  );
}
