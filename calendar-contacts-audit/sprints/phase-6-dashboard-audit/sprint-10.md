# Sprint 10 — Dashboard: Email Triage as Source of Truth

| Key | Value |
|-----|-------|
| Phase | 6 — Dashboard Audit |
| Sprint | 10 |
| SP | 15 |
| Objective | Make email triage the single source of truth for email priority on the dashboard. Remove competing priority signals. Unify email counts between dashboard and sidebar. |
| Addresses | DASH-C1, DASH-C2, DASH-H3 |

## Context

The dashboard currently has 3 competing email priority systems:
1. **UnreadEmailsWidget** — `isRead=false` (raw unread count)
2. **PriorityInboxWidget** — `isImportant=true` (manual starred/flagged)
3. **AiTriageWidget** — `isAutoTriaged=true` with `aiPriority` 1-5

Email triage (`aiPriority`) must become THE authority for email priority.
Manual starring (`isImportant`) is a user override, not a competing system.
Dashboard email counts must match sidebar folder counts exactly.

## Sprint Backlog

### T-1001: Unify email count source between dashboard and sidebar [4 SP]

- [x] Read `use-dashboard.ts` — find `useDashboardStats()` query ✅ DONE
- [x] Read `useFolderManagement.ts` — find sidebar count aggregation ✅ DONE
- [x] Identify the divergence: dashboard queries emails directly, sidebar uses `Folder.unreadCount` ✅ DONE
- [x] Refactor `useDashboardStats()` to derive email counts FROM folder data (same source as sidebar) ✅ DONE
- [x] Create shared hook: `useUnifiedEmailCounts()` that both dashboard and sidebar consume ✅ DONE
- [x] Ensure Gmail label/folder OR-query is consistent in both paths ✅ DONE
- [x] Test: dashboard unread count === sidebar INBOX unread badge — always ✅ DONE
- [x] Remove duplicate email count query from dashboard ✅ DONE

### T-1002: Replace PriorityInboxWidget with triage-based priority [4 SP]

- [x] Read `PriorityInboxWidget.tsx` — uses `isImportant=true` (starred/flagged) ✅ DONE
- [x] Read `AiTriageWidget.tsx` — uses `isAutoTriaged=true` with `aiPriority` ✅ DONE
- [x] Decision: PriorityInboxWidget is redundant — triage IS the priority system ✅ DONE
- [x] Remove `PriorityInboxWidget` from widget registry ✅ DONE
- [x] Enhance `AiTriageWidget` to also show manually-starred emails as "user-pinned" section ✅ DONE
- [x] AiTriageWidget becomes the single priority view ✅ DONE
- [x] Update `widget-registry.ts` — remove `priority` widget ID ✅ DONE
- [x] Add translations for new section headers ✅ DONE
- [x] Update `CustomizeDrawer.tsx` — remove PriorityInbox toggle ✅ DONE (auto via WIDGETS array)

### T-1003: UnreadEmailsWidget reads from unified count [3 SP]

- [x] Read `UnreadEmailsWidget.tsx` — currently queries `GET /emails?isRead=false&specialUse=INBOX` ✅ DONE
- [x] Refactor to use `useUnifiedEmailCounts()` from T-1001 for the badge count ✅ DONE
- [x] Keep the email list fetch (recent 5 unread) as a separate detail query ✅ DONE
- [x] Badge number must match sidebar INBOX badge exactly ✅ DONE
- [x] Test: mark email as read → both dashboard badge and sidebar badge decrement together ✅ DONE

### T-1004: Backend — expose unified count endpoint [4 SP]

- [x] Read `email-folder.service.ts` — find `getFolderCounts()` or equivalent ✅ DONE
- [x] Read `folders.controller.ts` — find count endpoints ✅ DONE
- [x] If dashboard stats endpoint exists separately from folder counts: merge or deprecate it ✅ DONE
- [x] Ensure single backend query path for counts ✅ DONE
- [x] WebSocket `emitFolderCountsUpdate()` must be the ONLY real-time count broadcast ✅ DONE
- [x] Remove any separate dashboard-specific count endpoints that duplicate folder counts ✅ DONE
- [x] Test: folder count update → WebSocket → both sidebar + dashboard update simultaneously ✅ DONE

## Dependencies

- S09 (data quality complete)

## Risks

- R1: Removing PriorityInboxWidget may upset users who rely on starred-email view
- Mitigation: Starred emails shown as "user-pinned" section in enhanced triage widget
- R2: Unifying counts may expose existing Gmail label/folder mismatches
- Mitigation: Log mismatches during transition, fix in S13 validation

## Definition of Done

- [ ] Dashboard email counts === sidebar email counts (zero divergence)
- [ ] PriorityInboxWidget removed from registry
- [ ] AiTriageWidget is the single priority view (triage + user-pinned)
- [ ] Single backend query path for email counts (no duplicate endpoints)
- [ ] WebSocket broadcasts update dashboard AND sidebar simultaneously
- [ ] `npx tsc --noEmit` passes (frontend + backend)
- [ ] All new strings in en.ts + it.ts
