/**
 * TodayGreeting — Optional 2-3 line greeting at top of feed.
 *
 * Per UI-SPEC § Component Inventory: hidden on `xs` breakpoint.
 * Falls back to localized greeting interpolated with counts when backend
 * greeting is null but feed has items.
 */

'use client';

import { Box, Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { TodayFeedCounts } from '@/lib/api/dashboard';

interface TodayGreetingProps {
  greeting: string | null;
  counts: TodayFeedCounts;
}

export function TodayGreeting({ greeting, counts }: TodayGreetingProps) {
  const t = useTranslations();

  // Hide entirely when nothing to say.
  if (!greeting && counts.total === 0) return null;

  const text =
    greeting ??
    t.dashboard.today.greeting
      .replace('{urgent}', String(counts.urgent))
      .replace('{today}', String(counts.today))
      .replace('{fyi}', String(counts.fyi));

  return (
    <Box sx={{ display: { xs: 'none', sm: 'block' }, mb: 1 }}>
      <Typography
        component="p"
        variant="h5"
        sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.5 }}
      >
        {text}
      </Typography>
    </Box>
  );
}
