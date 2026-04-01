/**
 * AiTriageWidget - Single priority view for email
 *
 * Replaces both the old PriorityInboxWidget and the standalone AiTriageWidget.
 * Section 1: AI-triaged emails by priority (1-5 scale) — source of truth
 * Section 2: User-pinned (starred/flagged) — manual override, shown separately
 *
 * Addresses: DASH-C1, DASH-H3
 */

'use client';

import { useTriagedEmails, useImportantEmails } from '@/hooks/queries/use-dashboard';
import { usePendingFollowUps } from '@/hooks/queries/use-follow-ups';
import { useConsent } from '@/hooks/queries/use-consent';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import { getLaneLabel, groupEmailsByTriageLane, type TriageLane } from '@/lib/email-triage/triage-lanes';
import { BaseWidget } from './BaseWidget';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Box,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import { Zap, Inbox, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Priority to color mapping (1 = highest, 5 = lowest)
const PRIORITY_CONFIG: Record<number, { color: 'error' | 'warning' | 'info' | 'success' | 'default' }> = {
  1: { color: 'error' },
  2: { color: 'warning' },
  3: { color: 'info' },
  4: { color: 'success' },
  5: { color: 'default' },
};

const SENTIMENT_CONFIG: Record<string, { color: 'success' | 'error' | 'warning' | 'default' }> = {
  positive: { color: 'success' },
  negative: { color: 'error' },
  mixed: { color: 'warning' },
  neutral: { color: 'default' },
};

const LANE_CONFIG: Record<TriageLane, { color: 'error' | 'warning' | 'info' | 'default'; variant?: 'filled' | 'outlined' }> = {
  'action-now': { color: 'error', variant: 'filled' },
  'waiting-on-reply': { color: 'warning', variant: 'outlined' },
  'system-alerts': { color: 'info', variant: 'outlined' },
  'review-later': { color: 'default', variant: 'outlined' },
};

export function AiTriageWidget() {
  const t = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();
  const { data: consentList, isLoading: consentLoading } = useConsent();
  const hasAiConsent =
    consentList?.some((consent) => consent.feature === 'ai_email_processing' && consent.granted) ?? false;
  const { data: triageData, isLoading: triageLoading, error: triageError, refetch: refetchTriage } = useTriagedEmails({ limit: 5 }, hasAiConsent);
  const { data: starredData, isLoading: starredLoading, error: starredError, refetch: refetchStarred } = useImportantEmails({ limit: 3 }, hasAiConsent);
  const { data: followUpData, isLoading: followUpsLoading, error: followUpsError, refetch: refetchFollowUps } = usePendingFollowUps(20, false, hasAiConsent);

  const isLoading = consentLoading || triageLoading || starredLoading || followUpsLoading;
  const error = hasAiConsent ? (triageError || starredError || followUpsError) : undefined;
  const totalBadge = (triageData?.total || 0) + (starredData?.total || 0);

  const handleViewAll = () => {
    router.push('/dashboard/email?filter=triaged');
  };

  const handleEmailClick = (emailId: string) => {
    router.push(`/dashboard/email?id=${emailId}`);
  };

  const getPriorityConfig = (priority: number) => {
    return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[3];
  };

  const getSentimentConfig = (sentiment?: string | null) => {
    if (!sentiment) return null;
    return SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.neutral;
  };

  const getFromDisplay = (from: string | { name?: string; email?: string }): string => {
    if (typeof from === 'string') return from;
    return from?.name || from?.email || 'Unknown';
  };

  const getSentimentLabel = (sentiment?: string | null) => {
    if (!sentiment) return null;
    return t.threadMessage?.ai?.[sentiment as 'positive' | 'negative' | 'neutral' | 'mixed'] || sentiment;
  };

  const getLaneConfig = (lane: TriageLane) => {
    return LANE_CONFIG[lane];
  };

  const formatDueLabel = (dueDate?: string | null) => {
    if (!dueDate) return null;
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.getTime() < Date.now()) return t.dashboard.widgets.common.overdue;
    return parsed.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  };

  const getFollowUpTypeLabel = (followUpType?: string | null) => {
    const labels = t.dashboard.widgets.aiTriage?.followUpTypes;
    if (followUpType === 'WAITING_FOR') return labels?.waitingFor ?? 'Waiting';
    if (followUpType === 'TODO') return labels?.todo ?? 'To do';
    return null;
  };

  const handleRefresh = () => {
    refetchTriage();
    refetchStarred();
    refetchFollowUps();
  };

  const noConsentMessage =
    t.settings?.consentPanel?.features?.ai_email_processing?.description ||
    'Enable AI email processing in Settings to see triaged emails.';

  const hasTriaged = triageData && triageData.emails.length > 0;
  const hasStarred = starredData && starredData.emails.length > 0;
  const triageLaneGroups = groupEmailsByTriageLane(
    triageData?.emails || [],
    (followUpData?.followUps || []).map((followUp) => ({
      emailId: followUp.emailId,
      followUpType: followUp.followUpType,
      dueDate: followUp.dueDate,
      status: followUp.status,
      reason: followUp.reason,
    })),
  ).filter((group) => group.items.length > 0);
  const hasAny = hasTriaged || hasStarred;

  return (
    <BaseWidget
      id="ai-triage"
      title={t.dashboard.widgets.aiTriage?.title || 'Email Priority'}
      loading={isLoading}
      error={error?.message}
      rawError={error}
      onRefresh={hasAiConsent ? handleRefresh : undefined}
      icon={<Zap size={18} />}
      badge={hasAiConsent ? (totalBadge || undefined) : undefined}
      isEmpty={!isLoading && !hasAiConsent}
      emptyText={noConsentMessage}
      actions={
        hasAny ? (
          <Button size="small" onClick={handleViewAll}>
            {t.dashboard.widgets.aiTriage?.viewAll || 'View All'}
          </Button>
        ) : undefined
      }
    >
      {hasAny ? (
        <>
          {/* Section 1: AI-triaged by lane */}
          {hasTriaged && (
            <>
              <Box sx={{ px: 1, mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t.dashboard.widgets.aiTriage?.aiTriagedSection || 'AI Triage'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  {triageLaneGroups.map((group) => {
                    const laneConfig = getLaneConfig(group.lane);
                    return (
                      <Chip
                        key={group.lane}
                        size="small"
                        color={laneConfig.color}
                        variant={laneConfig.variant || 'outlined'}
                        label={`${getLaneLabel(group.lane, locale)} · ${group.items.length}`}
                        sx={{ fontWeight: 600 }}
                      />
                    );
                  })}
                </Box>
              </Box>

              {triageLaneGroups.map((group) => (
                <Box key={group.lane} sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {getLaneLabel(group.lane, locale)}
                  </Typography>
                  <List dense disablePadding sx={{ mt: 0.5 }}>
                    {group.items.map(({ email, followUp }) => {
                      const priorityConfig = getPriorityConfig(email.aiPriority);
                      const sentimentConfig = getSentimentConfig(email.aiSentiment);
                      const sentimentLabel = getSentimentLabel(email.aiSentiment);
                      const dueLabel = formatDueLabel(followUp?.dueDate);
                      const followUpTypeLabel = getFollowUpTypeLabel(followUp?.followUpType);
                      return (
                        <ListItem
                          key={email.id}
                          disablePadding
                          sx={{
                            mb: 0.5,
                            cursor: 'pointer',
                            borderRadius: 1,
                            '&:hover': { bgcolor: 'action.hover' },
                            px: 1,
                            py: 0.5,
                          }}
                          onClick={() => handleEmailClick(email.id)}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Chip
                              size="small"
                              label={email.aiPriority}
                              color={priorityConfig.color}
                              sx={{ width: 24, height: 24, fontSize: '0.7rem', fontWeight: 600 }}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: email.isRead ? 400 : 600, flex: 1 }}>
                                  {email.subject || t.dashboard.widgets.aiTriage?.noSubject}
                                </Typography>
                                {email.aiLabels && email.aiLabels.length > 0 && (
                                  <Chip label={email.aiLabels[0]} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                                )}
                                {followUpTypeLabel && (
                                  <Chip
                                    label={followUpTypeLabel}
                                    size="small"
                                    variant="outlined"
                                    color={followUp?.followUpType === 'WAITING_FOR' ? 'warning' : 'error'}
                                    sx={{ height: 18, fontSize: '0.6rem' }}
                                  />
                                )}
                                {dueLabel && (
                                  <Chip
                                    label={dueLabel}
                                    size="small"
                                    variant="outlined"
                                    color={dueLabel === (locale === 'it' ? 'Scaduto' : 'Overdue') ? 'error' : 'default'}
                                    sx={{ height: 18, fontSize: '0.6rem' }}
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.25 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                  <Typography variant="caption" noWrap color="text.secondary" sx={{ minWidth: 0 }}>
                                    {getFromDisplay(email.from)}
                                  </Typography>
                                  {email.aiSentiment && sentimentConfig && sentimentLabel && (
                                    <Chip
                                      label={sentimentLabel}
                                      size="small"
                                      color={sentimentConfig.color}
                                      variant="outlined"
                                      sx={{ height: 18, fontSize: '0.6rem' }}
                                    />
                                  )}
                                </Box>
                                {(followUp?.reason || email.aiPriorityReason) && (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    title={followUp?.reason || email.aiPriorityReason || undefined}
                                    sx={{
                                      lineHeight: 1.35,
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {followUp?.reason || email.aiPriorityReason}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              ))}
            </>
          )}

          {/* Divider between sections */}
          {hasTriaged && hasStarred && <Divider sx={{ my: 1 }} />}

          {/* Section 2: User-pinned (starred/flagged) */}
          {hasStarred && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.dashboard.widgets.aiTriage?.userPinnedSection || 'Starred'}
              </Typography>
              <List dense disablePadding>
                {starredData.emails.map((email) => (
                  <ListItem
                    key={email.id}
                    disablePadding
                    sx={{
                      mb: 0.5,
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                      px: 1,
                      py: 0.5,
                    }}
                    onClick={() => handleEmailClick(email.id)}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Star size={16} fill="var(--mui-palette-warning-main)" color="var(--mui-palette-warning-main)" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap sx={{ fontWeight: email.isRead ? 400 : 600 }}>
                          {email.subject || t.dashboard.widgets.aiTriage?.noSubject}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" noWrap color="text.secondary">
                          {typeof email.from === 'object' ? email.from?.name || email.from?.email : email.from}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 3,
            color: 'text.secondary',
          }}
        >
          <Inbox size={32} strokeWidth={1.5} />
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
            {t.dashboard.widgets.aiTriage?.empty || 'No triaged emails'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center' }}>
            {t.dashboard.widgets.aiTriage?.emptyDescription || 'Enable Auto-Triage in AI Settings'}
          </Typography>
        </Box>
      )}
    </BaseWidget>
  );
}
