# Sprint 17 — Inbox Lanes, Reasoning UI & Workflow Views

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 17 |
| **SP** | 14 |
| **Objective** | Expose lane-based inbox views, visible triage reasoning, and follow-up workflow in the email frontend |
| **Addresses** | LFT-C2 |

---

## Sprint Backlog

### T-1701: Add translations for lanes and triage UI [1 SP]
- [ ] Add to `frontend/locales/en.ts` under `triage` namespace:
  - `triage.lanes.actionNow`, `triage.lanes.waitingOnReply`, `triage.lanes.customerVip`, `triage.lanes.systemAlerts`, `triage.lanes.reviewLater`, `triage.lanes.all`
  - `triage.reasoning.label`, `triage.reasoning.score`, `triage.reasoning.lane`
  - `triage.followUp.todo`, `triage.followUp.waiting`, `triage.followUp.none`
  - `triage.followUp.dueDate`, `triage.followUp.reason`
  - `triage.inbox.filterByLane`, `triage.inbox.noEmails`, `triage.inbox.triageStatus`
- [ ] Add same keys to `frontend/locales/it.ts`
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1702: Add lane filter to email list API and hooks [2 SP]
- [ ] Backend: Add `lane` filter to email list endpoint (`GET /emails` or equivalent)
  - Accept `?lane=action-now` query param
  - Filter by `aiLane` column (new from S14) — replaces client-side `deriveTriageLane()` in `frontend/lib/email-triage/triage-lanes.ts`
- [ ] Frontend: Update email list query hook to accept `lane` parameter
- [ ] Add `useLaneCounts(tenantId)` hook that returns count per lane (for badges)
  - Backend endpoint: `GET /ai/triage/lane-counts` — returns `{ "action-now": 5, "waiting-on-reply": 3, ... }`
- [ ] Deprecate client-side `deriveTriageLane()` in `triage-lanes.ts` — lanes now come from backend
- [ ] Verify with `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`

### T-1703: Build lane tab bar component [3 SP]
- [ ] Create `frontend/src/components/triage/LaneTabBar.tsx` (max 150 lines)
- [ ] MUI Tabs with 6 tabs: All, Action Now, Waiting, Customer/VIP, Alerts, Review Later
- [ ] Each tab shows count badge from `useLaneCounts()`
- [ ] Tab colors use semantic theme colors:
  - Action Now → error/red
  - Waiting → warning/orange
  - Customer/VIP → primary/teal
  - Alerts → info/blue
  - Review Later → default/grey
- [ ] Clicking tab updates URL query param `?lane=X` and filters email list
- [ ] "All" tab shows all emails (no lane filter)
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1704: Build triage reasoning chip/tooltip [2 SP]
- [ ] Create `frontend/src/components/triage/TriageReasonChip.tsx` (max 100 lines)
- [ ] Compact view: small MUI Chip showing lane icon + urgency color
- [ ] On hover/click: MUI Tooltip or Popover showing:
  - Labels (as colored chips)
  - Priority reason (from `aiPriorityReason`)
  - Lane reason
  - Intent + actionability
  - Confidence percentage
- [ ] Use in email list row and email detail view
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1705: Integrate lane tab bar into email list page [3 SP]
- [ ] Find existing email list page component
- [ ] Add `LaneTabBar` above the email list
- [ ] Wire tab selection to email list query (adds `lane` filter)
- [ ] Add `TriageReasonChip` to each email row
- [ ] Show lane icon in email list item (before subject)
- [ ] Handle empty states per lane ("No emails need action right now")
- [ ] Ensure email list still works with no lane filter (backward compat)
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1706: Add follow-up workflow indicators [2 SP]
- [ ] In email detail view, show follow-up status:
  - TODO badge with due date
  - WAITING_FOR badge with "waiting since" date
  - Dismiss/resolve button per follow-up
- [ ] In email list, show small follow-up icon (clock for waiting, checkbox for todo) next to subject
- [ ] Use existing `useEmailFollowUps()` hook or create one
- [ ] Verify with `cd frontend && npx tsc --noEmit`

### T-1707: Add triage status to email detail view [1 SP]
- [ ] In email detail header/sidebar, show a "Triage" section:
  - Lane (as colored badge)
  - Labels (as colored chips)
  - Priority reason (text)
  - Actionability (todo/waiting/none indicator)
- [ ] Use `TriageReasonChip` expanded view or inline layout
- [ ] Verify with `cd frontend && npx tsc --noEmit`

---

## Dependencies

- Sprint 15 complete (lane field in schema, lane assignment service)
- Sprint 16 complete (translations infrastructure)

## Risks

1. Adding lane tabs to email list is high-visibility — must not break existing email navigation.
2. Lane count queries could be expensive if not indexed. Verify `@@index([tenantId, aiLane])` exists.
3. Triage reasoning popover must be lightweight — don't load extra API calls on hover, use data already in list response.

## Definition of Done

- [ ] `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` pass
- [ ] Email list shows lane tabs with counts
- [ ] Clicking a lane tab filters emails
- [ ] Each email row shows triage reasoning chip
- [ ] Email detail shows full triage breakdown
- [ ] Follow-up indicators appear in list and detail
- [ ] All strings use translations
- [ ] All colors use MUI theme
