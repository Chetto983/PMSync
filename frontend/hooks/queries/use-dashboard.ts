/**
 * TanStack Query hooks for dashboard-adjacent data
 *
 * Phase 145 Plan 03 cleanup: legacy widget-only hooks removed (briefing, deadlines,
 * todayEvents, recentUnreadEmails, importantEmails, triagedEmails, dashboard preferences).
 * The /dashboard page is now served by `<TodayDashboard />` and consumes `useTodayFeed`
 * from `frontend/hooks/queries/use-today.ts`. The remaining exports are the ones still
 * imported by non-widget surfaces (analytics page, contacts page, etc.).
 *
 * Best practices implemented:
 * - Uses existing API modules (aiChatApi, crmApi, contactsApi, calendarApi)
 * - queryOptions for type-safe, reusable query configurations
 * - Proper staleTime and gcTime for optimal caching
 * - Errors propagate to TanStack Query for explicit UI error states (Phase 33)
 */

import { useMemo } from 'react';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { dashboardKeys } from './dashboard-keys';
import { aiChatApi } from '@/lib/api/ai';
import { crmApi, type ContactRelationshipStats } from '@/lib/api/crm';
import { contactsApi } from '@/lib/api/contacts';
import { apiClient } from '@/lib/api-client';
import { useConsent } from './use-consent';
import { useLocale } from '@/lib/hooks/use-locale';

// ============================================================================
// Types
// ============================================================================

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
  previousFrequency?: string;
  suggestedAction?: string;
  trend?: 'increasing' | 'stable' | 'decreasing';
  totalInteractions?: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Query options for follow-ups
 * Uses aiChatApi.getPendingFollowUps() - backend calculates overdue from dueDate
 */
export function followUpsOptions(params?: { status?: string; limit?: number }) {
  return queryOptions({
    queryKey: dashboardKeys.followUps(params),
    queryFn: async (): Promise<{ followUps: FollowUp[]; total: number; pendingCount: number; overdueCount: number }> => {
      const limit = params?.limit || 5;

      // Use dedicated pending endpoint - it returns items ordered by dueDate
      const response = await aiChatApi.getPendingFollowUps({ limit });
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
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Query options for stale contacts
 * Uses crmApi.getStaleContacts()
 *
 * Kept after Phase 145 Plan 03 cleanup: still consumed by
 * `frontend/components/dashboard/contacts-page/useContactsPageData.ts`.
 */
export function staleContactsOptions(params?: { limit?: number; days?: number }) {
  return queryOptions({
    queryKey: dashboardKeys.staleContacts(params),
    queryFn: async (): Promise<{ contacts: StaleContact[]; total: number; averageScore: number }> => {
      const limit = params?.limit || 5;
      const days = params?.days;

      const response = await crmApi.getStaleContacts({ limit, days });
      const items = response.data?.staleContacts || [];

      const contacts: StaleContact[] = items.map((c: ContactRelationshipStats) => ({
        id: c.contactId,
        name: c.displayName || c.email || 'Unknown',
        email: c.email || '',
        company: undefined,
        lastInteraction: c.lastInteraction || '',
        relationshipScore: c.relationshipScore || 0,
        daysSinceContact: c.daysSinceLastContact || 0,
        previousFrequency: c.previousFrequency,
        suggestedAction: c.suggestedAction,
        trend: c.trend,
        totalInteractions: c.totalInteractions,
      }));

      const avgScore = contacts.length > 0
        ? Math.round(contacts.reduce((sum, c) => sum + c.relationshipScore, 0) / contacts.length)
        : 0;

      return {
        contacts,
        total: response.data?.count || contacts.length,
        averageScore: avgScore,
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
      const response = await contactsApi.listContacts({ limit });

      const contacts: RecentContact[] = (response?.contacts || []).map((c) => ({
        id: c.id,
        name: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.emails?.[0]?.value || 'Unknown',
        email: c.emails?.[0]?.value || '',
        company: c.company || undefined,
        lastInteraction: c.updatedAt,
      }));

      return { contacts, total: response?.total || contacts.length };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 0,
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for follow-ups
 */
export function useFollowUps(params?: { status?: string; limit?: number }) {
  return useQuery(followUpsOptions(params));
}

/**
 * Hook for stale contacts
 *
 * Kept after Phase 145 Plan 03 cleanup: still consumed by
 * `frontend/components/dashboard/contacts-page/useContactsPageData.ts`.
 */
export function useStaleContacts(params?: { limit?: number; days?: number }) {
  return useQuery(staleContactsOptions(params));
}

/**
 * Hook for recent contacts
 */
export function useRecentContacts(params?: { limit?: number }) {
  return useQuery(recentContactsOptions(params));
}

// ============================================================================
// Email Trends (for charts)
// ============================================================================

export interface EmailTrendDataPoint {
  date?: string;
  name: string;
  emails: number;
  sent: number;
  received: number;
}

/**
 * Query options for email trends
 * Uses the AI analytics endpoint for email volume data
 *
 * Kept after Phase 145 Plan 03 cleanup: still consumed by
 * `frontend/components/dashboard/AnalyticsChart.tsx` (analytics page).
 */
export function emailTrendsOptions(enabled: boolean = true) {
  return queryOptions({
    queryKey: dashboardKeys.emailTrends(),
    queryFn: async (): Promise<{ trends: EmailTrendDataPoint[] }> => {
      const response = await apiClient.get('/ai/analytics/email');
      // Backend returns { success, analytics } with volumeTrends array
      const analytics = response.data?.analytics;
      if (analytics?.volumeTrends && Array.isArray(analytics.volumeTrends)) {
        const trends = analytics.volumeTrends.map((item: Record<string, unknown>) => ({
          date: item.date as string | undefined,
          name: (item.name as string) || '',
          emails: (item.emails as number) || 0,
          sent: (item.sent as number) || 0,
          received: (item.received as number) || 0,
        }));
        return { trends };
      }
      // Endpoint returned unexpected format -- treat as error
      throw new Error('Analytics endpoint returned unexpected format');
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled,
  });
}

/**
 * Hook for email trends
 *
 * Kept after Phase 145 Plan 03 cleanup: still consumed by
 * `frontend/components/dashboard/AnalyticsChart.tsx` (analytics page).
 */
export function useEmailTrends() {
  const { locale } = useLocale();
  const { data: consentList } = useConsent();
  const hasEmailAnalyticsConsent =
    consentList?.some((c) => c.feature === 'email_analytics' && c.granted) ?? false;
  const query = useQuery(emailTrendsOptions(hasEmailAnalyticsConsent));

  const data = useMemo(() => {
    if (!query.data) {
      return query.data;
    }

    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });

    return {
      trends: query.data.trends.map((trend) => ({
        ...trend,
        name: trend.date
          ? formatter.format(new Date(`${trend.date}T00:00:00`))
          : trend.name,
      })),
    };
  }, [locale, query.data]);

  return {
    ...query,
    data,
  };
}
