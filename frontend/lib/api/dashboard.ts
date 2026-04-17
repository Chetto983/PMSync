/**
 * Dashboard API module
 *
 * Backend: DashboardModule > DashboardController
 * Endpoints: /api/v1/dashboard/today
 *
 * Mirrors the TodayFeedResponseDto shape from backend/src/modules/dashboard/dto/today-feed.dto.ts
 * (produced by Phase 145 Plan 01).
 */
import { apiClient } from '../api-client';

// ---- Types (mirror backend DTOs exactly) ----

export type TodayItemType = 'email' | 'task' | 'deal' | 'event';
export type TodayTier = 'urgent' | 'today' | 'fyi';

export interface TodayFeedItem {
  id: string;
  type: TodayItemType;
  tier: TodayTier;
  score: number;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  isOverdue: boolean;
  emailId: string | null;
  threadId: string | null;
  taskSourceType: string | null;
  taskSourceId: string | null;
  dealId: string | null;
  eventId: string | null;
  canComplete: boolean;
  canDismiss: boolean;
  canSnooze: boolean;
}

export interface TodayFeedCounts {
  urgent: number;
  today: number;
  fyi: number;
  total: number;
}

export interface TodayFeedResponse {
  items: TodayFeedItem[];
  counts: TodayFeedCounts;
  greeting: string | null;
  generatedAt: string;
}

export interface GetTodayFeedQuery {
  locale?: string;
  tz?: string;
  includeGreeting?: boolean;
}

// ---- API ----

export const dashboardApi = {
  getTodayFeed(query?: GetTodayFeedQuery) {
    return apiClient.get<TodayFeedResponse>('/dashboard/today', { params: query });
  },
};
