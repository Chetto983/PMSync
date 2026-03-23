---
phase: 94-infrastructure-remaining-pages
verified: 2026-03-20T21:30:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Run health endpoint tests against Railway: cd frontend && npx playwright test e2e/health-endpoints.spec.ts --project chromium"
    expected: "5 tests pass — GET /health returns status healthy/degraded with db and redis up, /health/ready returns { status: 'ready' }, /health/live returns { status: 'alive' }, /health/queues returns array, /health/queues/all returns status + queues array"
    why_human: "Tests were verified via TypeScript compilation only; no live run was executed against Railway or local backend during plan execution"
  - test: "Run webhook tests against Railway: cd frontend && npx playwright test e2e/webhooks.spec.ts --project chromium"
    expected: "10 webhook tests pass — valid payloads accepted, Microsoft validation token handshake returns token, signature rejection tests (401) either pass or are skipped when EMAIL_SYNC_WEBHOOK_TOKEN not set, malformed Gmail payload rejected with 400/401/500"
    why_human: "Tests were verified via TypeScript compilation only; live behavior of Railway webhook tokens may affect accepted status codes"
  - test: "Run WebSocket test: cd frontend && npx tsx scripts/test-websocket.ts"
    expected: "Script prints 'WebSocket test PASSED' and exits 0 — authenticates via Better Auth, gets pmsync.ws.* token from /api/v1/realtime/auth-token, connects to /realtime namespace, receives 'connected' event with userId/tenantId/email/timestamp fields"
    why_human: "Script verified via TypeScript compilation only; requires live Railway backend with valid test user credentials"
  - test: "Navigate to /dashboard/tasks as an authenticated user"
    expected: "Page shows real follow-up list (or empty state 'No follow-ups to track'), NOT the old 'Coming Soon' placeholder. Sidebar buttons All Tasks / Today / Upcoming are visible and clickable. Filter click changes displayed items."
    why_human: "Playwright test file verified via code review; live run skipped by executor"
  - test: "Run remaining E2E tests against live frontend: cd frontend && npx playwright test e2e/dashboard.spec.ts e2e/analytics.spec.ts e2e/landing.spec.ts e2e/legal.spec.ts --project chromium"
    expected: "Dashboard shows 3+ widget cards, Customize button opens drawer, switch toggle reduces count by 1, reload preserves count. Analytics shows consent gate or Recharts chart. Landing shows H1 + features + modules + testimonials + CTA link + footer. Privacy/Terms pages show headings and 100+ chars of content."
    why_human: "Tests verified via TypeScript compilation only; requires running dev server or Railway deployment"
---

# Phase 94: Infrastructure Remaining Pages Verification Report

**Phase Goal:** Verify backend infra endpoints and rebuild remaining frontend pages with real data and E2E tests.
**Verified:** 2026-03-20T21:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Health endpoints /health, /health/ready, /health/live respond with correct schemas and status values | ? HUMAN | Tests exist and compile. 5 request.get calls assert correct shapes. Not run live. |
| 2 | Webhook endpoints accept valid payloads and reject invalid/missing signatures with 401 | ? HUMAN | Tests exist and compile. 10 tests with signature rejection. Not run live. |
| 3 | Realtime auth token endpoint returns a token and WebSocket connects successfully | ? HUMAN | Standalone script exists with full auth flow. Asserts token starts with pmsync.ws. and connected event fields. Not run live. |
| 4 | Tasks page shows real follow-up data from email module, not placeholder content | ✓ VERIFIED | Tasks.tsx rebuilt: uses usePendingFollowUps + useFollowUpStats, has loading skeleton / error / empty states. comingSoon string absent from component. data-testid="follow-up-item" present on list items. |
| 5 | Tasks sidebar filters (All Tasks, Today, Upcoming) filter the follow-up list client-side by dueDate | ✓ VERIFIED | useMemo filtered array with isToday / isFuture helpers. filter state drives display. |
| 6 | Dashboard renders default widgets, customization drawer opens, widget toggle changes count, layout persists after refresh | ? HUMAN | dashboard.spec.ts exists with 3 tests covering all behaviors. Uses MUI CSS class selectors. Not run live. |
| 7 | Analytics page shows consent gate or chart with data points after consent | ? HUMAN | analytics.spec.ts exists with dual-state detection. Not run live. |
| 8 | Landing page renders all 6 sections (hero, features, modules, testimonials, CTA, footer) | ? HUMAN | landing.spec.ts exists with correct section assertions and auth bypass. Not run live. |
| 9 | Legal pages (privacy, terms) render content and back navigation works | ? HUMAN | legal.spec.ts exists with heading + content length + navigation tests. Not run live. |

