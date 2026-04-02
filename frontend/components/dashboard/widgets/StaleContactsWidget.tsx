/**
 * StaleContactsWidget - Contacts needing reconnection with relationship intelligence
 */

'use client';

import { useStaleContacts } from '@/hooks/queries/use-dashboard';
import { useContactCounts } from '@/hooks/queries/use-contacts';
import { useTranslations } from '@/lib/hooks/use-translations';
import { DEFAULT_STALE_CONTACT_DAYS } from '@/lib/crm/stale-contacts';
import { BaseWidget } from './BaseWidget';
import {
  Typography,
  Chip,
  Box,
  Stack,
  LinearProgress,
  alpha,
  useTheme,
} from '@mui/material';
import { Users, TrendingDown, TrendingUp, Minus, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

const TREND_ICONS = {
  decreasing: TrendingDown,
  stable: Minus,
  increasing: TrendingUp,
} as const;

const FREQUENCY_KEY_MAP: Record<string, string> = {
  daily: 'frequencyDaily',
  weekly: 'frequencyWeekly',
  monthly: 'frequencyMonthly',
  occasional: 'frequencyOccasional',
};

export function StaleContactsWidget() {
  const t = useTranslations();
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useStaleContacts({ limit: 5, days: DEFAULT_STALE_CONTACT_DAYS });
  const { data: contactCounts } = useContactCounts();

  const crm = t.dashboard.widgets.crm;
  const hasAnyContacts = (contactCounts?.total ?? 0) > 0;

  return (
    <BaseWidget
      id="contacts"
      title={crm.title}
      loading={isLoading}
      error={error?.message}
      rawError={error}
      onRefresh={() => refetch()}
      icon={<Users size={18} />}
      actions={
        data?.total ? (
          <Chip
            label={data.total === 1 ? crm.subtitle.replace('{count}', '1') : crm.subtitlePlural.replace('{count}', String(data.total))}
            size="small"
            color="warning"
          />
        ) : null
      }
    >
      {data && data.contacts.length > 0 ? (
        <Stack spacing={1.5}>
          {data.contacts.map((contact) => {
            const TrendIcon = TREND_ICONS[contact.trend || 'stable'];
            const freqKey = FREQUENCY_KEY_MAP[contact.previousFrequency || 'occasional'] || 'frequencyOccasional';
            const freqLabel = (crm as Record<string, string>)[freqKey] || contact.previousFrequency || '';
            const scoreColor = contact.relationshipScore > 50
              ? 'success'
              : contact.relationshipScore > 20
                ? 'warning'
                : 'error';

            return (
              <Box
                key={contact.id}
                onClick={() => router.push(`/dashboard/contacts?id=${contact.id}`)}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'border-color 0.15s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    '& .reconnect-arrow': { opacity: 1 },
                  },
                  '@media (hover: none)': {
                    '& .reconnect-arrow': { opacity: 0.5 },
                  },
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {contact.name}
                      </Typography>
                      <TrendIcon
                        size={14}
                        color={
                          contact.trend === 'decreasing'
                            ? theme.palette.error.main
                            : contact.trend === 'increasing'
                              ? theme.palette.success.main
                              : theme.palette.text.disabled
                        }
                      />
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">
                        {crm.daysAgo.replace('{days}', String(contact.daysSinceContact))}
                      </Typography>
                      {freqLabel && (
                        <>
                          <Typography variant="caption" color="text.disabled">·</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {freqLabel}
                          </Typography>
                        </>
                      )}
                      {(contact.totalInteractions ?? 0) > 0 && (
                        <>
                          <Typography variant="caption" color="text.disabled">·</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {crm.interactions.replace('{count}', String(contact.totalInteractions))}
                          </Typography>
                        </>
                      )}
                    </Stack>
                  </Box>
                  <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Chip
                      label={crm.score.replace('{score}', String(contact.relationshipScore))}
                      size="small"
                      color={scoreColor as 'success' | 'warning' | 'error'}
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }}
                    />
                    <ArrowRight
                      size={14}
                      className="reconnect-arrow"
                      style={{ opacity: 0, transition: 'opacity 0.15s', color: theme.palette.primary.main }}
                    />
                  </Stack>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={contact.relationshipScore}
                  color={scoreColor as 'success' | 'warning' | 'error'}
                  sx={{
                    mt: 1,
                    height: 3,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.divider, 0.3),
                  }}
                />
              </Box>
            );
          })}
          {data.averageScore > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
              {crm.avgScore.replace('{score}', String(data.averageScore))}
            </Typography>
          )}
        </Stack>
      ) : (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {hasAnyContacts ? crm.allActive : crm.noContactsSynced}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {hasAnyContacts ? crm.greatJob : crm.noContactsSyncedDescription}
          </Typography>
        </Box>
      )}
    </BaseWidget>
  );
}
