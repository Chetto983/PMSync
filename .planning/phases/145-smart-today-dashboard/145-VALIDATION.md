---
phase: 145
slug: smart-today-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 145 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 145-RESEARCH.md "Validation Architecture" section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend Framework** | Jest 29 + ts-jest (`backend/jest.config.js`) |
| **Frontend Framework** | Jest 29 + React Testing Library (`frontend/jest.config.js`) |
| **Backend test pattern** | `<rootDir>/src/**/*.spec.ts`, `<rootDir>/test/**/*.spec.ts` |
| **Frontend test pattern** | `*.test.tsx`, `*.test.ts` |
| **Backend quick run** | `cd backend && npx jest --testPathPattern="dashboard" --no-coverage` |
| **Backend full suite** | `cd backend && npm test` |
| **Frontend quick run** | `cd frontend && npx jest --testPathPattern="today"` |
| **Frontend full suite** | `cd frontend && npm test` |
| **Type check (mandatory per CLAUDE.md)** | `cd backend && npx tsc --noEmit` and `cd frontend && npm run type-check` |
| **Lint** | `cd backend && npm run lint:win` and `cd frontend && npm run lint` |
| **Estimated runtime (scoped)** | ~30 seconds backend, ~45 seconds frontend |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit && cd ../frontend && npm run type-check` (mandatory per CLAUDE.md)
- **After every plan wave:** Run scoped Jest — backend `--testPathPattern="dashboard"` + frontend `--testPathPattern="today"`
- **Before `/gsd-verify-work`:** Full backend + frontend Jest suite must be green; manual Edge CDP E2E sign-off required (per memory `feedback_e2e_validation_mandatory.md` and `reference_railway_e2e.md`)
- **Max feedback latency:** 75 seconds (scoped) / ~5 minutes (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 145-{back}-01 | back | 1 | NAV-05 | T-cross-tenant | Endpoint enforces `req.user.tenantId` filter on all 4 source queries | integration | `cd backend && npx jest dashboard.controller.spec.ts -t "tenant isolation"` | ❌ W0 | ⬜ pending |
| 145-{back}-02 | back | 1 | NAV-05 | — | `GET /dashboard/today` returns items grouped by tier with counts | unit (service) | `cd backend && npx jest dashboard-today.service.spec.ts -t "groups items by tier"` | ❌ W0 | ⬜ pending |
| 145-{back}-03 | back | 1 | NAV-05 | — | Aggregation calls all 4 sources in parallel and tolerates one source failing | unit | `cd backend && npx jest dashboard-today.service.spec.ts -t "tolerates source failure"` | ❌ W0 | ⬜ pending |
| 145-{back}-04 | back | 1 | NAV-05 | — | Scoring rules: overdue → urgent, due today → today, upcoming ≤24h → fyi | unit (pure) | `cd backend && npx jest today-scorer.service.spec.ts` | ❌ W0 | ⬜ pending |
| 145-{back}-05 | back | 1 | NAV-05 | T-tz-injection | `tz` query param validated against IANA allowlist | unit | `cd backend && npx jest dashboard-today.dto.spec.ts -t "rejects invalid tz"` | ❌ W0 | ⬜ pending |
| 145-{front}-01 | front | 2 | NAV-05 | — | `TodayDashboard` renders three tier sections with correct counts | RTL component | `cd frontend && npx jest TodayDashboard.test.tsx` | ❌ W0 | ⬜ pending |
| 145-{front}-02 | front | 2 | NAV-05 | — | Quick action complete: optimistic remove + toast + undo restores | RTL component | `cd frontend && npx jest TodayFeedItem.test.tsx -t "complete with undo"` | ❌ W0 | ⬜ pending |
| 145-{front}-03 | front | 2 | NAV-05 | — | Click row navigates to entity per type (email/task/deal/event) | RTL component | `cd frontend && npx jest TodayFeedItem.test.tsx -t "navigation"` | ❌ W0 | ⬜ pending |
| 145-{front}-04 | front | 2 | NAV-05 | — | Empty state renders when items array is empty | RTL | `cd frontend && npx jest TodayEmptyState.test.tsx` | ❌ W0 | ⬜ pending |
| 145-{front}-05 | front | 2 | NAV-05 | — | Snooze for follow-up calls `PATCH /ai/follow-ups/:id/snooze` | RTL + msw | `cd frontend && npx jest use-today.test.ts -t "snooze follow-up"` | ❌ W0 | ⬜ pending |
| 145-{front}-06 | front | 2 | NAV-05 | — | i18n keys present in en.ts and it.ts under `dashboard.today.*` | type-check | `cd frontend && npm run type-check` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — gsd-planner will replace `{back}` / `{front}` with the actual plan slug numbers it assigns.*

---

## Wave 0 Requirements

- [ ] `backend/src/modules/dashboard/services/__tests__/dashboard-today.service.spec.ts` — covers NAV-05 aggregation/grouping/source-failure tolerance
- [ ] `backend/src/modules/dashboard/services/__tests__/today-scorer.service.spec.ts` — covers scoring rules (pure functions)
- [ ] `backend/src/modules/dashboard/controllers/__tests__/dashboard.controller.spec.ts` — covers tenant isolation + endpoint contract
- [ ] `backend/src/modules/dashboard/dto/__tests__/dashboard-today.dto.spec.ts` — covers `tz`/`locale` validation
- [ ] `frontend/components/dashboard/today/__tests__/TodayDashboard.test.tsx` — covers tier rendering + greeting + counts
- [ ] `frontend/components/dashboard/today/__tests__/TodayFeedItem.test.tsx` — covers quick actions + navigation + animations (mock framer-motion)
- [ ] `frontend/components/dashboard/today/__tests__/TodayEmptyState.test.tsx` — covers all-caught-up + nothing-on-plate variants
- [ ] `frontend/hooks/queries/__tests__/use-today.test.ts` — covers `useTodayFeed`, `useCompleteFeedItem`, `useSnoozeFeedItem`, `useDismissFeedItem` mutations
- [ ] No new test framework install needed — Jest already configured in both backend + frontend

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end Today dashboard load on Railway/Vercel staging | NAV-05 | Aggregates real tenant data; cache, briefing, and CRM/calendar integrations only stable in deployed env | Per memory `reference_railway_e2e.md`: log in to https://mail-agent-indol.vercel.app, navigate to `/dashboard`, verify 3 tier sections render, click an item to confirm navigation, dismiss + undo, hard reload to confirm persistence semantics |
| Animations and hover behavior visual QA | NAV-05 | RTL cannot assert framer-motion visual fidelity | Run app in Edge with CDP per memory `reference_playwright_debug.md`: hover row → quick actions fade in 150ms, dismiss → row slides left + fades 200ms, undo → row slides back |
| Greeting copy quality (BriefingService output) | D-04 / Claude's Discretion | LLM output requires human judgment | Visit dashboard at different times of day; confirm greeting reads naturally and counts match tier headers |
| i18n parity in Italian | D-08 / NAV-05 | Translation correctness is human judgment | Switch locale to `it`, confirm all `dashboard.today.*` strings render correctly with no fallbacks |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 75s scoped / 5min full
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
