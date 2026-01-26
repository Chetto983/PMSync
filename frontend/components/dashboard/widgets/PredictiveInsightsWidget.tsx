/**
 * PredictiveInsightsWidget - AI-powered predictive insights
 *
 * 2025 AI Pattern: Surfaces actionable insights proactively
 * Based on Gartner 2025 Analytics Report recommendations
 */

'use client';

import { useMemo } from 'react';
import { Box, Typography, Stack, alpha, useTheme } from '@mui/material';
import {
  Sparkles,
  Mail,
  Clock,
  Users,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useBriefing,
  useDeadlines,
  useFollowUps,
  useStaleContacts,
} from '@/hooks/queries/use-dashboard';
import { BaseWidget } from './BaseWidget';

interface Insight {
  id: string;
  type: 'urgent' | 'warning' | 'info' | 'success';
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
}

export function PredictiveInsightsWidget() {
  const t = useTranslations();
  const theme = useTheme();

  // Fetch all data sources
  const { data: briefing, isLoading: briefingLoading } = useBriefing();
  const { data: deadlines, isLoading: deadlinesLoading } = useDeadlines({ limit: 10 });
  const { data: followUps, isLoading: followUpsLoading } = useFollowUps({ limit: 10 });
  const { data: staleContacts, isLoading: staleLoading } = useStaleContacts({ limit: 10 });

  const isLoading = briefingLoading || deadlinesLoading || followUpsLoading || staleLoading;

  // Generate AI insights from data
  const insights = useMemo<Insight[]>(() => {
    const result: Insight[] = [];

    // Urgent emails insight
    if (briefing?.urgentEmails && briefing.urgentEmails > 0) {
      result.push({
        id: 'urgent-emails',
        type: 'urgent',
        icon: <Mail size={18} />,
        title: t.dashboard?.widgets?.insights?.urgentEmails || `${briefing.urgentEmails} emails need response today`,
        description:
          t.dashboard?.widgets?.insights?.urgentEmailsDesc ||
          'These emails have been flagged as high priority',
        action: {
          label: t.common?.viewAll || 'View All',
          href: '/dashboard/email?filter=urgent',
        },
      });
    }

    // Overdue deadlines insight
    const overdueDeadlines = deadlines?.deadlines?.filter(
      (d) => new Date(d.dueDate) < new Date()
    ).length;
    if (overdueDeadlines && overdueDeadlines > 0) {
      result.push({
        id: 'overdue-deadlines',
        type: 'urgent',
        icon: <AlertTriangle size={18} />,
        title:
          t.dashboard?.widgets?.insights?.overdueDeadlines ||
          `${overdueDeadlines} overdue deadline${overdueDeadlines > 1 ? 's' : ''}`,
        description:
          t.dashboard?.widgets?.insights?.overdueDeadlinesDesc ||
          'These items require immediate attention',
        action: {
          label: t.common?.viewAll || 'View All',
          href: '/dashboard#deadlines',
        },
      });
    }

    // Today's deadlines
    if (deadlines?.todayCount && deadlines.todayCount > 0) {
      result.push({
        id: 'today-deadlines',
        type: 'warning',
        icon: <Clock size={18} />,
        title:
          t.dashboard?.widgets?.insights?.todayDeadlines ||
          `${deadlines.todayCount} deadline${deadlines.todayCount > 1 ? 's' : ''} due today`,
        description:
          t.dashboard?.widgets?.insights?.todayDeadlinesDesc ||
          'Plan your day to complete these on time',
        action: {
          label: t.dashboard?.widgets?.deadlines?.viewAll || 'View Deadlines',
          href: '/dashboard#deadlines',
        },
      });
    }

    // Overdue follow-ups
    if (followUps?.overdueCount && followUps.overdueCount > 0) {
      result.push({
        id: 'overdue-followups',
        type: 'warning',
        icon: <Mail size={18} />,
        title:
          t.dashboard?.widgets?.insights?.overdueFollowUps ||
          `${followUps.overdueCount} follow-up${followUps.overdueCount > 1 ? 's' : ''} overdue`,
        description:
          t.dashboard?.widgets?.insights?.overdueFollowUpsDesc ||
          'Consider sending a reminder or closing these',
        action: {
          label: t.dashboard?.widgets?.followUps?.viewAll || 'View Follow-ups',
          href: '/dashboard/ai/follow-ups',
        },
      });
    }

    // Stale contacts
    const staleCount = staleContacts?.contacts?.length || 0;
    if (staleCount > 0) {
      result.push({
        id: 'stale-contacts',
        type: 'info',
        icon: <Users size={18} />,
        title:
          t.dashboard?.widgets?.insights?.staleContacts ||
          `${staleCount} contact${staleCount > 1 ? 's' : ''} need reconnection`,
        description:
          t.dashboard?.widgets?.insights?.staleContactsDesc ||
          'Maintain relationships by reaching out',
        action: {
          label: t.dashboard?.widgets?.crm?.viewAll || 'View Contacts',
          href: '/dashboard/contacts?filter=stale',
        },
      });
    }

    // Success insight - all caught up
    if (result.length === 0) {
      result.push({
        id: 'all-clear',
        type: 'success',
        icon: <CheckCircle2 size={18} />,
        title: t.dashboard?.widgets?.insights?.allClear || "You're all caught up!",
        description:
          t.dashboard?.widgets?.insights?.allClearDesc ||
          'No urgent items require your attention right now',
      });
    }

    return result.slice(0, 4); // Max 4 insights
  }, [briefing, deadlines, followUps, staleContacts, t]);

  const getInsightColor = (type: Insight['type']) => {
    switch (type) {
      case 'urgent':
        return theme.palette.error.main;
      case 'warning':
        return theme.palette.warning.main;
      case 'success':
        return theme.palette.success.main;
      default:
        return theme.palette.info.main;
    }
  };

  return (
    <BaseWidget
      id="predictive-insights"
      title={t.dashboard?.widgets?.insights?.title || 'AI Insights'}
      subtitle={t.dashboard?.widgets?.insights?.subtitle || 'What needs your attention'}
      loading={isLoading}
      icon={<Sparkles size={18} />}
    >
      <Stack spacing={1.5}>
        {insights.map((insight) => {
          const color = getInsightColor(insight.type);
          return (
            <Box
              key={insight.id}
              component={insight.action ? 'a' : 'div'}
              href={insight.action?.href}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 2,
                p: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: alpha(color, 0.2),
                bgcolor: alpha(color, 0.06),
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.2s ease',
                cursor: insight.action ? 'pointer' : 'default',
                '&:hover': insight.action
                  ? {
                      bgcolor: alpha(color, 0.12),
                      borderColor: alpha(color, 0.35),
                      transform: 'translateX(4px)',
                    }
                  : {},
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: alpha(color, 0.15),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: color,
                  flexShrink: 0,
                }}
              >
                {insight.icon}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: 'text.primary',
                    mb: 0.25,
                  }}
                >
                  {insight.title}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    display: 'block',
                  }}
                >
                  {insight.description}
                </Typography>
              </Box>
              {insight.action && (
                <ArrowRight
                  size={18}
                  color={theme.palette.text.secondary}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
              )}
            </Box>
          );
        })}
      </Stack>
    </BaseWidget>
  );
}
