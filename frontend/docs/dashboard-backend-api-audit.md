# Dashboard Backend API Audit

## Executive Summary

This audit documents all backend APIs available for the main dashboard. The VoltAgent controller (`backend/src/modules/ai/voltagent/voltagent.controller.ts`) exposes 70+ endpoints covering AI briefing, deadlines, follow-ups, action items, CRM intelligence, calendar scheduling, and analytics.

**Current State**: Frontend TanStack Query hooks in `frontend/hooks/queries/use-dashboard.ts` properly consume these APIs.

**Key Finding**: The backend is comprehensive. The dashboard redesign should leverage ALL available data, not just a subset.

---

## Backend API Endpoints for Dashboard

### 1. Daily Briefing (Core Dashboard Widget)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/briefing` | GET | Get enhanced daily briefing |
| `/api/v1/voltagent/briefing/refresh` | POST | Force regenerate briefing |
| `/api/v1/voltagent/briefing/status` | GET | Get briefing service status |

**Response Structure**:
```typescript
{
  summary: string;           // AI-generated daily summary
  urgentEmails: number;      // Count of urgent emails
  deadlinesToday: number;    // Deadlines due today
  pendingFollowUps: number;  // Pending follow-up count
  staleContacts: number;     // Contacts needing reconnection
  highlights: string[];      // Key highlights array
  generatedAt: string;       // ISO timestamp
}
```

**Frontend Hook**: `useBriefing()` in `use-dashboard.ts`

---

### 2. Deadlines (AI-Extracted from Emails)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/deadlines` | GET | Get upcoming deadlines (query: `days`) |
| `/api/v1/voltagent/deadlines/stats` | GET | Get deadline statistics |
| `/api/v1/voltagent/deadlines/:id/complete` | POST | Mark deadline completed |
| `/api/v1/voltagent/deadlines/:id/dismiss` | POST | Dismiss a deadline |
| `/api/v1/voltagent/deadlines/extract` | POST | Extract deadlines from text |

**Response Structure**:
```typescript
{
  id: string;
  title: string;
  description?: string;
  deadline: string;        // ISO date
  sourceType: string;      // 'email' | 'calendar' | 'task'
  sourceId?: string;
  status: string;
  confidence?: number;
  remindBefore: number[];
  createdAt: string;
}
```

**Stats Response**:
```typescript
{
  upcoming: number;
  dueSoon: number;
  overdue: number;
  completed: number;
}
```

**Frontend Hook**: `useDeadlines()` in `use-dashboard.ts`

---

### 3. Follow-Ups (Email Response Tracking)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/follow-ups` | GET | List follow-ups (query: status, limit, offset) |
| `/api/v1/voltagent/follow-ups/pending` | GET | Get pending follow-ups (cached, fast) |
| `/api/v1/voltagent/follow-ups/overdue` | GET | Get overdue follow-ups |
| `/api/v1/voltagent/follow-ups/stats` | GET | Get follow-up statistics |
| `/api/v1/voltagent/follow-ups` | POST | Create a follow-up |
| `/api/v1/voltagent/follow-ups/:id/resolve` | POST | Resolve a follow-up |
| `/api/v1/voltagent/follow-ups/:id/snooze` | POST | Snooze a follow-up |

**Response Structure**:
```typescript
{
  id: string;
  emailId: string;
  subject: string;
  contactName: string;
  contactEmail: string;
  dueDate: string;
  status: 'PENDING' | 'REMINDED' | 'RESOLVED' | 'EXPIRED';
  reason?: string;
}
```

**Frontend Hook**: `useFollowUps()` in `use-dashboard.ts`

---

### 4. Action Items (AI-Extracted Tasks)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/action-items` | GET | List action items |
| `/api/v1/voltagent/action-items/pending` | GET | Get pending (cached) |
| `/api/v1/voltagent/action-items/overdue` | GET | Get overdue |
| `/api/v1/voltagent/action-items/stats` | GET | Get statistics |
| `/api/v1/voltagent/action-items` | POST | Create action item |
| `/api/v1/voltagent/action-items/:id/status` | POST | Update status |
| `/api/v1/voltagent/action-items/:id/priority` | POST | Update priority |
| `/api/v1/voltagent/action-items/extract` | POST | AI extraction from email |

**Stats Response**:
```typescript
{
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  highPriority: number;
}
```

**Frontend Hook**: `useDashboardStats()` includes pending tasks count

---

### 5. CRM Intelligence (Relationship Tracking)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/crm/stale-contacts` | GET | Contacts with no recent interaction |
| `/api/v1/voltagent/crm/reconnect` | GET | Contacts needing reconnection |
| `/api/v1/voltagent/crm/top-contacts` | GET | Top contacts by relationship score |
| `/api/v1/voltagent/crm/contacts/:id` | GET | Single contact stats |
| `/api/v1/voltagent/crm/contacts/:id/interactions` | GET | Interaction history |
| `/api/v1/voltagent/crm/contacts/:id/graph` | GET | Relationship graph |

**Relationship Score Components**:
- Recency (40%)
- Frequency (30%)
- Reciprocity (20%)
- Trend (10%)

**Frontend Hook**: `useStaleContacts()` in `use-dashboard.ts`

---

