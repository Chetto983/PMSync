# Phase 94: Infrastructure & Remaining Pages - Research

**Researched:** 2026-03-20
**Domain:** WebSocket connectivity, health monitoring, webhook processing, frontend page verification
**Confidence:** HIGH

## Summary

Phase 94 covers verification and light implementation across four backend infrastructure domains (WebSocket/realtime, health endpoints, webhooks) and five frontend pages (dashboard, tasks, analytics, landing, legal). The backend infrastructure is fully built -- all controllers, services, and gateways exist and are wired. The primary work is writing E2E/contract tests against the Railway deployment and rebuilding the Tasks page from placeholder to real follow-up data.

The codebase is mature: Socket.IO gateway with multi-tenant rooms, HMAC-signed realtime auth tokens, 7+ health endpoints with DB/Redis/Mistral probes, and webhook controllers for Gmail Pub/Sub, Microsoft Graph, Google Calendar, and Microsoft Calendar/Contacts. The Tasks page is the only code-writing task -- replacing a "Coming Soon" placeholder with a read-only list consuming existing follow-up data via `usePendingFollowUps`.

**Primary recommendation:** Structure work as: (1) backend HTTP contract tests for health + webhooks, (2) WebSocket standalone test, (3) Tasks page rebuild, (4) Playwright tests for dashboard/analytics/landing/legal pages.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- WebSocket test: standalone Node script with `socket.io-client`, not Playwright browser context. Verify connection + authentication only, no event delivery round-trips.
- Health endpoints: full state validation (schema + values), not just status codes. Run via HTTP against Railway.
- Webhook tests: HTTP contract tests with mock payloads. Include signature validation (invalid/missing signatures rejected). Run against Railway.
- Tasks page: replace placeholder with AI-extracted tasks from follow-up/triage data. Read-only list, no CRUD. Reuse existing email module endpoints.
- Dashboard: full interactive Playwright test (widgets render, customization drawer, toggle, rearrange, persistence).
- Analytics: test consent flow + chart renders with data points (Recharts).
- Landing: verify 6 sections (hero, features, modules, testimonials, CTA, footer).
- Legal: verify privacy + terms load, have content, back navigation.
- Test environment: all tests against Railway (`E2E_BASE_URL`). Fix inline if trivial (< 5 lines), defer cosmetic to Phase 96.

### Claude's Discretion
- Exact test file organization and naming
- Which specific widgets to assert on dashboard
- How to handle follow-up data shape for tasks display
- Loading/error state details for tasks page

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-20 | User can get realtime auth token and WebSocket connects successfully | Realtime controller at `/realtime/auth-token` returns `{ token, expiresAt }`. Gateway on `/realtime` namespace accepts token via `handshake.auth.token`. Handshake service validates HMAC token then Better Auth session. |
| BAPI-21 | Health endpoints respond correctly (health, ready, live, queues) | Health controller has 7 endpoints: `/health` (system health with DB/Redis/Mistral), `/health/ready`, `/health/live`, `/health/queues`, `/health/queues/all`, `/health/queues/:name`, `/health/metrics`. All are `@Public()`. |
| BAPI-22 | Webhook endpoints process notifications (Gmail push, Microsoft Graph, Calendar, Contacts) | 6 webhook endpoints across 3 controllers. Gmail (`POST /webhooks/gmail/push`), Microsoft email (`POST /webhooks/microsoft/notifications`), Google Calendar (`POST /webhooks/calendar/google/push`), Microsoft Calendar (`POST /webhooks/calendar/microsoft/notifications`), Google Contacts (`POST /webhooks/contacts/google/sync`), Microsoft Contacts (`POST /webhooks/contacts/microsoft/notifications`). All `@Public()` + `@SkipThrottle()`. |
| FE-09 | Dashboard renders with all widgets, customization drawer works, layout persists | DashboardContainer uses 10 widgets via widget-registry. CustomizeDrawer toggles visibility. Preferences stored via `useDashboardPreferences` + `useSaveDashboardLayout` (backend API). |
| FE-15 | Tasks page renders correctly (not demo/placeholder content) | Current Tasks component shows "Coming Soon" placeholder. Must be rebuilt to show real follow-up data via `usePendingFollowUps` hook (backend: `GET /api/v1/ai/follow-ups/pending`). |
| FE-16 | Analytics page renders with real data | AnalyticsChart checks consent via `useConsent`, then renders Recharts LineChart with `useEmailTrends` data. Consent gate redirects to settings. |
| FE-17 | Landing page renders all sections (hero, features, testimonials, CTA, footer) | Landing page (458 lines) uses dynamic imports for 6 sections: Hero, Features, Modules, Testimonial, Cta, Footer. All sections in `frontend/components/landing/`. |
| FE-18 | Legal pages render (privacy, terms) | Privacy (399 lines) at `/privacy`, Terms (468 lines) at `/terms`. Static content pages. |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `socket.io-client` | ^4.8.3 | WebSocket client for realtime test | Already in frontend deps, used for standalone WS test script |
| `@playwright/test` | (project version) | E2E browser testing | Existing test infrastructure for all frontend page verification |
| `recharts` | (project version) | Analytics chart rendering | Already used in AnalyticsChart component |
| `@tanstack/react-query` | (project version) | Data fetching for Tasks page | Project standard for all API data |
| `@mui/material` | (project version) | UI components for Tasks page | Project standard, no alternatives |

