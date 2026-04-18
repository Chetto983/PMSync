/**
 * TodayEmptyState — Inbox-zero celebration card per UI-SPEC §<TodayEmptyState> (145.1-03).
 *
 * Single centered card with ✨ + title + body. No illustration, no CTA, no preview row.
 */

'use client';

import { Box, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

export function TodayEmptyState() {
  const t = useTranslations();
  return (
    <Box maxWidth={480} mx="auto" py={6} textAlign="center">
      <Typography sx={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
        ✨
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 600, mt: 2, color: 'text.primary' }}>
        {t.dashboard.today.empty.title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        {t.dashboard.today.empty.body}
      </Typography>
    </Box>
  );
}
