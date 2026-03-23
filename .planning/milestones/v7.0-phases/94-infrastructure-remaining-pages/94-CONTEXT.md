# Phase 94: Infrastructure & Remaining Pages - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify that WebSocket connectivity, health monitoring, webhook processing, and all remaining frontend pages (dashboard, tasks, analytics, landing, legal) work correctly end-to-end. Fix bugs found during verification. Build minimal real tasks page content. No other new features.

Requirements: BAPI-20, BAPI-21, BAPI-22, FE-09, FE-15, FE-16, FE-17, FE-18

</domain>

<decisions>
## Implementation Decisions

### WebSocket & Realtime Verification
- Live connection test: authenticate, call realtime auth token endpoint, connect Socket.IO client, assert connection success
- Use standalone Node script with `socket.io-client` package (not Playwright browser context) — more reliable for protocol-level assertions
- Verify connection + authentication only — do NOT test event delivery round-trips (that's integration testing beyond this phase)
- If WebSocket connection fails, the test FAILS — treat as a real bug, no soft warnings

### Health Endpoints
- Full state validation: assert specific values — health=ok, ready=true, live=true, queues show expected queue names with counts
- Not just status codes — verify response body schema AND actual state values
- Run against Railway deployment via HTTP (same E2E_BASE_URL as Playwright)

### Webhook Contract Tests
- HTTP contract tests: send mock webhook payloads to each endpoint (email-sync, calendar, contacts × Google + Microsoft)
- Verify valid payloads are accepted (200/202) and malformed payloads are rejected (400)
- Include signature validation testing: verify that invalid/missing signatures are rejected (security behavior)
- Run against Railway deployment via HTTP

### Tasks Page — Build Minimal Real Content
- Replace "Coming Soon" placeholder with AI-extracted tasks from emails
- Reuse existing follow-up tracking and email triage data — surface as "tasks" without a new backend module
- Read-only task list (no create/edit/delete CRUD)
- Must show real data, not placeholder content

### Dashboard Verification
- Full interactive Playwright test: verify all default widgets render, open customization drawer, toggle a widget, rearrange layout, refresh and verify persistence
- Tests the complete success criteria (renders, drawer works, layout persists)

### Analytics Page Verification
- Test consent flow: page loads, consent gate shows prompt if not consented
- After consent: chart renders with visible data points (Recharts)
- Don't assert exact data values — just verify chart is populated

### Landing Page & Legal Pages
- Landing: verify all 6 sections render (hero, features, modules, testimonials, CTA, footer) — check for key headings/elements
- Legal: verify privacy and terms pages load, have content, back navigation works
- Check navigation links between pages

### Test Environment (carried from Phase 89)
- All tests run against Railway deployment (`E2E_BASE_URL`)
- Fix inline if trivial (< 5 lines), defer cosmetic issues to Phase 96
- Fresh user per test run
- Backend HTTP tests use same Railway base URL approach as Playwright

### Claude's Discretion
- Exact test file organization and naming
- Which specific widgets to assert on dashboard
- How to handle follow-up data shape for tasks display
- Loading/error state details for tasks page

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend Infrastructure
- `backend/src/modules/realtime/gateways/realtime.gateway.ts` — Socket.IO gateway implementation, auth handshake flow
- `backend/src/modules/realtime/controllers/realtime.controller.ts` — Realtime HTTP endpoints (token endpoint)
- `backend/src/modules/realtime/services/realtime-auth-token.service.ts` — Auth token generation for WebSocket
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` — Cookie-backed session handshake
- `backend/src/modules/health/controllers/health.controller.ts` — All 7+ health endpoints
- `backend/src/modules/health/services/health.service.ts` — Health check logic and expected response shapes

### Webhook Controllers (distributed across modules)
- `backend/src/modules/email-sync/controllers/webhook.controller.ts` — Gmail & Microsoft email webhooks
- `backend/src/modules/calendar/controllers/calendar-webhook.controller.ts` — Calendar webhooks
- `backend/src/modules/contacts/controllers/contacts-webhook.controller.ts` — Contacts webhooks
- `backend/src/common/services/webhook-validation.service.ts` — Shared signature validation

### Frontend Pages
- `frontend/pages/dashboard/index.tsx` — Dashboard page with DashboardContainer
- `frontend/components/dashboard/DashboardContainer.tsx` — Widget grid with react-grid-layout
- `frontend/pages/dashboard/tasks.tsx` — Tasks page (currently placeholder — to be rebuilt)
- `frontend/components/dashboard/Tasks.tsx` — Tasks component (currently skeleton)
- `frontend/pages/dashboard/analytics.tsx` — Analytics page with consent check
- `frontend/components/dashboard/AnalyticsChart.tsx` — Recharts email trends chart
- `frontend/pages/index.tsx` — Landing page (458 lines, 6 sections)
- `frontend/pages/privacy.tsx` — Privacy policy (399 lines)
- `frontend/pages/terms.tsx` — Terms of service (468 lines)

### Existing Follow-up/Triage Data (for Tasks page)
- `backend/src/modules/email/` — Email triage and follow-up tracking (data source for tasks)

### Test Patterns (from Phase 89)
- `frontend/e2e/` — Existing Playwright test patterns and configuration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `socket.io-client` package available in frontend dependencies — can be used for standalone WS test script
- Existing Playwright config and test patterns in `frontend/e2e/` — follow same structure
- `useEmailTrends` hook in analytics — already wired to backend consent-gated endpoint
- `DashboardContainer` with `react-grid-layout` — full widget system with customization drawer
- Follow-up and triage services in email module — data source for tasks without new backend module

### Established Patterns
- All E2E tests run against Railway via `E2E_BASE_URL`
- Better Auth cookie-based authentication for all API calls
- TanStack Query for all data fetching with `queryOptions()` pattern
- MUI components with theme `sx` props for all UI

### Integration Points
- Tasks page needs to consume follow-up/triage data from existing email module endpoints
- WebSocket test needs to authenticate via Better Auth first, then use token for Socket.IO
- Webhook tests need to construct provider-specific payloads (Google vs Microsoft format differences)
- Dashboard test needs to interact with react-grid-layout drag handles

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 94-infrastructure-remaining-pages*
*Context gathered: 2026-03-20*