**Score:** 2/9 truths fully verified programmatically (Tasks component + i18n). 7/9 require human execution of E2E tests. All automated checks (compilation, code review) pass.

### Required Artifacts

| Artifact | Min Lines | Actual Lines | Status | Details |
|----------|-----------|--------------|--------|---------|
| `frontend/e2e/health-endpoints.spec.ts` | 40 | 77 | ✓ VERIFIED | 5 tests, request.get to all 5 health endpoints, unwrap helper, schema assertions |
| `frontend/e2e/webhooks.spec.ts` | 80 | 156 | ✓ VERIFIED | 10 tests across 4 webhook groups, signature rejection with conditional skip, malformed payload test |
| `frontend/scripts/test-websocket.ts` | 40 | 184 | ✓ VERIFIED | Full auth flow: sign-in → token → socket.io connect → connected event assertions → clean disconnect |
| `frontend/components/dashboard/Tasks.tsx` | 80 | 370 | ✓ VERIFIED | Real data with usePendingFollowUps, useFollowUpStats, Skeleton, Alert, useMemo filter, data-testid |
| `frontend/locales/en.ts` | — | contains waitingFor | ✓ VERIFIED | Line 1762: `waitingFor: 'Waiting for reply'` |
| `frontend/locales/it.ts` | — | contains waitingFor | ✓ VERIFIED | Line 1751: `waitingFor: 'In attesa di risposta'` |
| `frontend/locales/index.ts` | — | contains errorLoading | ✓ VERIFIED | Line 1644: `errorLoading: string` |
| `frontend/e2e/tasks.spec.ts` | 20 | 50 | ✓ VERIFIED | 2 tests: real content check + sidebar filter interactivity |
| `frontend/e2e/dashboard.spec.ts` | 30 | 104 | ✓ VERIFIED | 3 tests: widget render, drawer toggle, persistence |
| `frontend/e2e/analytics.spec.ts` | 20 | 67 | ✓ VERIFIED | 2 tests: consent-or-chart detection, SVG element check |
| `frontend/e2e/landing.spec.ts` | 25 | 64 | ✓ VERIFIED | 2 tests: 6-section check, footer links |
| `frontend/e2e/legal.spec.ts` | 20 | 85 | ✓ VERIFIED | 4 tests: privacy/terms content + back navigation |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `health-endpoints.spec.ts` | backend /health endpoints | `request.get(${apiURL}/health...)` | ✓ WIRED | Lines 24, 38, 47, 56, 65 — all 5 endpoints |
| `webhooks.spec.ts` | backend /webhooks/* endpoints | `request.post(${apiURL}/webhooks/...)` | ✓ WIRED | Lines 18, 37, 58, 77, 106, 122, 138 + Microsoft/contacts routes |
| `test-websocket.ts` | backend /realtime namespace | `io(\`${apiURL}/realtime\`, ...)` | ✓ WIRED | Line 133 — socket.io-client, auth token, transports websocket |
| `Tasks.tsx` | usePendingFollowUps hook | TanStack Query import | ✓ WIRED | Lines 19-21 import, line 97 call with (50, false) |
| `Tasks.tsx` | useFollowUpStats hook | TanStack Query import | ✓ WIRED | Line 98 call, stats.pending / stats.overdue / stats.dueToday used |
| `Tasks.tsx` | translations | `t.tasks.*` and `t.common.*` | ✓ WIRED | t.tasks.workspace, t.tasks.allTasks, t.tasks.errorLoading, t.tasks.waitingFor, etc. |
| `dashboard.spec.ts` | DashboardContainer | `page.goto('/dashboard')` | ✓ WIRED | Lines 12, 32, 68 |
| `analytics.spec.ts` | AnalyticsChart | `page.goto('/dashboard/analytics')` | ✓ WIRED | Lines 13, 44 |
| `landing.spec.ts` | Landing page sections | `page.goto('/')` | ✓ WIRED | Lines 16, 49 — with storageState bypass |
| `legal.spec.ts` | Privacy/Terms pages | `page.goto('/privacy')`, `page.goto('/terms')` | ✓ WIRED | Lines 14, 30 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BAPI-20 | 94-01-PLAN.md | User can get realtime auth token and WebSocket connects successfully | ? HUMAN | test-websocket.ts asserts pmsync.ws.* token and connected event. Not run live. |
| BAPI-21 | 94-01-PLAN.md | Health endpoints respond correctly (health, ready, live, queues) | ? HUMAN | health-endpoints.spec.ts covers all 5 endpoints with correct schema assertions. Not run live. |
| BAPI-22 | 94-01-PLAN.md | Webhook endpoints process notifications (Gmail push, Microsoft Graph, Calendar, Contacts) | ? HUMAN | webhooks.spec.ts covers all 6 webhook routes. Not run live. |
| FE-09 | 94-03-PLAN.md | Dashboard renders with all widgets, customization drawer works, layout persists | ? HUMAN | dashboard.spec.ts has 3 tests. Not run live. |
| FE-15 | 94-02-PLAN.md | Tasks page renders correctly (not demo/placeholder content) | ✓ SATISFIED | Tasks.tsx rebuilt: usePendingFollowUps + useFollowUpStats, comingSoon removed, Skeleton/Alert/data-testid present |
| FE-16 | 94-03-PLAN.md | Analytics page renders with real data | ? HUMAN | analytics.spec.ts exists. Not run live. |
| FE-17 | 94-03-PLAN.md | Landing page renders all sections (hero, features, testimonials, CTA, footer) | ? HUMAN | landing.spec.ts exists with 6-section assertions. Not run live. |
| FE-18 | 94-03-PLAN.md | Legal pages render (privacy, terms) | ? HUMAN | legal.spec.ts exists. Not run live. |

No orphaned requirements: all 8 IDs from plan frontmatter are covered, and REQUIREMENTS.md maps all 8 to Phase 94.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| — | None found | — | — |

No `waitForTimeout` calls, no `TODO/FIXME/placeholder` in production code, no empty handlers or stub returns. Tasks.tsx has no `comingSoon` reference. All test files use `expect(...).toBeVisible({ timeout: N })` patterns.

### Human Verification Required

#### 1. Health Endpoint Tests — Railway

**Test:** `cd D:/MailAgent/frontend && npx playwright test e2e/health-endpoints.spec.ts --project chromium`
**Expected:** 5 tests pass. GET /health returns 200 with `status` matching `healthy|degraded`, `services.database.status === 'up'`, `services.redis.status === 'up'`. /health/ready returns `{ status: 'ready' }`. /health/live returns `{ status: 'alive' }`. /health/queues returns array.
**Why human:** Tests were verified via TypeScript compilation only. The executor explicitly noted tests were not run live. BAPI-21 fulfillment requires passing tests.

#### 2. Webhook Contract Tests — Railway

**Test:** `cd D:/MailAgent/frontend && npx playwright test e2e/webhooks.spec.ts --project chromium`
**Expected:** 10 tests (7 valid-payload + 2 signature-rejection + 1 malformed). Microsoft validation token tests return the token string as 200. Signature rejection tests either pass (Railway has token configured) or are skipped (env var absent). Malformed Gmail payload returns 400/401/500.
**Why human:** Tests were verified via TypeScript compilation only. Railway webhook token configuration affects which status codes are returned.

#### 3. WebSocket Connection Test — Railway

**Test:** `cd D:/MailAgent/frontend && E2E_API_URL=https://backend-production-78e1.up.railway.app npx tsx scripts/test-websocket.ts`
**Expected:** Script prints `[WS-TEST] WebSocket test PASSED` and exits 0. Token starts with `pmsync.ws.`. Connected event contains `userId`, `tenantId`, `email`, `timestamp`.
**Why human:** Requires live Railway backend and valid admin@pmsync.local credentials.

#### 4. Tasks Page Live Rendering

**Test:** Navigate to `http://localhost:3001/dashboard/tasks` as authenticated user after `npm run dev`
**Expected:** Page shows follow-up list or empty state "No follow-ups to track". "Coming soon" text is absent. Sidebar shows All Tasks / Today / Upcoming with count badges. Clicking each filter changes displayed items.
**Why human:** Playwright test not run live; executor verified via code review + TypeScript only.

#### 5. Dashboard / Analytics / Landing / Legal E2E Tests

**Test:** `cd D:/MailAgent/frontend && npx playwright test e2e/dashboard.spec.ts e2e/analytics.spec.ts e2e/landing.spec.ts e2e/legal.spec.ts --project chromium`
**Expected:** Dashboard: 3+ MuiCard-root widgets visible, drawer opens with MuiSwitch elements, toggle reduces count by 1, reload preserves count. Analytics: heading visible and consent gate or recharts-wrapper present. Landing: H1 visible, features/modules/testimonials/CTA link/footer visible. Legal: "Privacy Policy" and "Terms of Service" headings visible, MuiPaper content > 100 chars.
**Why human:** Tests not run live by executor (consistent with phases 92-93 approach per SUMMARY.md).

### Gaps Summary

No structural gaps. All artifacts exist, are substantive, are properly wired, and compile cleanly. The only outstanding item is live test execution, which is a runtime validation gap consistent with how prior phases (92, 93) were handled in this project. The Tasks page component rebuild (FE-15) is fully verifiable statically and is confirmed complete. The remaining 7 requirements (BAPI-20/21/22, FE-09/16/17/18) depend on test execution against a live server.

---

_Verified: 2026-03-20T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
