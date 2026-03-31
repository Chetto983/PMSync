/**
 * BriefingWidget - Daily briefing summary with AI insights
 */

'use client';

import { useBriefing, useRecentUnreadEmails, useTriagedEmails } from '@/hooks/queries/use-dashboard';
import { usePendingFollowUps } from '@/hooks/queries/use-follow-ups';
import { useConsent } from '@/hooks/queries/use-consent';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  buildFallbackBriefingSummary,
  buildFallbackHighlights,
  groupEmailsByTriageLane,
  isWeakBriefingSummary,
} from '@/lib/email-triage/triage-lanes';
import { BaseWidget } from './BaseWidget';
import { Box, Typography, Chip, Stack } from '@mui/material';
import { Sparkles, AlertCircle, Calendar, Mail, Users } from 'lucide-react';

export function BriefingWidget() {
  const t = useTranslations();
  const { locale } = useLocale();
  const { data: consentList, isLoading: consentLoading } = useConsent();
  const hasAiConsent =
    consentList?.some((consent) => consent.feature === 'ai_email_processing' && consent.granted) ?? false;
  const { data, isLoading, error, refetch } = useBriefing(hasAiConsent);
  const { data: triageData, isLoading: triageLoading } = useTriagedEmails({ limit: 6 }, hasAiConsent);
  const { data: followUpData, isLoading: followUpsLoading } = usePendingFollowUps(10, false, hasAiConsent);
  const { data: recentEmails } = useRecentUnreadEmails({ limit: 3 }, hasAiConsent);
  const noConsentMessage =
    t.settings?.consentPanel?.features?.ai_email_processing?.description ||
    'Enable AI email processing in Settings to see your daily briefing.';
  const loading = consentLoading || isLoading || triageLoading || followUpsLoading;
  const emptyText = hasAiConsent
    ? t.dashboard?.widgets?.common?.noItems || 'No items'
    : noConsentMessage;
  const triageFollowUps = (followUpData?.followUps || []).map((followUp) => ({
    emailId: followUp.emailId,
    followUpType: followUp.followUpType,
    dueDate: followUp.dueDate,
    status: followUp.status,
    reason: followUp.reason,
  }));
  const laneGroups = groupEmailsByTriageLane(triageData?.emails || [], triageFollowUps);
  const laneCount = (lane: 'action-now' | 'waiting-on-reply' | 'system-alerts' | 'review-later') =>
    laneGroups.find((group) => group.lane === lane)?.items.length || 0;
  const weakSummary = isWeakBriefingSummary(data?.summary);
  const fallbackHighlights = buildFallbackHighlights(triageData?.emails || [], triageFollowUps, 3, locale);
  const summary = weakSummary
    ? buildFallbackBriefingSummary(triageData?.emails || [], triageFollowUps, locale)
    : data?.summary || '';
  const highlights = data?.highlights?.length
    ? data.highlights
    : fallbackHighlights.length
      ? fallbackHighlights
      : recentEmails?.emails?.slice(0, 3).map((email) => {
          const senderName = email.from?.name || email.from?.email || '';
          const subject = email.subject || t.common?.noSubject || '(No subject)';
          return `${senderName}: ${subject}`;
        }) || [];
  const urgentEmails = weakSummary ? laneCount('action-now') + laneCount('system-alerts') : (data?.urgentEmails || 0);
  const pendingFollowUps = weakSummary ? (followUpData?.count || 0) : (data?.pendingFollowUps || 0);
  const deadlinesToday = data?.deadlinesToday || 0;
  const staleContacts = data?.staleContacts || 0;

  return (
    <BaseWidget
      id="briefing"
      title={t.dashboard?.widgets?.briefing?.title || 'Daily Briefing'}
      loading={loading}
      error={hasAiConsent ? error?.message : undefined}
      rawError={error}
      onRefresh={hasAiConsent ? () => refetch() : undefined}
      icon={<Sparkles size={18} />}
      isEmpty={!loading && (!hasAiConsent || (!data && (triageData?.emails?.length || 0) === 0))}
      emptyText={emptyText}
    >
      {(data || triageData?.emails?.length) && (
        <Stack spacing={2.5}>
          {/* AI Summary - only show if backend provided one */}
          {summary && (
            <Typography
              variant="body1"
              sx={{
                color: 'text.primary',
                fontWeight: 500,
                lineHeight: 1.6,
              }}
            >
              {summary}
            </Typography>
          )}

          {/* Stats Chips */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {urgentEmails > 0 && (
              <Chip
                icon={<Mail size={14} />}
                label={`${urgentEmails} ${t.dashboard?.widgets?.briefing?.urgent || 'urgent'}`}
                size="small"
                color="error"
                sx={{ fontWeight: 600 }}
              />
            )}
            {deadlinesToday > 0 && (
              <Chip
                icon={<AlertCircle size={14} />}
                label={`${deadlinesToday} ${t.dashboard?.widgets?.briefing?.deadlines || 'deadlines'}`}
                size="small"
                color="warning"
                sx={{ fontWeight: 600 }}
              />
            )}
            {pendingFollowUps > 0 && (
              <Chip
                icon={<Calendar size={14} />}
                label={`${pendingFollowUps} ${t.dashboard?.widgets?.briefing?.followUps || 'follow-ups'}`}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
            {staleContacts > 0 && (
              <Chip
                icon={<Users size={14} />}
                label={`${staleContacts} ${t.dashboard?.widgets?.briefing?.staleContacts || 'stale contacts'}`}
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
