---
phase: 88-reminder-and-follows-ups-fix
verified: 2026-03-19T17:00:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Open dashboard, toggle a widget off (via Customize drawer), reload the page, confirm the widget is still hidden"
    expected: "Widget hidden state persists across reloads — loaded from backend preferences, not lost on navigation"
    why_human: "Cannot execute browser session programmatically; requires live app interaction to verify API round-trip"
  - test: "Click a follow-up snooze button, pick '1 hour', confirm the follow-up disappears or updates in the list"
    expected: "PATCH /ai/follow-ups/:id/snooze is called and the item refreshes — no silent no-op"
    why_human: "Requires live API call with valid session token; network tab verification needed"
  - test: "Click an insight card with an action (e.g., urgent emails), confirm browser URL changes without full page reload"
    expected: "Client-side navigation — no white flash, no full HTTP request in Network tab for the new page"
    why_human: "router.push() vs anchor-tag behavior is only distinguishable in a running browser"
  - test: "In ReminderCreateDialog, submit with backend unavailable (or intentionally broken payload), confirm red Alert appears"
    expected: "MUI Alert with error message visible below the text field"
    why_human: "isError state requires a real mutation failure to trigger"
  - test: "Refresh any widget via the refresh icon, observe the icon while loading is in progress"
    expected: "The RefreshCw icon spins smoothly; no Tailwind class applied"
    why_human: "CSS animation playback requires visual inspection in a running browser"
---

# Phase 88: Reminder and Follow-ups Fix — Verification Report