### No New Dependencies Needed
This phase requires zero new packages. All testing and UI work uses existing project dependencies.

## Architecture Patterns

### Existing Backend Infrastructure (verification only)

**Realtime Auth Flow:**
```
1. Client: GET /realtime/auth-token (with Better Auth cookie)
2. Server: Returns { token: "pmsync.ws.<payload>.<signature>", expiresAt }
3. Client: io("/realtime", { auth: { token }, transports: ["websocket"] })
4. Server: HandshakeService.authenticate() -> validates HMAC token -> checks session in DB
5. Server: Emits "connected" event with { userId, tenantId, email, timestamp }
```

**Health Endpoint Response Shapes:**
```
GET /health -> { status: "healthy"|"degraded", timestamp, services: { database: {status, responseTime}, redis: {status, responseTime}, mistral: {status, ...} } }
GET /health/ready -> { status: "ready" }
GET /health/live -> { status: "alive" }
GET /health/queues -> QueueMetricsSummary[]
GET /health/queues/all -> { status, queues: [...] }
```

**Webhook Endpoint Patterns:**
```
POST /webhooks/gmail/push -> Body: GmailPubSubMessage { message: { data, messageId, publishTime }, subscription }
POST /webhooks/microsoft/notifications -> Body: { value: MicrosoftGraphNotification[] } | Query: ?validationToken=
POST /webhooks/calendar/google/push -> Headers: x-goog-channel-id, x-goog-resource-id, x-goog-channel-token
POST /webhooks/calendar/microsoft/notifications -> Body: { value: MicrosoftCalendarNotification[] } | Query: ?validationToken=
POST /webhooks/contacts/google/sync -> Body: { providerId } + Header: x-webhook-token
POST /webhooks/contacts/microsoft/notifications -> Body: { value: MicrosoftContactsNotification[] } | Query: ?validationToken=
```

### Recommended Test File Structure
```
frontend/e2e/
  infrastructure/
    websocket.test.ts         # Standalone Node script for WS test
    health-endpoints.spec.ts  # HTTP health endpoint contract tests
    webhooks.spec.ts          # HTTP webhook contract tests
  dashboard.spec.ts           # Dashboard widget + customization Playwright
  tasks.spec.ts               # Tasks page renders real data
  analytics.spec.ts           # Analytics consent + chart verification
  landing.spec.ts             # Landing page sections
  legal.spec.ts               # Privacy + Terms pages
```

**Alternative (flat):** All spec files at `frontend/e2e/` level -- matches existing pattern (no subdirectories used currently). This is cleaner given the project convention.

**Recommended:** Keep flat at `frontend/e2e/` matching existing files:
```
frontend/e2e/
  health-endpoints.spec.ts
  webhooks.spec.ts
  websocket.spec.ts       # or standalone .ts script
  dashboard.spec.ts
  tasks.spec.ts
  analytics.spec.ts
  landing.spec.ts
  legal.spec.ts
```

### Tasks Page Architecture

The Tasks page must be rebuilt from placeholder to real data. The approach:

1. **Data source:** `usePendingFollowUps()` hook from `frontend/hooks/queries/use-follow-ups.ts`
   - Returns `{ followUps: EmailFollowUp[], count: number }`
   - Each follow-up has: `reason`, `status`, `followUpType` (WAITING_FOR | TODO), `dueDate`, `commitments[]`, `waitingFor[]`, `actionItems[]`, `email.subject`, `email.from`