### 6. Calendar & Scheduling

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/scheduling/conflicts` | POST | Detect calendar conflicts |
| `/api/v1/voltagent/scheduling/available-slots` | GET | Find available slots |
| `/api/v1/voltagent/scheduling/day-load` | GET | Day busy percentage |
| `/api/v1/voltagent/scheduling/focus-time/optimal` | GET | Optimal focus time slots |
| `/api/v1/voltagent/scheduling/focus-time/stats` | GET | Focus time statistics |
| `/api/v1/voltagent/scheduling/meeting-prep/:eventId` | GET | Meeting preparation brief |
| `/api/v1/voltagent/scheduling/meeting-prep` | GET | Upcoming meetings needing prep |

**Frontend Hook**: `useTodayEvents()` uses calendar API directly

---

### 7. Analytics (Dashboard Insights)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/analytics/dashboard` | GET | Dashboard analytics |
| `/api/v1/voltagent/analytics/email` | GET | Email analytics (day/week/month) |
| `/api/v1/voltagent/analytics/ai` | POST | AI-powered custom analytics |
| `/api/v1/voltagent/analytics/status` | GET | Analytics service status |

**Dashboard Analytics Response**:
```typescript
{
  emailSummary: { total, unread, sentToday, receivedToday };
  volumeTrends: Array<{ date, sent, received }>;
  topSenders: Array<{ email, name, count }>;
  hourlyDistribution: Array<{ hour, count }>;
  insights: string[];  // AI-generated insights
}
```

---

### 8. Pending Actions (HITL Approval)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/actions/pending` | GET | Get pending approval actions |
| `/api/v1/voltagent/actions/:id` | GET | Get specific pending action |
| `/api/v1/voltagent/actions/:id/approve` | POST | Approve action |
| `/api/v1/voltagent/actions/:id/reject` | POST | Reject action |
| `/api/v1/voltagent/stats/action-counts` | GET | Action counts by status |

---

### 9. Memory (Long-Term AI Memory)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/voltagent/memory` | GET | List memories |
| `/api/v1/voltagent/memory/search` | GET | Search memories |
| `/api/v1/voltagent/memory/stats` | GET | Memory statistics |
| `/api/v1/voltagent/knowledge/search` | POST | Unified knowledge search |
| `/api/v1/voltagent/knowledge/stats` | GET | Knowledge base stats |

---

## Frontend Query Hooks (Already Implemented)

| Hook | API Used | Caching |
|------|----------|---------|
| `useBriefing()` | `voltAgentApi.getBriefing()` | 5 min stale, 30 min gc |
| `useDeadlines()` | `voltAgentApi.getUpcomingDeadlines()` | 2 min stale, 10 min gc |
| `useFollowUps()` | `voltAgentApi.getPendingFollowUps()` | 2 min stale, 10 min gc |
| `useStaleContacts()` | `crmApi.getStaleContacts()` | 5 min stale, 30 min gc |
| `useDashboardStats()` | Multiple endpoints combined | 1 min stale, 5 min gc |
| `useTodayEvents()` | `calendarApi.listEvents()` | 2 min stale, 10 min gc |
| `useRecentUnreadEmails()` | `apiClient.get('/emails')` | 1 min stale, 5 min gc |
| `useImportantEmails()` | `apiClient.get('/emails')` | 1 min stale, 5 min gc |
| `useRecentContacts()` | `contactsApi.listContacts()` | 2 min stale, 10 min gc |
| `useDashboardPreferences()` | User preferences API | 5 min stale, 30 min gc |

---

## Recommended Dashboard Widgets

Based on backend capabilities, the dashboard should include these widgets:

### Must-Have Widgets (P0)
1. **Daily Briefing** - AI summary of the day
2. **Unread Emails** - Quick inbox overview
3. **Today's Events** - Calendar at a glance
4. **Deadlines** - AI-extracted deadline tracking
5. **Follow-Ups** - Email response tracking

### Should-Have Widgets (P1)
6. **Action Items** - Task management from emails
7. **Stale Contacts** - CRM relationship alerts
8. **Focus Time** - Optimal focus slots
9. **Meeting Prep** - Upcoming meeting briefs

### Nice-to-Have Widgets (P2)
10. **Email Analytics** - Volume trends
11. **Top Contacts** - Relationship insights
12. **Pending Approvals** - AI action approvals

---

## Issues Found

### 1. Hardcoded Strings (Missing i18n)
- `UnreadEmailsWidget.tsx`: "Unread Emails", "(No subject)", "All caught up!"
- `DeadlinesWidget.tsx`: "Deadlines", "X today", "No upcoming deadlines"
- `TodayEventsWidget.tsx`: "Today's Events", "No events scheduled"
- `FollowUpWidget.tsx`: "Follow-ups", "X overdue", "No pending follow-ups"
- `BaseWidget.tsx`: "Refresh widget", "No items"

### 2. Missing API Integration
- Analytics endpoints not used in dashboard
- Focus time endpoints not exposed
- Meeting prep endpoints not exposed
- Knowledge stats endpoint not used

### 3. Widget Improvements Needed
- All widgets should use proper translations
- Loading/error/empty states need standardization
- Icons should be consistent across widgets

---

## Next Steps

1. **Fix translations** - Add all hardcoded strings to locale files
2. **Standardize widgets** - Use BaseWidget pattern consistently
3. **Add missing widgets** - Analytics, Focus Time, Meeting Prep
4. **Improve data display** - Show more relevant data from each API
5. **Layout optimization** - CSS Grid with proper breakpoints
