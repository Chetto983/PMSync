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

/**
 * 4-stream action-driven taxonomy (Phase 145.1 Plan 01 backend contract).
 * Precedence: replies-needed > due-today > waiting-on-others > fyi.
 */
export type TodayStream =
  | 'replies-needed'
  | 'due-today'
  | 'waiting-on-others'
  | 'fyi';

export interface TodayFeedItem {
  id: string;
  type: TodayItemType;
  stream: TodayStream;
  score: number;
  title: string;
  subtitle: string | null;
  /** Backend-computed click-through URL (fixes WR-06 — frontend renders plain <a href>). */
  routeUrl: string;
  /** Deterministic 1-line reason (no LLM). Null when no signal is present. */
  rationale: string | null;
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

/**
 * KPI chip counts driving the header chip strip (D-04).
 */
export interface TodayFeedKpiCounts {
  inbox: number;
  calendar: number;
  deals: number;
  tasks: number;
}

export interface TodayFeedCounts {
  repliesNeeded: number;
  dueToday: number;
  waitingOnOthers: number;
  fyi: number;
  total: number;
  kpi: TodayFeedKpiCounts;
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