2. **Component structure:**
   - Keep sidebar (Workspace, All Tasks, Today, Upcoming) as navigation/filter
   - Main area: list of follow-up items grouped or filtered by sidebar selection
   - Each item shows: email subject, reason/commitment, due date, priority chip, status
   - Loading skeleton -> Error alert -> Empty state -> Data list
   - "Today" filter: items where `dueDate` is today
   - "Upcoming" filter: items where `dueDate` is in the future

3. **Translation keys needed:** Extend `tasks` section in `en.ts`/`it.ts` with follow-up-specific labels (e.g., `waitingFor`, `todo`, `overdue`, `noFollowUps`)

### Anti-Patterns to Avoid
- **Testing WebSocket in Playwright browser:** Unreliable for protocol-level assertions. Use standalone Node script with `socket.io-client`.
- **Asserting exact data values in analytics:** Chart data is dynamic. Assert chart elements exist (SVG paths, axis labels) not specific numbers.
- **Creating new backend endpoints for tasks:** Reuse existing follow-up endpoints. No new backend module.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket auth token | Custom JWT library | Existing `RealtimeAuthTokenService` HMAC token | Already built with timing-safe comparison, TTL, session validation |
| Dashboard persistence | localStorage hack | Existing `useSaveDashboardLayout` mutation | Backend API already handles it via user preferences |
| Follow-up data fetching | Raw API calls in component | `usePendingFollowUps()` hook | Already wraps `aiChatApi.getPendingFollowUps` with TanStack Query |
| Webhook signature validation test | Custom crypto code | Just send headers with/without valid tokens | `SyncAuthService.validateWebhookToken` already handles it |

## Common Pitfalls

### Pitfall 1: WebSocket Namespace Mismatch
**What goes wrong:** Socket.IO connection fails silently
**Why it happens:** Gateway is configured with namespace `/realtime`, not root `/`
**How to avoid:** Always connect to `io("${baseUrl}/realtime", { auth: { token }, transports: ["websocket"] })`
**Warning signs:** Connection timeout with no error event

### Pitfall 2: Health Endpoint on Railway May Show "degraded"
**What goes wrong:** Test fails because Mistral API returns "down" or "disabled"
**Why it happens:** Mistral health check depends on `MISTRAL_API_KEY` being configured
**How to avoid:** Assert `status` is `"healthy"` OR `"degraded"` but services.database and services.redis are both `"up"`. Don't hard-assert Mistral is "up".
**Warning signs:** Intermittent failures in CI

### Pitfall 3: Webhook Token May Not Be Configured on Railway
**What goes wrong:** Webhook tests with invalid token still return 200 instead of 401
**Why it happens:** `SyncAuthService.validateWebhookToken` returns (no-op) when `EMAIL_SYNC_WEBHOOK_TOKEN` is not set
**How to avoid:** Check both scenarios: (1) valid payload accepted with 200, (2) if token IS configured, invalid token returns 401. Test the contract, not the env config.
**Warning signs:** Signature rejection tests pass locally but not on Railway

