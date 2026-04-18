/**
 * TodayHeader — Greeting + localized date + 4 KPI chip strip (145.1-03).
 *
 * H1 24px greeting (morning/afternoon/evening via hour bucket) + H2 14px date-fns
 * localized date + 4 KPI chips with hrefs to the pillar destinations.
 *
 * Greeting/date are inert Typography per UI-SPEC §Click targets (no handlers, no
 * anchor role). Only KPI chips are interactive.
 */

'use client';

import { Box, Stack, Typography } from '@mui/material';
import { format } from 'date-fns';
import { it as itLocale, enUS } from 'date-fns/locale';
import { Mail, Calendar, Briefcase, CheckSquare } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import type { TodayFeedCounts } from '@/lib/api/dashboard';
import { TodayKpiChip } from './TodayKpiChip';

interface Props {
  counts?: TodayFeedCounts;
  loading: boolean;
}

function pickGreetingKey(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function TodayHeader({ counts, loading }: Props) {
  const t = useTranslations();
  const { locale } = useLocale();
  const greeting = t.dashboard.today.greeting[pickGreetingKey()];
  const dateStr = format(new Date(), 'EEEE d MMMM', {
    locale: locale === 'it' ? itLocale : enUS,
  });
  return (
    <Stack spacing={1.5} component="header">
      <Box>
        <Typography
          sx={{
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.2,
            color: 'text.primary',
          }}
        >
          {greeting}
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'text.secondary',
          }}
        >
          {dateStr}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TodayKpiChip
          icon={Mail}
          count={counts?.kpi.inbox ?? 0}
          label={t.dashboard.today.kpi.inbox}
          href="/dashboard/email"
          loading={loading}
        />
        <TodayKpiChip
          icon={Calendar}
          count={counts?.kpi.calendar ?? 0}
          label={t.dashboard.today.kpi.calendar}
          href="/dashboard/calendar"
          loading={loading}
        />
        <TodayKpiChip
          icon={Briefcase}
          count={counts?.kpi.deals ?? 0}
          label={t.dashboard.today.kpi.deals}
          href="/dashboard/crm/deals"
          loading={loading}
        />
        <TodayKpiChip
          icon={CheckSquare}
          count={counts?.kpi.tasks ?? 0}
          label={t.dashboard.today.kpi.tasks}
          href="/dashboard/tasks"
          loading={loading}
        />
      </Stack>
    </Stack>
  );
}
