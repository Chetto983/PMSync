/**
 * BriefingWidget - Daily briefing summary with AI insights
 */

'use client';

import { useBriefing, useRecentUnreadEmails } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Box, Typography, Chip, Stack } from '@mui/material';
import { Sparkles, AlertCircle, Calendar, Mail, Users } from 'lucide-react';

export function BriefingWidget() {
  const t = useTranslations();
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
          {/* AI Summary - only show if backend provided one */}
          {data.summary && (
            <Typography
              variant="body1"
              sx={{
                color: 'text.primary',
                fontWeight: 500,
                lineHeight: 1.6,
              }}
            >
              {data.summary}
            </Typography>
          )}

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
                      py: 0.75,
                      px: 0,
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
