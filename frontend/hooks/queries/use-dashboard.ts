/**
 * TanStack Query hooks for dashboard widgets
 *
 * Best practices implemented:
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Error handling with retry configuration
 * - Graceful fallbacks when APIs don't exist
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { dashboardKeys } from './dashboard-keys';

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
 */
export function briefingOptions() {
  return queryOptions({
    queryKey: dashboardKeys.briefing(),
    queryFn: async (): Promise<BriefingData> => {
      try {
        // Try AI briefing endpoint first
        const response = await apiClient.get('/api/v1/voltagent/briefing');
        return response.data;
      } catch {
        // Fallback: aggregate stats manually
        const [emailStats, deadlines, followUps, contacts] = await Promise.allSettled([
          apiClient.get('/emails/stats'),
          apiClient.get('/api/v1/voltagent/deadlines', { params: { limit: 5, dueWithin: '24h' } }),
          apiClient.get('/api/v1/voltagent/followups', { params: { status: 'pending', limit: 5 } }),
          apiClient.get('/contacts', { params: { filter: 'stale', limit: 5 } }),
        ]);

        const urgentEmails = emailStats.status === 'fulfilled' ? emailStats.value.data?.unread || 0 : 0;
        const deadlinesToday = deadlines.status === 'fulfilled' ? deadlines.value.data?.total || 0 : 0;
        const pendingFollowUps = followUps.status === 'fulfilled' ? followUps.value.data?.total || 0 : 0;
        const staleContacts = contacts.status === 'fulfilled' ? contacts.value.data?.total || 0 : 0;

        return {
          summary: '',
          urgentEmails,
          deadlinesToday,
          pendingFollowUps,
          staleContacts,
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
 */
export function deadlinesOptions(params?: { limit?: number; dueWithin?: string }) {
  return queryOptions({
    queryKey: dashboardKeys.deadlines(params),
    queryFn: async (): Promise<{ deadlines: Deadline[]; total: number; todayCount: number; weekCount: number }> => {
      const limit = params?.limit || 5;

      try {
        // Try VoltAgent deadlines endpoint
        const response = await apiClient.get('/api/v1/voltagent/deadlines', {
          params: { limit, includeOverdue: true, dueWithin: params?.dueWithin },
        });

        if (response.data?.deadlines) {
          const items = response.data.deadlines;
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          const weekEnd = new Date();
          weekEnd.setDate(weekEnd.getDate() + 7);

          return {
            deadlines: items,
            total: response.data.total || items.length,
            todayCount: items.filter((d: Deadline) => new Date(d.dueDate) <= todayEnd).length,
            weekCount: items.filter((d: Deadline) => new Date(d.dueDate) <= weekEnd).length,
          };
        }
      } catch {
        // Fallback to calendar events
      }

      // Fallback: calendar events
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);

      const response = await apiClient.get('/calendar/events', {
        params: {
          startTime: new Date().toISOString(),
          endTime: weekEnd.toISOString(),
          limit,
        },
      });

      const events = response.data?.events || [];
      const items: Deadline[] = events.map((e: Record<string, unknown>) => ({
        id: e.id as string,
        title: (e.title || e.summary) as string,
        dueDate: (e.startTime || e.start) as string,
        source: 'calendar' as const,
        sourceId: e.id as string,
        priority: 'medium' as const,
      }));

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      return {
        deadlines: items.slice(0, limit),
        total: items.length,
        todayCount: items.filter((d) => new Date(d.dueDate) <= todayEnd).length,
        weekCount: items.length,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for follow-ups
 */
export function followUpsOptions(params?: { status?: string; limit?: number }) {
  return queryOptions({
    queryKey: dashboardKeys.followUps(params),
    queryFn: async (): Promise<{ followUps: FollowUp[]; total: number; pendingCount: number; overdueCount: number }> => {
      const limit = params?.limit || 5;
      const status = params?.status || 'pending,overdue';

      try {
        // Try VoltAgent follow-ups endpoint
        const response = await apiClient.get('/api/v1/voltagent/followups', {
          params: { status, limit },
        });

        if (response.data?.followUps) {
          const items = response.data.followUps;
          return {
            followUps: items,
            total: response.data.total || items.length,
            pendingCount: items.filter((f: FollowUp) => f.status === 'pending').length,
            overdueCount: items.filter((f: FollowUp) => f.status === 'overdue').length,
          };
        }
      } catch {
        // Fallback to emails needing follow-up
      }

      // Fallback: emails marked as needing follow-up
      const response = await apiClient.get('/emails', {
        params: { limit, needsFollowUp: true },
      });

      const emails = response.data?.emails || [];
      const items: FollowUp[] = emails.map((e: Record<string, unknown>) => {
        const from = e.from as { name?: string; email?: string } | string;
        return {
          id: `followup-${e.id}`,
          emailId: e.id as string,
          subject: (e.subject as string) || '(No subject)',
          contactName: typeof from === 'object' ? from.name || from.email || 'Unknown' : from,
          contactEmail: typeof from === 'object' ? from.email || '' : from,
          dueDate: e.date as string,
          status: 'pending' as const,
          reason: 'No response yet',
        };
      });

      return {
        followUps: items,
        total: items.length,
        pendingCount: items.length,
        overdueCount: 0,
      };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for stale contacts
 */
export function staleContactsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: dashboardKeys.staleContacts(params),
    queryFn: async (): Promise<{ contacts: StaleContact[]; total: number; averageScore: number }> => {
      const limit = params?.limit || 5;

      try {
        // Try CRM stale contacts endpoint
        const response = await apiClient.get('/api/v1/crm/stale-contacts', {
          params: { limit },
        });

        if (response.data?.contacts) {
          const items = response.data.contacts;
          const avgScore = items.length > 0
            ? Math.round(items.reduce((sum: number, c: StaleContact) => sum + c.relationshipScore, 0) / items.length)
            : 0;

          return {
            contacts: items,
            total: response.data.total || items.length,
            averageScore: avgScore,
          };
        }
      } catch {
        // Fallback to contacts sorted by last interaction
      }

      // Fallback: Get contacts and calculate staleness
      const response = await apiClient.get('/contacts', {
        params: {
          limit: limit * 2,
          sortBy: 'lastInteraction',
          sortOrder: 'asc',
        },
      });

      const allContacts = response.data?.contacts || [];
      const now = new Date();

      const items: StaleContact[] = allContacts
        .map((c: Record<string, unknown>) => {
          const lastInteraction = c.lastInteraction
            ? new Date(c.lastInteraction as string)
            : new Date(c.createdAt as string || now);
          const daysSinceContact = Math.floor((now.getTime() - lastInteraction.getTime()) / (24 * 60 * 60 * 1000));

          return {
            id: c.id as string,
            name: (c.firstName && c.lastName)
              ? `${c.firstName} ${c.lastName}`
              : (c.name as string) || (c.email as string),
            email: c.email as string,
            company: c.company as string | undefined,
            lastInteraction: lastInteraction.toISOString(),
            relationshipScore: Math.max(0, 100 - daysSinceContact * 2),
            daysSinceContact,
          };
        })
        .filter((c: StaleContact) => c.daysSinceContact > 30)
        .slice(0, limit);

      const avgScore = items.length > 0
        ? Math.round(items.reduce((sum, c) => sum + c.relationshipScore, 0) / items.length)
        : 0;

      return {
        contacts: items,
        total: items.length,
        averageScore: avgScore,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - contacts don't change often
    gcTime: 30 * 60 * 1000,
    retry: 1,
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
      const [emailStats, contacts, events] = await Promise.allSettled([
        apiClient.get('/emails/stats'),
        apiClient.get('/contacts', { params: { limit: 1 } }),
        (() => {
          const today = new Date();
          const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
          return apiClient.get('/calendar/events', {
            params: {
              startTime: startOfDay.toISOString(),
              endTime: endOfDay.toISOString(),
            },
          });
        })(),
      ]);

      return {
        unreadEmails: emailStats.status === 'fulfilled' ? emailStats.value.data?.unread || 0 : 0,
        todayEvents: events.status === 'fulfilled' ? events.value.data?.events?.length || 0 : 0,
        pendingTasks: 0, // Phase 5
        totalContacts: contacts.status === 'fulfilled' ? contacts.value.data?.total || 0 : 0,
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
 * Query options for starred emails (priority inbox)
 */
export function starredEmailsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'starredEmails', params] as const,
    queryFn: async (): Promise<{ emails: Email[]; total: number }> => {
      const limit = params?.limit || 5;
      const response = await apiClient.get('/emails', {
        params: { limit, isStarred: true },
      });
      return {
        emails: response.data?.emails || [],
        total: response.data?.total || 0,
      };
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
 */
export function todayEventsOptions() {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'todayEvents'] as const,
    queryFn: async (): Promise<{ events: CalendarEvent[]; total: number }> => {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const response = await apiClient.get('/calendar/events', {
        params: {
          startTime: startOfDay.toISOString(),
          endTime: endOfDay.toISOString(),
        },
      });

      const events: CalendarEvent[] = (response.data?.events || []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        title: (e.title || e.summary) as string,
        startTime: (e.startTime || e.start) as string,
        endTime: (e.endTime || e.end) as string | undefined,
        location: e.location as string | undefined,
        type: (e.type as 'meeting' | 'event') || 'event',
      }));

      return { events, total: events.length };
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
 */
export function recentContactsOptions(params?: { limit?: number }) {
  return queryOptions({
    queryKey: [...dashboardKeys.all, 'recentContacts', params] as const,
    queryFn: async (): Promise<{ contacts: RecentContact[]; total: number }> => {
      const limit = params?.limit || 5;
      const response = await apiClient.get('/contacts', {
        params: { limit, sortBy: 'lastInteraction', sortOrder: 'desc' },
      });

      const contacts: RecentContact[] = (response.data?.contacts || []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        name: (c.firstName && c.lastName)
          ? `${c.firstName} ${c.lastName}`
          : (c.name as string) || (c.email as string),
        email: c.email as string,
        company: c.company as string | undefined,
        lastInteraction: c.lastInteraction as string | undefined,
      }));

      return { contacts, total: response.data?.total || contacts.length };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
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
 * Hook for starred emails
 */
export function useStarredEmails(params?: { limit?: number }) {
  return useQuery(starredEmailsOptions(params));
}

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
