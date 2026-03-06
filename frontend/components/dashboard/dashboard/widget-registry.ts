/**
 * Widget Registry - Configuration for all dashboard widgets
 */

import React, { lazy } from 'react';
import {
  Sparkles,
  Calendar,
  Mail,
  Clock,
  Bell,
  Star,
  TrendingUp,
} from 'lucide-react';
import type { useTranslations } from '@/lib/hooks/use-translations';

// Lazy loaded widgets for better performance
const BriefingWidget = lazy(() =>
  import('../widgets/BriefingWidget').then((m) => ({ default: m.BriefingWidget }))
);
const UnreadEmailsWidget = lazy(() =>
  import('../widgets/UnreadEmailsWidget').then((m) => ({ default: m.UnreadEmailsWidget }))
);
const DeadlinesWidget = lazy(() =>
  import('../widgets/DeadlinesWidget').then((m) => ({ default: m.DeadlinesWidget }))
);
const FollowUpWidget = lazy(() =>
  import('../widgets/FollowUpWidget').then((m) => ({ default: m.FollowUpWidget }))
);
const TodayEventsWidget = lazy(() =>
  import('../widgets/TodayEventsWidget').then((m) => ({ default: m.TodayEventsWidget }))
);
const PredictiveInsightsWidget = lazy(() =>
  import('../widgets/PredictiveInsightsWidget').then((m) => ({ default: m.PredictiveInsightsWidget }))
);
const PriorityInboxWidget = lazy(() =>
  import('../widgets/PriorityInboxWidget').then((m) => ({ default: m.PriorityInboxWidget }))
);
const TrendChartsWidget = lazy(() =>
  import('../widgets/TrendChartsWidget').then((m) => ({ default: m.TrendChartsWidget }))
);

export type WidgetId = 'briefing' | 'insights' | 'events' | 'emails' | 'deadlines' | 'followups' | 'priority' | 'trends';

export interface WidgetConfig {
  id: WidgetId;
  icon: React.ReactNode;
  component: React.LazyExoticComponent<() => React.JSX.Element>;
  fullWidth?: boolean;
}

export const WIDGETS: WidgetConfig[] = [
  {
    id: 'briefing',
    icon: React.createElement(Sparkles, { size: 20 }),
    component: BriefingWidget,
    fullWidth: true,
  },
  {
    id: 'insights',
    icon: React.createElement(Sparkles, { size: 20 }),
    component: PredictiveInsightsWidget,
  },
  {
    id: 'events',
    icon: React.createElement(Calendar, { size: 20 }),
    component: TodayEventsWidget,
  },
  {
    id: 'emails',
    icon: React.createElement(Mail, { size: 20 }),
    component: UnreadEmailsWidget,
  },
  {
    id: 'deadlines',
    icon: React.createElement(Clock, { size: 20 }),
    component: DeadlinesWidget,
  },
  {
    id: 'followups',
    icon: React.createElement(Bell, { size: 20 }),
    component: FollowUpWidget,
  },
  {
    id: 'priority',
    icon: React.createElement(Star, { size: 20 }),
    component: PriorityInboxWidget,
  },
  {
    id: 'trends',
    icon: React.createElement(TrendingUp, { size: 20 }),
    component: TrendChartsWidget,
  },
];

export function getWidgetName(id: WidgetId, t: ReturnType<typeof useTranslations>): string {
  const names: Record<WidgetId, string> = {
    briefing: t.dashboard?.widgets?.briefing?.title || 'Daily Briefing',
    insights: t.dashboard?.widgets?.insights?.title || 'AI Insights',
    events: t.calendar?.title || "Today's Events",
    emails: t.email?.title || 'Unread Emails',
    deadlines: t.dashboard?.widgets?.deadlines?.title || 'Deadlines',
    followups: t.dashboard?.widgets?.followUps?.title || 'Follow-ups',
    priority: t.dashboard?.widgets?.priorityInbox?.title || 'Priority Inbox',
    trends: t.dashboard?.widgets?.trendCharts?.title || 'Email Activity',
  };
  return names[id];
}

export function getWidgetDescription(id: WidgetId): string {
  const descriptions: Record<WidgetId, string> = {
    briefing: 'AI-powered summary of your day',
    insights: 'Proactive action items and alerts',
    events: 'Calendar events for today',
    emails: 'Your unread email count',
    deadlines: 'Upcoming deadlines',
    followups: 'Pending follow-ups',
    priority: 'Starred and important emails',
    trends: 'Email activity trends',
  };
  return descriptions[id];
}
