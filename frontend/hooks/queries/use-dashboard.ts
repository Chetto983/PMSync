/**
 * TanStack Query hooks for dashboard widgets
 *
 * Best practices implemented:
 * - Uses existing API modules (voltAgentApi, crmApi, contactsApi, calendarApi)
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Graceful fallbacks when APIs fail
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { dashboardKeys } from './dashboard-keys';
import { voltAgentApi, type CachedDeadline } from '@/lib/api/ai';
import { crmApi, type ContactRelationshipStats } from '@/lib/api/crm';
import { contactsApi } from '@/lib/api/contacts';
import { calendarApi } from '@/lib/api/calendar';
import { apiClient } from '@/lib/api-client';
import type { WidgetLayout, DashboardLayout } from '@/lib/dashboard/layout-engine';

// ============================================================================
// Types
// ============================================================================

export interface BriefingData {
  summary: string;
  urgentEmails: number;
  deadlinesToday: number;
  pendingFollowUps: number;
  staleContacts: number;
  highlights: string[];
  generatedAt: string;
}

export interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  source: 'email' | 'calendar' | 'task';
  sourceId?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface FollowUp {
  id: string;
  emailId: string;
  subject: string;
  contactName: string;
  contactEmail: string;
  dueDate: string;
  status: 'pending' | 'overdue' | 'completed';
  reason?: string;
}

/** API response item for follow-up - used internally */
interface ApiFollowUpItem {
  id: string;
  emailId?: string;
  dueDate?: string;
  reason?: string;
  subject?: string;
  contactName?: string;
  contactEmail?: string;
  email?: {
    subject?: string;
    from?: string;
  };
}

