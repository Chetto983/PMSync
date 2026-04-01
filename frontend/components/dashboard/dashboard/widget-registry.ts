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
  TrendingUp,
  Users,
  Shield,
  Building2,
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
const TrendChartsWidget = lazy(() =>
  import('../widgets/TrendChartsWidget').then((m) => ({ default: m.TrendChartsWidget }))
);
const StaleContactsWidget = lazy(() =>
  import('../widgets/StaleContactsWidget').then((m) => ({ default: m.StaleContactsWidget }))
);
const AiTriageWidget = lazy(() =>
  import('../widgets/AiTriageWidget').then((m) => ({ default: m.AiTriageWidget }))
);
const CrmSuggestionsFeed = lazy(() =>
  import('../CrmSuggestionsFeed').then((m) => ({ default: m.CrmSuggestionsFeed }))
);

export type WidgetId =
  | 'briefing'
  | 'events'
  | 'emails'
  | 'deadlines'
  | 'followups'
  | 'trends'
  | 'contacts'
  | 'triage'
  | 'crmSuggestions';

export interface WidgetConfig {
  id: WidgetId;
  icon: React.ReactNode;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
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
    id: 'trends',
    icon: React.createElement(TrendingUp, { size: 20 }),
    component: TrendChartsWidget,
  },
  {
    id: 'contacts',
    icon: React.createElement(Users, { size: 20 }),
    component: StaleContactsWidget,
  },
  {
    id: 'triage',
    icon: React.createElement(Shield, { size: 20 }),
    component: AiTriageWidget,
  },
  {
    id: 'crmSuggestions',
    icon: React.createElement(Building2, { size: 20 }),
    component: CrmSuggestionsFeed,
  },
];

export function getWidgetName(id: WidgetId, t: ReturnType<typeof useTranslations>): string {
  const names: Record<WidgetId, string> = {
    briefing: t.dashboard?.widgets?.briefing?.title || 'Daily Briefing',
    events: t.dashboard?.widgets?.todayEvents?.title || "Today's Events",
    emails: t.dashboard?.widgets?.unreadEmails?.title || 'Unread Emails',
    deadlines: t.dashboard?.widgets?.deadlines?.title || 'Deadlines',
    followups: t.dashboard?.widgets?.followUps?.title || 'Follow-ups',
    trends: t.dashboard?.widgets?.trendCharts?.title || 'Email Activity',
    contacts: t.dashboard?.widgets?.crm?.title || 'Stale Contacts',
    triage: t.dashboard?.widgets?.aiTriage?.title || 'AI Triage',
    crmSuggestions: t.crmSuggestions?.title || 'AI Suggestions',
  };
  return names[id];
}

export function getWidgetDescription(id: WidgetId, _t: ReturnType<typeof useTranslations>): string {
  const descriptions: Record<WidgetId, string> = {
    briefing: 'AI-powered summary of your day',
    events: 'Calendar events for today',
    emails: 'Your unread email count',
    deadlines: 'Upcoming deadlines',
    followups: 'Pending follow-ups',
    trends: 'Email activity trends',
    contacts: 'Contacts needing reconnection',
    triage: 'AI-prioritized email inbox',
    crmSuggestions: 'Review pending CRM suggestions from real inbox activity',
  };
  return descriptions[id];
}
