# Phase 10 Checkpoint — Label-First Triage

| Field | Value |
|-------|-------|
| **Status** | IN PROGRESS |
| **Last Task** | T-1707 (Sprint 17 — Triage status in email detail) |
| **Next Task** | T-1801 (Sprint 18 — Triage Learning) |
| **Tasks Done** | 29/29 (S14-S17 complete) |
| **SP Done** | 62/67 |

## Sprint 14 — COMPLETE (6/6 tasks, 13 SP)

All schema, taxonomy, service, API, and LLM integration tasks done.

## Sprint 15 — COMPLETE (6/6 tasks, 14 SP)

All 3 extracted services created and wired:
- `label-resolution.service.ts` — Precedence-based label pipeline (rules > LLM > heuristic > empty)
- `triage-score.service.ts` — Label-metadata-subordinate scoring (suppressUrgency, category, defaultLane)
- `lane-assignment.service.ts` — Inbox lane derivation (overrides > label defaults > actionability fallback)
- `email-analysis.service.ts` rewired to use new pipeline (old methods removed)
- `triage-action.service.ts` uses actionability field (replaces heuristic shouldCreateFollowUp)
- `email-triage.service.ts` propagates lane/intent/actionability through TriageResult

## Sprint 16 — COMPLETE (10/10 tasks, 21 SP)

Label Wizard Onboarding & Dynamic Prompt Engine (see previous checkpoint for details).

## Sprint 17 — COMPLETE (7/7 tasks, 14 SP)

Inbox Lanes, Reasoning UI & Workflow Views:
- T-1701: EN+IT translations for lanes, reasoning, follow-up, inbox (34 keys per locale)
- T-1702: Backend `lane` filter on GET /emails + GET /ai/triage-rules/lane-counts endpoint. Frontend `useLaneCounts()` hook. Deprecated client-side `deriveTriageLane()`
- T-1703: `LaneTabBar.tsx` — 6 MUI Tabs (All, Action Now, Waiting, Customer/VIP, Alerts, Review Later) with count badges and semantic colors. Added `lane` to EmailFilters store
- T-1704: `TriageReasonChip.tsx` — Compact chip + Popover with labels, priority bar, reason, intent, actionability. Added aiLane/aiIntent/aiActionability to frontend Email type
- T-1705: Integrated LaneTabBar into email page with URL sync (?lane=X). TriageReasonChip in ThreadListItem Line 3. Lane-specific EmptyState variant
- T-1706: Follow-up icons (CheckSquare/Clock) in email list subject line based on aiActionability. `FollowUpIndicator.tsx` for detail view with TODO/WAITING badges + dismiss/resolve. Added aiLane/aiIntent/aiActionability to `emailListSelect`
- T-1707: `TriageStatusSection.tsx` — Full triage breakdown in email detail (lane badge, AI labels, priority reason, intent, actionability, FollowUpIndicator). Wired through selectedEmailData

## Sprint 18 — PLANNED

Triage Learning (5 SP remaining).

## Findings Addressed

| Finding | Sprint | Status |
|---------|--------|--------|
| LFT-A1: No onboarding rules | S14 | DONE (TriageRuleService + REST endpoints) |
| LFT-A2: Label taxonomy thin | S14, S16 | DONE (wizard structured fields + auto-generated prompts) |
| LFT-B1: No summary-first pipeline | S15 | DONE (label resolution > score > lane pipeline) |
| LFT-B2: No label precedence | S15 | DONE (LabelResolutionService 4-tier precedence) |
| LFT-C1: Score overrides semantics | S15 | DONE (TriageScoreService label-subordinate scoring) |
| LFT-C2: No inbox workflow views | S16, S17 | DONE (wizard + empty state + lane tabs + reasoning chip + follow-up indicators + detail triage section) |
| LFT-D1: No correlation | S18 | PLANNED |
| LFT-D2: No learning from corrections | S18 | PLANNED |
| LFT-E1: No production validation | S18 | PLANNED |

## Last Modified Files

- `frontend/locales/en.ts` — Triage lanes/reasoning/followUp/inbox translations (T-1701)
- `frontend/locales/it.ts` — Same in Italian (T-1701)
- `frontend/locales/index.ts` — Triage translation types (T-1701)
- `backend/src/modules/email/services/email-folder.service.ts` — `lane` filter in EmailListFilters + buildEmailWhere (T-1702)
- `backend/src/modules/email/controllers/email-query.controller.ts` — `lane` query param (T-1702)
- `backend/src/modules/ai/controllers/triage-rules.controller.ts` — GET lane-counts endpoint (T-1702)
- `frontend/lib/api/emails.ts` — `lane` in ListEmailsParams, aiLane/aiIntent/aiActionability on Email (T-1702, T-1704)
- `frontend/lib/api/labels.ts` — `getLaneCounts()` method (T-1702)
- `frontend/hooks/queries/use-lane-counts.ts` — NEW (T-1702)
- `frontend/lib/email-triage/triage-lanes.ts` — @deprecated deriveTriageLane (T-1702)
- `frontend/src/components/triage/LaneTabBar.tsx` — NEW (T-1703)
- `frontend/stores/email-ui/email-ui-types.ts` — `lane` in EmailFilters (T-1703)
- `frontend/src/components/triage/TriageReasonChip.tsx` — NEW (T-1704)
- `frontend/pages/dashboard/email.tsx` — LaneTabBar integration + URL sync (T-1705)
- `frontend/components/email/list/EmptyState.tsx` — 'lane' variant (T-1705)
- `frontend/components/email/list/ThreadListItem.tsx` — TriageReasonChip + follow-up icons (T-1705, T-1706)
- `frontend/components/email/utils/email-formatters.ts` — Pass triage fields to ThreadListItemData (T-1705)
- `backend/src/common/utils/prisma-select.utils.ts` — aiLane/aiIntent/aiActionability in emailListSelect (T-1706)
- `frontend/src/components/triage/FollowUpIndicator.tsx` — NEW (T-1706)
- `frontend/src/components/triage/TriageStatusSection.tsx` — NEW (T-1707)
- `frontend/components/email/thread/ExpandedMessage.tsx` — TriageStatusSection (T-1707)
- `frontend/components/email/hooks/use-email-page-actions.ts` — Triage fields in selectedEmailData (T-1707)

## Key Decisions

- **Lane-counts endpoint at `/ai/triage-rules/lane-counts`** — grouped with existing triage rules controller
- **No `customer-vip` lane in backend** — only 4 lanes exist (action-now, waiting-on-reply, system-alerts, review-later). Tab included for forward compat
- **Follow-up indicators use `aiActionability` field** — avoids N+1 queries in email list. Detail view uses `useFollowUpForEmail()` for rich data
- **TriageReasonChip uses Popover (click)** not Tooltip (hover) — more accessible, works on mobile
- **TriageStatusSection is a separate component** — ExpandedMessage already >500 lines

## Validation Status

- Backend type-check: PASS
- Frontend type-check: PASS
- All strings use translations (EN + IT)
- All colors use MUI theme tokens
- No files exceed 500 lines (new components: LaneTabBar 113, TriageReasonChip 170, FollowUpIndicator 112, TriageStatusSection 121)