### Pitfall 4: Gmail Webhook Accepts Multiple Auth Schemes
**What goes wrong:** Test assumes one auth path, misses others
**Why it happens:** Gmail webhook accepts: Pub/Sub JWT (Authorization header), webhook token (x-webhook-token header), query token (?token=). If GOOGLE_PUBSUB_AUDIENCE is not set, JWT is accepted with a warning.
**How to avoid:** Test the primary path (valid payload with no auth when tokens aren't configured, or with correct token when they are). Focus on payload acceptance, not auth exhaustiveness.

### Pitfall 5: Microsoft Validation Token Response is Plain Text
**What goes wrong:** Test expects JSON but gets plain text
**Why it happens:** Microsoft Graph webhook validation requires returning the `validationToken` string directly, not wrapped in JSON
**How to avoid:** When testing Microsoft validation, expect content-type text/plain and raw string body

### Pitfall 6: Dashboard Preferences API May Return Empty
**What goes wrong:** Test expects specific widgets but gets all defaults
**Why it happens:** Fresh test user has no saved preferences, so `ALL_WIDGETS` are shown
**How to avoid:** Test the default state first (all 10 widgets visible), then test customization flow

### Pitfall 7: Analytics Consent Gate
**What goes wrong:** Chart never renders, consent prompt shown instead
**Why it happens:** Test user hasn't granted `email_analytics` consent
**How to avoid:** Either (a) grant consent via API before test, or (b) test the consent prompt display first, then navigate to settings to grant, then verify chart

## Code Examples

### WebSocket Connection Test Pattern
```typescript
// Standalone Node script using socket.io-client (already in deps)
import { io } from 'socket.io-client';

const baseUrl = process.env.E2E_API_URL ?? 'http://localhost:3100';

// Step 1: Authenticate via Better Auth to get session cookie
const loginRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const cookies = loginRes.headers.get('set-cookie');

// Step 2: Get realtime auth token
const tokenRes = await fetch(`${baseUrl}/realtime/auth-token`, {
  headers: { Cookie: cookies },
});
const { token } = await tokenRes.json();

// Step 3: Connect Socket.IO
const socket = io(`${baseUrl}/realtime`, {
  auth: { token },
  transports: ['websocket'],
});

socket.on('connected', (data) => {
  // data: { userId, tenantId, email, timestamp }
  // Assert fields present, then disconnect
  socket.disconnect();
});

socket.on('connect_error', (err) => {
  // Test FAILS
});
```

### Health Endpoint Validation Pattern
```typescript
// Playwright API request context
const response = await request.get(`${apiURL}/health`);
expect(response.status()).toBe(200);
const body = await response.json();
expect(body.status).toMatch(/healthy|degraded/);
expect(body.services.database.status).toBe('up');
expect(body.services.redis.status).toBe('up');
expect(body.timestamp).toBeTruthy();

// Ready probe
const ready = await request.get(`${apiURL}/health/ready`);
expect(await ready.json()).toEqual({ status: 'ready' });

// Live probe
const live = await request.get(`${apiURL}/health/live`);
expect(await live.json()).toEqual({ status: 'alive' });
```

### Webhook Contract Test Pattern
```typescript
// Gmail push - valid payload
const gmailPayload = {
  message: {
    data: Buffer.from(JSON.stringify({
      emailAddress: 'test@example.com',
      historyId: '12345',
    })).toString('base64'),
    messageId: `test-${Date.now()}`,
    publishTime: new Date().toISOString(),
  },
  subscription: 'projects/test/subscriptions/test',
};

const res = await request.post(`${apiURL}/webhooks/gmail/push`, {
  data: gmailPayload,
});
// Expect 200 (accepted) or 500 (processing error is ok for contract test)
// The point is: it doesn't reject the shape
expect([200, 500]).toContain(res.status());

// Microsoft validation
const msValidation = await request.post(
  `${apiURL}/webhooks/microsoft/notifications?validationToken=test-token-123`
);
expect(msValidation.status()).toBe(200);
const text = await msValidation.text();
expect(text).toContain('test-token-123');
```

### Tasks Component Pattern (follow-up data)
```typescript
// In Tasks component, consume existing hook
import { usePendingFollowUps } from '@/hooks/queries/use-follow-ups';

const { data, isLoading, error } = usePendingFollowUps(50, false);
const followUps = data?.followUps ?? [];

// Render: Loading skeleton -> Error -> Empty -> List
// Each item: email.subject, reason, dueDate, status chip
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tasks page placeholder | Real follow-up data display | This phase | FE-15 fulfilled |
| No E2E for infrastructure | Contract tests for health/webhooks | This phase | BAPI-20/21/22 fulfilled |

**Existing and unchanged:**
- WebSocket gateway fully implemented (Phase ~40s)
- Health endpoints fully implemented with Prometheus metrics
- Webhook controllers fully implemented with signature validation
- Dashboard with widget registry and backend persistence
- Analytics with consent-gated Recharts

## Open Questions

1. **Railway WebSocket connectivity**
   - What we know: Railway supports WebSocket, gateway configured with CORS and `/realtime` namespace
   - What's unclear: Whether Railway's proxy handles the WebSocket upgrade correctly for `socket.io-client` from an external test runner
   - Recommendation: If WS test fails on Railway, verify CORS origins include the test runner's origin (or use `transports: ['websocket']` to skip long-polling upgrade)

2. **Webhook token configuration on Railway**
   - What we know: `EMAIL_SYNC_WEBHOOK_TOKEN` may or may not be set on Railway deployment
   - What's unclear: Whether contract tests should expect 401 on invalid tokens or 200 (when token is not configured)
   - Recommendation: Test valid payload acceptance (always 200). For signature rejection, conditionally skip if token env var is not detectable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E/browser) + standalone Node scripts (WS) |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test --project chromium <file>` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAPI-20 | Realtime auth token + WS connection | E2E/script | `cd frontend && npx playwright test e2e/websocket.spec.ts --project chromium` | No - Wave 0 |
| BAPI-21 | Health endpoints respond correctly | E2E/API | `cd frontend && npx playwright test e2e/health-endpoints.spec.ts --project chromium` | No - Wave 0 |
| BAPI-22 | Webhook endpoints accept/reject payloads | E2E/API | `cd frontend && npx playwright test e2e/webhooks.spec.ts --project chromium` | No - Wave 0 |
| FE-09 | Dashboard renders, customization works | E2E/browser | `cd frontend && npx playwright test e2e/dashboard.spec.ts --project chromium` | No - Wave 0 |
| FE-15 | Tasks page shows real data | E2E/browser | `cd frontend && npx playwright test e2e/tasks.spec.ts --project chromium` | No - Wave 0 |
| FE-16 | Analytics page renders chart | E2E/browser | `cd frontend && npx playwright test e2e/analytics.spec.ts --project chromium` | No - Wave 0 |
| FE-17 | Landing page all sections | E2E/browser | `cd frontend && npx playwright test e2e/landing.spec.ts --project chromium` | No - Wave 0 |
| FE-18 | Legal pages render | E2E/browser | `cd frontend && npx playwright test e2e/legal.spec.ts --project chromium` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx playwright test e2e/<relevant-file>.spec.ts --project chromium`
- **Per wave merge:** `cd frontend && npx playwright test --project chromium`
- **Phase gate:** All 8 new spec files pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/e2e/websocket.spec.ts` -- covers BAPI-20
- [ ] `frontend/e2e/health-endpoints.spec.ts` -- covers BAPI-21
- [ ] `frontend/e2e/webhooks.spec.ts` -- covers BAPI-22
- [ ] `frontend/e2e/dashboard.spec.ts` -- covers FE-09
- [ ] `frontend/e2e/tasks.spec.ts` -- covers FE-15
- [ ] `frontend/e2e/analytics.spec.ts` -- covers FE-16
- [ ] `frontend/e2e/landing.spec.ts` -- covers FE-17
- [ ] `frontend/e2e/legal.spec.ts` -- covers FE-18
- [ ] Tasks page component rebuild (`frontend/components/dashboard/Tasks.tsx`)
- [ ] Translation keys for follow-up-based tasks (`en.ts`, `it.ts`)

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/realtime/controllers/realtime.controller.ts` -- auth token endpoint shape
- `backend/src/modules/realtime/gateways/realtime.gateway.ts` -- WS gateway config, namespace `/realtime`, auth flow
- `backend/src/modules/realtime/services/realtime-auth-token.service.ts` -- HMAC token format `pmsync.ws.<payload>.<sig>`
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` -- dual auth: HMAC token OR Better Auth cookie
- `backend/src/modules/health/controllers/health.controller.ts` -- 7 health endpoints, all `@Public()`
- `backend/src/modules/health/services/health.service.ts` -- response shapes for system health
- `backend/src/modules/email-sync/controllers/webhook.controller.ts` -- Gmail/Microsoft webhook endpoints
- `backend/src/modules/calendar/controllers/calendar-webhook.controller.ts` -- Calendar webhook endpoints
- `backend/src/modules/contacts/controllers/contacts-webhook.controller.ts` -- Contacts webhook endpoints
- `backend/src/modules/email-sync/interfaces/webhook.interface.ts` -- payload type definitions
- `backend/src/modules/email-sync/services/sync-auth.service.ts` -- webhook token validation logic
- `frontend/components/dashboard/DashboardContainer.tsx` -- widget grid, customization drawer
- `frontend/components/dashboard/dashboard/widget-registry.ts` -- 10 widgets with lazy loading
- `frontend/components/dashboard/Tasks.tsx` -- current placeholder component
- `frontend/components/dashboard/AnalyticsChart.tsx` -- consent gate + Recharts
- `frontend/hooks/queries/use-follow-ups.ts` -- TanStack Query hooks for follow-up data
- `frontend/pages/index.tsx` -- landing page with 6 dynamic sections
- `frontend/e2e/auth.setup.ts` -- existing auth setup pattern
- `frontend/playwright.config.ts` -- test infrastructure configuration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all code read directly from codebase, no external dependencies needed
- Architecture: HIGH - all patterns verified from existing source, no speculation
- Pitfalls: HIGH - derived from actual code behavior (token validation no-op, namespace config, consent gate)
- Test patterns: MEDIUM - WebSocket testing against Railway proxy not yet validated

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable infrastructure, no expected changes)
