/**
 * BriefingWidget - Daily briefing summary with AI insights
 */

'use client';

import { useBriefing, useRecentUnreadEmails } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Box, Typography, Chip, Stack, alpha, useTheme } from '@mui/material';
import { Sparkles, AlertCircle, Calendar, Mail, Users } from 'lucide-react';

export function BriefingWidget() {
  const t = useTranslations();
  const theme = useTheme();
  const { data, isLoading, error, refetch } = useBriefing();
  const { data: recentEmails } = useRecentUnreadEmails({ limit: 3 });

  // Generate highlights from recent emails if briefing highlights are empty
  const highlights = data?.highlights?.length
    ? data.highlights
    : recentEmails?.emails?.slice(0, 3).map((email) => {
        const senderName = email.from?.name || email.from?.email || 'Unknown';
        const subject = email.subject || '(No subject)';
        return `Email from ${senderName}: ${subject}`;
      }) || [];

  return (
    <BaseWidget
      id="briefing"
      title={t.dashboard?.widgets?.briefing?.title || 'Daily Briefing'}
      loading={isLoading}
      error={error?.message}
      onRefresh={() => refetch()}
      icon={<Sparkles size={18} />}
    >
      {data && (
        <Stack spacing={2.5}>
          {/* Summary */}
          <Typography
            variant="body1"
            sx={{
              color: 'text.primary',
              fontWeight: 500,
              lineHeight: 1.6,
            }}
          >
            {data.summary ||
              t.dashboard?.widgets?.briefing?.defaultSummary?.replace('{count}', String(recentEmails?.total || 0)) ||
              `You have ${recentEmails?.total || 0} unread emails${recentEmails?.emails?.length ? `, ${recentEmails.emails.length} received today.` : '.'}`}
          </Typography>

          {/* Stats Chips */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {data.urgentEmails > 0 && (
              <Chip
                icon={<Mail size={14} />}
                label={`${data.urgentEmails} ${t.dashboard?.widgets?.briefing?.urgent || 'urgent'}`}
                size="small"
                color="error"
                sx={{ fontWeight: 600 }}
              />
            )}
            {data.deadlinesToday > 0 && (
              <Chip
                icon={<AlertCircle size={14} />}
                label={`${data.deadlinesToday} ${t.dashboard?.widgets?.briefing?.deadlines || 'deadlines'}`}
                size="small"
                color="warning"
                sx={{ fontWeight: 600 }}
              />
            )}
            {data.pendingFollowUps > 0 && (
              <Chip
                icon={<Calendar size={14} />}
                label={`${data.pendingFollowUps} ${t.dashboard?.widgets?.briefing?.followUps || 'follow-ups'}`}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
            {data.staleContacts > 0 && (
              <Chip
                icon={<Users size={14} />}
                label={`${data.staleContacts} ${t.dashboard?.widgets?.briefing?.staleContacts || 'stale contacts'}`}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Stack>

          {/* Highlights */}
          {highlights.length > 0 && (
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  color: 'text.primary',
                }}
              >
                {t.dashboard?.widgets?.briefing?.highlights || "Today's Highlights"}
              </Typography>
              <Stack spacing={1}>
                {highlights.map((highlight, i) => (
                  <Box
                    key={i}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.action.hover, 0.5),
                      border: '1px solid',
                      borderColor: alpha(theme.palette.divider, 0.06),
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      • {highlight}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
    </BaseWidget>
  );
}
