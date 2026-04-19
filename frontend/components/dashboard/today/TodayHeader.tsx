/**
 * TodayHeader — page framing + localized date + 4 KPI chip strip.
 *
 * Keeps the time-based greeting as secondary context, but promotes the Today page
 * title/subtitle so the view reads like a command surface instead of a greeting card.
 */

'use client';

import { Box, Stack, Typography } from '@mui/material';
import { format } from 'date-fns';
import { it as itLocale, enUS } from 'date-fns/locale';
import { Mail, Calendar, Briefcase, CheckSquare } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import type { TodayFeedCounts } from '@/lib/api/dashboard';
import { pmSyncColors } from '@/theme/appTheme';
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
    <Stack spacing={2} component="header">
      <Box>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: pmSyncColors.brand.cyanVibrant,
          }}
        >
          {greeting}
        </Typography>
        <Typography
          component="h1"
          sx={{
            mt: 0.75,
            fontSize: { xs: 30, md: 34 },
            fontWeight: 600,
            lineHeight: 1.1,
            color: 'text.primary',
          }}
        >
          {t.dashboard.today.title}
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontSize: 15,
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'text.secondary',
          }}
        >
          {t.dashboard.today.subtitle}
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 500,
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
          color={pmSyncColors.semantic.email}
        />
        <TodayKpiChip
          icon={Calendar}
          count={counts?.kpi.calendar ?? 0}
          label={t.dashboard.today.kpi.calendar}
          href="/dashboard/calendar"
          loading={loading}
          color={pmSyncColors.semantic.calendar}
        />
        <TodayKpiChip
          icon={Briefcase}
          count={counts?.kpi.deals ?? 0}
          label={t.dashboard.today.kpi.deals}
          href="/dashboard/crm/deals"
          loading={loading}
          color={pmSyncColors.semantic.contacts}
        />
        <TodayKpiChip
          icon={CheckSquare}
          count={counts?.kpi.tasks ?? 0}
          label={t.dashboard.today.kpi.tasks}
          href="/dashboard/tasks"
          loading={loading}
          color={pmSyncColors.semantic.tasks}
        />
      </Stack>
    </Stack>
  );
}