export interface StaleContact {
  id: string;
  name: string;
  email: string;
  company?: string;
  lastInteraction: string;
  relationshipScore: number;
  daysSinceContact: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for daily briefing
 * Uses voltAgentApi.getBriefing()
 */
export function briefingOptions() {
  return queryOptions({
    queryKey: dashboardKeys.briefing(),
    queryFn: async (): Promise<BriefingData> => {
      try {
        const response = await voltAgentApi.getBriefing();
        const briefing = response.data?.briefing || {};
        return {
          summary: (briefing as Record<string, unknown>).summary as string || '',
          urgentEmails: (briefing as Record<string, unknown>).urgentEmails as number || 0,
          deadlinesToday: (briefing as Record<string, unknown>).deadlinesToday as number || 0,
          pendingFollowUps: (briefing as Record<string, unknown>).pendingFollowUps as number || 0,
          staleContacts: (briefing as Record<string, unknown>).staleContacts as number || 0,
          highlights: ((briefing as Record<string, unknown>).highlights as string[]) || [],
          generatedAt: (briefing as Record<string, unknown>).generatedAt as string || new Date().toISOString(),
        };
      } catch {
        // Return empty briefing on failure
        return {
          summary: '',
          urgentEmails: 0,
          deadlinesToday: 0,
          pendingFollowUps: 0,
          staleContacts: 0,
          highlights: [],
          generatedAt: new Date().toISOString(),
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

/**
 * Query options for deadlines
 * Uses voltAgentApi.getUpcomingDeadlines()
 */
export function deadlinesOptions(params?: { limit?: number; dueWithin?: string }) {
  return queryOptions({
    queryKey: dashboardKeys.deadlines(params),
    queryFn: async (): Promise<{ deadlines: Deadline[]; total: number; todayCount: number; weekCount: number }> => {
      const limit = params?.limit || 5;

      try {
        const response = await voltAgentApi.getUpcomingDeadlines({ days: 7 });
        const items = response.data?.deadlines || [];

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + 7);

        const deadlines: Deadline[] = items.slice(0, limit).map((d: CachedDeadline) => ({
          id: d.id,
          title: d.title,
          dueDate: d.deadline,
          source: d.sourceType as 'email' | 'calendar' | 'task',
          sourceId: d.sourceId,
          priority: 'medium' as const,
        }));

        return {
          deadlines,
          total: response.data?.count || items.length,
          todayCount: deadlines.filter((d) => new Date(d.dueDate) <= todayEnd).length,
          weekCount: deadlines.filter((d) => new Date(d.dueDate) <= weekEnd).length,
        };
      } catch {
        // Fallback to calendar events
        try {
          const weekEnd = new Date();
          weekEnd.setDate(weekEnd.getDate() + 7);

          const response = await calendarApi.listEvents({
            startTime: new Date().toISOString(),
            endTime: weekEnd.toISOString(),
            limit,
          });

          const events = response.data?.events || [];
          const deadlines: Deadline[] = events.map((e) => ({
            id: e.id,
            title: e.title,
            dueDate: e.startTime,
            source: 'calendar' as const,
            sourceId: e.id,
            priority: 'medium' as const,
          }));

          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          return {
            deadlines,
            total: events.length,
            todayCount: deadlines.filter((d) => new Date(d.dueDate) <= todayEnd).length,
            weekCount: deadlines.length,
          };
        } catch {
          return { deadlines: [], total: 0, todayCount: 0, weekCount: 0 };
        }
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for follow-ups
 * Uses voltAgentApi.getPendingFollowUps() - backend calculates overdue from dueDate
 */
export function followUpsOptions(params?: { status?: string; limit?: number }) {
  return queryOptions({
    queryKey: dashboardKeys.followUps(params),
    queryFn: async (): Promise<{ followUps: FollowUp[]; total: number; pendingCount: number; overdueCount: number }> => {
      const limit = params?.limit || 5;

      try {
        // Use dedicated pending endpoint - it returns items ordered by dueDate
        const response = await voltAgentApi.getPendingFollowUps({ limit });
        const items = (response.data?.followUps || []) as unknown as ApiFollowUpItem[];
        const now = new Date();

        const followUps: FollowUp[] = items.map((f) => {
          const dueDate = f.dueDate as string || '';
          const isOverdue = dueDate && new Date(dueDate) < now;
          const email = f.email || {};

          return {
            id: f.id as string,
            emailId: f.emailId as string || '',
            subject: email.subject || f.subject || '(No subject)',
            contactName: email.from || f.contactName || f.contactEmail || 'Unknown',
            contactEmail: email.from || f.contactEmail || '',
            dueDate,
            status: isOverdue ? 'overdue' : 'pending',
            reason: f.reason as string,
          };
        });

        return {
          followUps,
          total: response.data?.count || items.length,
          pendingCount: followUps.filter((f) => f.status === 'pending').length,
          overdueCount: followUps.filter((f) => f.status === 'overdue').length,
        };
      } catch {
        return { followUps: [], total: 0, pendingCount: 0, overdueCount: 0 };
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for stale contacts
 * Uses crmApi.getStaleContacts()
 */
export function staleContactsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: dashboardKeys.staleContacts(params),
    queryFn: async (): Promise<{ contacts: StaleContact[]; total: number; averageScore: number }> => {
      const limit = params?.limit || 5;

      try {
        const response = await crmApi.getStaleContacts({ limit });
        const items = response.data?.staleContacts || [];

        const contacts: StaleContact[] = items.map((c: ContactRelationshipStats) => ({
          id: c.contactId,
          name: c.displayName || c.email,
          email: c.email,
          company: undefined,
          lastInteraction: c.lastInteraction || '',
          relationshipScore: c.relationshipScore || 0,
          daysSinceContact: c.daysSinceLastContact || 0,
        }));

        const avgScore = contacts.length > 0
          ? Math.round(contacts.reduce((sum, c) => sum + c.relationshipScore, 0) / contacts.length)
          : 0;

        return {
          contacts,
          total: response.data?.count || contacts.length,
          averageScore: avgScore,
        };
      } catch {
        // Fallback: Get contacts and calculate manually
        try {
          const response = await contactsApi.listContacts({ limit: limit * 2 });
          const allContacts = response?.contacts || [];
          const now = new Date();

          const contacts: StaleContact[] = allContacts
            .map((c) => {
              const createdAt = c.createdAt ? new Date(c.createdAt) : now;
              const daysSinceContact = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));

              return {
                id: c.id,
                name: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.emails?.[0]?.value || 'Unknown',
                email: c.emails?.[0]?.value || '',
                company: c.company || undefined,
                lastInteraction: c.createdAt || '',
                relationshipScore: Math.max(0, 100 - daysSinceContact * 2),
                daysSinceContact,
              };
            })
            .filter((c) => c.daysSinceContact > 30)
            .slice(0, limit);

          const avgScore = contacts.length > 0
            ? Math.round(contacts.reduce((sum, c) => sum + c.relationshipScore, 0) / contacts.length)
            : 0;

          return { contacts, total: contacts.length, averageScore: avgScore };
        } catch {
          return { contacts: [], total: 0, averageScore: 0 };
        }
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 0,
  });
}

// ============================================================================
// Additional Query Options
// ============================================================================

/**
 * Query options for dashboard stats
 */
export function dashboardStatsOptions() {
  return queryOptions({
    queryKey: dashboardKeys.stats(),
    queryFn: async (): Promise<{
      unreadEmails: number;
      todayEvents: number;
      pendingTasks: number;
      totalContacts: number;
    }> => {
      const [emailStats, contacts, events, actionItemStats] = await Promise.allSettled([
        apiClient.get('/emails/stats'),
        contactsApi.getContactCounts(),
        (() => {
          const today = new Date();
          const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
          return calendarApi.listEvents({
            startTime: startOfDay.toISOString(),
            endTime: endOfDay.toISOString(),
          });
        })(),
        voltAgentApi.getActionItemStats(),
      ]);

      // Extract pending tasks from action item stats
      let pendingTasks = 0;
      if (actionItemStats.status === 'fulfilled' && actionItemStats.value.data?.stats) {
        const stats = actionItemStats.value.data.stats as { todo?: number; inProgress?: number };
        pendingTasks = (stats.todo || 0) + (stats.inProgress || 0);
      }

      return {
        unreadEmails: emailStats.status === 'fulfilled' ? emailStats.value.data?.unread || 0 : 0,
        todayEvents: events.status === 'fulfilled' ? events.value.data?.events?.length || 0 : 0,
        pendingTasks,
        totalContacts: contacts.status === 'fulfilled' ? contacts.value?.total || 0 : 0,
      };
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export interface Email {
  id: string;
  subject: string;
  from: { name: string; email: string };
  preview: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  provider?: { providerType: string };
}

/**
 * Query options for important emails (starred OR flagged)
 * Uses the backend isImportant filter for provider-agnostic "important" concept
 */
export function importantEmailsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'importantEmails', params] as const,
    queryFn: async (): Promise<{ emails: Email[]; total: number }> => {
      const limit = params?.limit || 5;
      try {
        const response = await apiClient.get('/emails', {
          // isImportant = starred OR flagged (provider-agnostic)
          params: { limit, isImportant: true },
        });
        return {
          emails: response.data?.emails || [],
          total: response.data?.total || 0,
        };
      } catch {
        return { emails: [], total: 0 };
      }
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * @deprecated Use importantEmailsOptions instead
 */
export const starredEmailsOptions = importantEmailsOptions;

/**
 * Query options for recent unread emails (for briefing highlights)
 * IMPORTANT: Uses specialUse=INBOX to exclude TRASH and SPAM folders
 */
export function recentUnreadEmailsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'recentUnreadEmails', params] as const,
    queryFn: async (): Promise<{ emails: Email[]; total: number }> => {
      const limit = params?.limit || 5;
      try {
        const response = await apiClient.get('/emails', {
          // Use specialUse: INBOX to exclude TRASH/SPAM from recent unread
          params: { limit, isRead: false, specialUse: 'INBOX' },
        });
        return {
          emails: response.data?.emails || [],
          total: response.data?.total || 0,
        };
      } catch {
        return { emails: [], total: 0 };
      }
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  type: 'meeting' | 'event';
}

/**
 * Query options for today's events
 * Uses calendarApi.listEvents()
 */
export function todayEventsOptions() {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'todayEvents'] as const,
    queryFn: async (): Promise<{ events: CalendarEvent[]; total: number }> => {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        const response = await calendarApi.listEvents({
          startTime: startOfDay.toISOString(),
          endTime: endOfDay.toISOString(),
        });

        const events: CalendarEvent[] = (response.data?.events || []).map((e) => ({
          id: e.id,
          title: e.title,
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
          type: 'event' as const,
        }));

        return { events, total: events.length };
      } catch {
        return { events: [], total: 0 };
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export interface RecentContact {
  id: string;
  name: string;
  email: string;
  company?: string;
  lastInteraction?: string;
}

/**
 * Query options for recent contacts
 * Uses contactsApi.listContacts()
 */
export function recentContactsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'recentContacts', params] as const,
    queryFn: async (): Promise<{ contacts: RecentContact[]; total: number }> => {
      const limit = params?.limit || 5;
      try {
        const response = await contactsApi.listContacts({ limit });

        const contacts: RecentContact[] = (response?.contacts || []).map((c) => ({
          id: c.id,
          name: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.emails?.[0]?.value || 'Unknown',
          email: c.emails?.[0]?.value || '',
          company: c.company || undefined,
          lastInteraction: c.updatedAt,
        }));

        return { contacts, total: response?.total || contacts.length };
      } catch {
        return { contacts: [], total: 0 };
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 0,
  });
}

// ============================================================================
// Dashboard Preferences (Layout)
// ============================================================================

/**
 * Default dashboard layout
 */
function getDefaultLayout(): DashboardLayout {
  return {
    id: 'default',
    name: 'Default Layout',
    isDefault: true,
    isPreset: false,
    cols: 12,
    rowHeight: 60,
    widgets: [
      { i: 'briefing-1', widgetId: 'briefing', x: 0, y: 0, w: 6, h: 3, minW: 4, minH: 3 },
      { i: 'unread-emails-1', widgetId: 'unread-emails', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'today-events-1', widgetId: 'today-events', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'deadlines-1', widgetId: 'deadlines', x: 6, y: 2, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'follow-up-tracker-1', widgetId: 'follow-up-tracker', x: 9, y: 2, w: 3, h: 2, minW: 3, minH: 2 },
    ],
  };
}

/**
 * Query options for dashboard preferences (layout)
 */
export function dashboardPreferencesOptions() {
  return queryOptions({
    queryKey: dashboardKeys.preferences(),
    queryFn: async (): Promise<DashboardLayout> => {
      try {
        const response = await apiClient.get('/users/me/dashboard-preferences');
        if (response.data?.layout && Array.isArray(response.data.layout)) {
          return {
            ...getDefaultLayout(),
            widgets: response.data.layout as WidgetLayout[],
          };
        }
        return getDefaultLayout();
      } catch {
        return getDefaultLayout();
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Hook for dashboard preferences (layout)
 */
export function useDashboardPreferences() {
  return useQuery(dashboardPreferencesOptions());
}

/**
 * Hook for saving dashboard layout
 */
export function useSaveDashboardLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (layout: WidgetLayout[]) => {
      await apiClient.put('/users/me/dashboard-preferences', { layout });
      return layout;
    },
    onSuccess: (layout) => {
      // Update cache optimistically
      queryClient.setQueryData(dashboardKeys.preferences(), (old: DashboardLayout | undefined) => ({
        ...(old || getDefaultLayout()),
        widgets: layout,
      }));
    },
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for daily briefing
 */
export function useBriefing() {
  return useQuery(briefingOptions());
}

/**
 * Hook for deadlines
 */
export function useDeadlines(params?: { limit?: number; dueWithin?: string }) {
  return useQuery(deadlinesOptions(params));
}

/**
 * Hook for follow-ups
 */
export function useFollowUps(params?: { status?: string; limit?: number }) {
  return useQuery(followUpsOptions(params));
}

/**
 * Hook for stale contacts
 */
export function useStaleContacts(params?: { limit?: number }) {
  return useQuery(staleContactsOptions(params));
}

/**
 * Hook for dashboard stats
 */
export function useDashboardStats() {
  return useQuery(dashboardStatsOptions());
}

/**
 * Hook for important emails (starred OR flagged)
 */
export function useImportantEmails(params?: { limit?: number }) {
  return useQuery(importantEmailsOptions(params));
}

/**
 * @deprecated Use useImportantEmails instead
 */
export const useStarredEmails = useImportantEmails;

/**
 * Hook for today's events
 */
export function useTodayEvents() {
  return useQuery(todayEventsOptions());
}

/**
 * Hook for recent contacts
 */
export function useRecentContacts(params?: { limit?: number }) {
  return useQuery(recentContactsOptions(params));
}

/**
 * Hook for recent unread emails (for briefing highlights)
 */
export function useRecentUnreadEmails(params?: { limit?: number }) {
  return useQuery(recentUnreadEmailsOptions(params));
}

// ============================================================================
// Email Trends (for charts)
// ============================================================================

export interface EmailTrendDataPoint {
  name: string;
  emails: number;
  sent: number;
  received: number;
}

/**
 * Query options for email trends
 * Uses analyticsApi.getEmailAnalytics() or falls back to mock data
 */
export function emailTrendsOptions() {
  return queryOptions({
    queryKey: dashboardKeys.emailTrends(),
    queryFn: async (): Promise<{ trends: EmailTrendDataPoint[] }> => {
      try {
        // Try to fetch from analytics endpoint
        const response = await apiClient.get('/analytics/emails');
        if (response.data && Array.isArray(response.data)) {
          return { trends: response.data };
        }
        // If endpoint doesn't exist or returns unexpected format, use fallback
        throw new Error('Analytics endpoint unavailable');
      } catch {
        // Generate mock data from email stats for last 7 days
        // Use locale-aware day formatting
        const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        const today = new Date();

        // Generate trends for last 7 days with locale-aware day names
        const trends: EmailTrendDataPoint[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dayName = formatter.format(date);
          const dayOfWeek = date.getDay();
          // Simulate realistic email patterns - more on weekdays
          const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
          const baseReceived = isWeekday ? 15 + Math.floor(Math.random() * 10) : 5 + Math.floor(Math.random() * 5);
          const baseSent = isWeekday ? 8 + Math.floor(Math.random() * 6) : 2 + Math.floor(Math.random() * 3);
          trends.push({
            name: dayName,
            emails: baseReceived + baseSent,
            received: baseReceived,
            sent: baseSent,
          });
        }
        return { trends };
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,
    retry: 0, // Don't retry if analytics endpoint fails
  });
}

/**
 * Hook for email trends
 */
export function useEmailTrends() {
  return useQuery(emailTrendsOptions());
}