**Phase Goal:** Fix 7 dashboard/reminder bugs: snooze mutation, widget persistence, dead code, stale contacts widget, refresh animation, insight navigation, error feedback.
**Verified:** 2026-03-19
**Status:** human_needed — all automated checks pass; 5 items need live browser verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Snooze button calls real backend PATCH `/ai/follow-ups/:id/snooze` endpoint | VERIFIED | `FollowUpWidget.tsx:31` — `const snoozeMutation = useSnoozeFollowUp()`. No stub object. `snoozeMutation.mutateAsync` called on line 62 with `{ id, dueDate }`. |
| 2 | Dashboard widget visibility persists via backend preferences API | VERIFIED | `DashboardContainer.tsx:42-43` — `useDashboardPreferences()` + `useSaveDashboardLayout()` imported and wired. `visibleWidgets` is a `useMemo` derived from `preferences.widgets`. `handleToggleWidget` and `handleResetWidgets` both call `saveMutation.mutate(buildLayout(...))`. No `useState` for visibility. |
| 3 | Dead code `DashboardGrid.tsx` removed | VERIFIED | File does not exist on disk. Grep across frontend returns zero matches for `DashboardGrid`. |
| 4 | Stale contacts widget renders names, last interaction times, reconnect actions | VERIFIED | `StaleContactsWidget.tsx` — `useStaleContacts({ limit: 5 })` called. List renders `contact.name`, `crm.daysAgo.replace('{days}', ...)`, and a "Reconnect" `Button` per contact that calls `router.push(...)`. |
| 5 | Refresh icon spins via MUI `sx` keyframes, not Tailwind `animate-spin` | VERIFIED | `BaseWidget.tsx:192-206` — `Box component="span"` with `@keyframes spin` + `animation: 'spin 1s linear infinite'` inside `sx`. Zero occurrences of `animate-spin` anywhere in `components/dashboard/`. |
| 6 | Insight cards use client-side navigation (`useRouter`), not anchor tag | VERIFIED | `PredictiveInsightsWidget.tsx:11,47` — `useRouter` imported from `next/navigation`, `router` instantiated. Insight `Box` uses `component="div"` with `onClick={() => insight.action && router.push(insight.action.href)}`. No `component="a"` or `href` prop. |
| 7 | Reminder create dialog shows MUI Alert on mutation failure | VERIFIED | `ReminderCreateDialog.tsx:63-67` — `{createMutation.isError && (<Alert severity="error" sx={{ mt: 1 }}>...)}` present after the TextField. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/components/dashboard/widgets/FollowUpWidget.tsx` | Wired snooze mutation | VERIFIED | Imports `useSnoozeFollowUp` from `@/hooks/queries` (barrel re-exports `use-follow-ups.ts`). Real hook, no stub. |
| `frontend/components/dashboard/DashboardContainer.tsx` | Persisted widget visibility | VERIFIED | Imports `useDashboardPreferences`, `useSaveDashboardLayout` from `use-dashboard`. `visibleWidgets` derived from server state via `useMemo`. |
| `frontend/components/dashboard/widgets/BaseWidget.tsx` | MUI spin animation | VERIFIED | `@keyframes spin` defined inside `sx` on a `Box` wrapper. No Tailwind class. |
| `frontend/components/dashboard/widgets/PredictiveInsightsWidget.tsx` | Client-side navigation | VERIFIED | `useRouter` from `next/navigation` imported and used. `router.push()` in `onClick`. |
| `frontend/components/reminders/ReminderCreateDialog.tsx` | Error feedback | VERIFIED | `Alert` imported from `@mui/material`. Renders conditionally on `createMutation.isError`. |
| `frontend/components/dashboard/widgets/StaleContactsWidget.tsx` | Stale contacts widget | VERIFIED | Created. Uses `useStaleContacts`, `BaseWidget`, contact list with reconnect buttons. 103 lines (under 120 limit). |
| `frontend/components/dashboard/dashboard/widget-registry.ts` | Updated registry | VERIFIED | Lazy import for `StaleContactsWidget` on line 43. `WidgetId` includes `'contacts'`. `WIDGETS` array has `contacts` entry. `getWidgetName` and `getWidgetDescription` Records both include `'contacts'` — exhaustive. |
| `frontend/stores/dashboard-store.ts` | WidgetId sync | VERIFIED | `WidgetId` type on line 17 and `ALL_WIDGETS` array on line 19 both include `'contacts'`. Matches `widget-registry.ts`. |
| `frontend/components/dashboard/DashboardGrid.tsx` | Deleted (dead code) | VERIFIED | File absent. No import references anywhere in frontend. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `FollowUpWidget.tsx` | `use-follow-ups.ts` | `useSnoozeFollowUp` import via barrel | WIRED | Import on line 8: `from '@/hooks/queries'`; barrel exports `use-follow-ups`. Used on line 31. |
| `DashboardContainer.tsx` | `use-dashboard.ts` | `useDashboardPreferences` + `useSaveDashboardLayout` | WIRED | Direct import on line 27. Both hooks called and their results used in `visibleWidgets` useMemo and `saveMutation.mutate` callbacks. |
| `StaleContactsWidget.tsx` | `use-dashboard.ts` | `useStaleContacts` hook | WIRED | Import on line 7: `from '@/hooks/queries/use-dashboard'`. Called on line 25 with `{ limit: 5 }`. Return value destructured and used in render. |
| `widget-registry.ts` | `StaleContactsWidget.tsx` | lazy import | WIRED | Lines 43-45: `lazy(() => import('../widgets/StaleContactsWidget')...)`. Entry at line 99 references `StaleContactsWidget` component. |
| `dashboard-store.ts` | `widget-registry.ts` | `WidgetId` type union sync | VERIFIED | Both files define `WidgetId` as identical union including `'contacts'`. `ALL_WIDGETS` matches. |

---

### Requirements Coverage

| Requirement ID | Source Plan | Description | Status | Evidence |
|----------------|-------------|-------------|--------|----------|
| BUG-1 | 88-01-PLAN.md | Wire snooze mutation on FollowUpWidget | SATISFIED | `useSnoozeFollowUp` wired and called |
| BUG-2 | 88-01-PLAN.md | Widget visibility persists via backend API | SATISFIED | `useDashboardPreferences` + `useSaveDashboardLayout` wired |
| BUG-3 | 88-02-PLAN.md | Remove DashboardGrid dead code | SATISFIED | File deleted, no broken imports |
| BUG-4 | 88-01-PLAN.md | Fix refresh spin animation (MUI, no Tailwind) | SATISFIED | MUI `sx` keyframes in BaseWidget |
| BUG-5 | 88-02-PLAN.md | Create StaleContactsWidget, register it | SATISFIED | Widget created, registered in registry and store |
| BUG-6 | 88-01-PLAN.md | Fix insight card navigation (client-side) | SATISFIED | `useRouter().push()` replaces anchor tag |
| BUG-7 | 88-01-PLAN.md | Error feedback Alert on reminder dialog failure | SATISFIED | MUI Alert on `isError` present |

**Note on orphaned requirement IDs:** BUG-1 through BUG-7 do not appear in `REQUIREMENTS.md` and Phase 88 has no entry in the traceability table. These IDs are phase-internal bug trackers, not formal v6.0 requirements. This is not a defect — bug-fix phases legitimately reference internal IDs. No formal v6.0 requirements are claimed by or orphaned in this phase.

---

### Anti-Patterns Found

None. Scanned all 6 modified/created files for TODO/FIXME/placeholder comments, empty implementations, and stub handlers. Zero occurrences.

No `animate-spin` Tailwind class in any dashboard component. No `component="a"` anchor pattern on insight cards. No stub mutation objects.

---

### Human Verification Required

#### 1. Widget Visibility Persistence

**Test:** Open dashboard, open Customize drawer, hide one widget (e.g., "Stale Contacts"), close drawer, perform a full page reload (F5), reopen Customize drawer.
**Expected:** The widget remains hidden after reload — preferences were written to the backend and re-read on mount.
**Why human:** Requires live browser session with authenticated user; cannot verify API round-trip with grep.

#### 2. Snooze Mutation Fires Backend

**Test:** Click the clock icon on a follow-up item, select "1 hour", observe the Network tab in DevTools.
**Expected:** A PATCH request to `/ai/follow-ups/:id/snooze` is made with the new `dueDate` in the body. The item disappears or updates in the list.
**Why human:** Requires a valid session, running backend, and network tab observation.

#### 3. Client-Side Insight Navigation

**Test:** Click an insight card that has an action link (e.g., "X emails need response today"), observe browser navigation.
**Expected:** URL changes without a full-page white flash and without a new HTTP document request visible in the Network tab.
**Why human:** `router.push()` vs a full anchor navigation is only distinguishable in a live browser.

#### 4. Reminder Dialog Error Alert

**Test:** Open Reminder Create Dialog, submit it with the backend server stopped or using an invalid payload (empty after trimming would be blocked by the guard — instead intercept the network request).
**Expected:** Red MUI Alert visible below the text field with an error message.
**Why human:** `createMutation.isError` requires an actual failed mutation; cannot be triggered without running the app.

#### 5. Refresh Spin Animation

**Test:** Click the refresh icon on any dashboard widget; observe while the loading state is active.
**Expected:** The RefreshCw icon rotates smoothly at a steady pace. No visual glitch.
**Why human:** CSS animation playback requires visual browser inspection.

---

## Gaps Summary

No automated gaps detected. All 7 bugs are structurally fixed:

- The snooze stub is gone — real hook wired and called.
- Widget visibility is fully server-driven — no leftover `useState` for visibility, both `handleToggleWidget` and `handleResetWidgets` persist via `saveMutation`.
- DashboardGrid is deleted with zero remaining references.
- StaleContactsWidget is a full implementation (103 lines) with data hook, contact list, reconnect buttons, empty state, and CRM translation keys.
- The refresh icon uses MUI `sx` keyframes — no Tailwind utility class anywhere in dashboard components.
- Insight cards use `router.push()` on `onClick` with `component="div"` — the anchor tag pattern is gone.
- The reminder dialog renders a conditional MUI Alert on `createMutation.isError`.

The 5 human verification items are behavioral/visual checks that require a live browser, not structural gaps.

---

*Verified: 2026-03-19*
*Verifier: Claude (gsd-verifier)*
