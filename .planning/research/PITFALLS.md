# Domain Pitfalls: v4.0 Enterprise Stabilization

**Domain:** Enterprise stabilization of existing NestJS/Next.js AI email platform
**Researched:** 2026-03-03
**Confidence:** HIGH (codebase-verified circular deps, auth store, encryption config, module graph; community patterns from NestJS docs, security research)

---

## Executive Summary

v4.0 is a stabilization milestone on a brownfield codebase with real users. Every task -- circular dep breaking, API contract standardization, auth migration, encrypted search, AI Run Ledger -- is a surgery-on-a-running-patient problem. The system currently works (v3.2 shipped, AI chat functional, email sync stable). The danger is that stabilization work *destabilizes* what is already working.

After auditing the actual codebase (15+ `forwardRef` chains across 12 modules, 18+ files importing `useAuthStore`, 17+ `contains+insensitive` query sites on unencrypted fields, zero `EventEmitter` usage, token passed via `auth` object in Socket.IO, mock data fallbacks in dashboard queries), here are the pitfalls ranked by likelihood of causing production regressions during stabilization.

The single most dangerous mistake: breaking NestJS module injection order by removing `forwardRef` calls without understanding the full dependency chain. The second most dangerous: migrating auth from localStorage to httpOnly cookies without a dual-read transition period -- this will immediately lock out all active sessions.

---

## Critical Pitfalls (Severity: PRODUCTION BREAKAGE)

### CP-1: forwardRef Removal Breaks Runtime Injection Order

**What goes wrong:**
You identify a circular dependency (e.g., `EmailModule <-> ProvidersModule <-> EmailSyncModule`) and refactor to break it using events or shared interfaces. You remove the `forwardRef` wrappers. The app compiles. At runtime, NestJS throws `Nest can't resolve dependencies of <ServiceX>` because the DI container initialization order changed.

**Why it happens:**
NestJS resolves dependencies eagerly during module initialization. `forwardRef` delays resolution, allowing circular references to resolve. When you remove `forwardRef` and restructure modules, the initialization order changes. Services that were registered early (because their module was imported first) may now be registered late, causing injection failures in services that depended on the old order.

**Evidence from codebase:**
- `ProvidersModule` has `forwardRef` to 5 modules: EmailSyncModule, EmailModule, AiModule, CalendarModule, ContactsModule
- `ProviderConfigService` has 6 `@Inject(forwardRef(...))` decorators pointing to services across 4 modules
- `EmailModule` imports `forwardRef(() => ProvidersModule)`, `forwardRef(() => AiModule)`, `forwardRef(() => EmailSyncModule)`, `forwardRef(() => CalendarModule)`
- `AiChatModule` imports `forwardRef(() => EmailModule)`, `forwardRef(() => CalendarModule)`, `forwardRef(() => ContactsModule)`, `forwardRef(() => AiModule)`
- These form a dense mesh, not isolated cycles. Touching one edge shifts load to others.

**Consequences:**
- App fails to start. Zero functionality.
- Error manifests only at bootstrap time, not at compile time.
- NestJS error messages are notoriously vague about *which* dependency in a chain failed.

**Prevention:**
1. Map the complete dependency graph with `madge --circular` BEFORE touching any module.
2. Break ONE cycle at a time. Test app bootstrap after each removal.
3. Use NestJS `EventEmitter2` module to decouple event-producing side from event-consuming side. The producer module emits; the consumer module listens. Neither imports the other.
4. Create `SharedContractsModule` for interface types that both sides reference. Interfaces have no runtime weight.
5. NEVER remove a `forwardRef` without replacing the dependency with an alternative mechanism (event, interface injection, shared module).
6. Keep a rollback commit for each forwardRef removal.

**Detection:**
- Integration test: `app = await NestFactory.create(AppModule)` must pass before any other test.
- Add a CI step that boots the full app (not just compiles).

**Phase:** Architecture Stabilization, first task. Must be done incrementally over multiple sub-phases.

---

### CP-2: localStorage-to-Cookie Auth Migration Locks Out All Active Users

**What goes wrong:**
You switch the backend to issue httpOnly cookies and stop reading the `Authorization: Bearer` header. Every user with an active session (token in localStorage) gets a 401 on their next request. The Zustand persist store still has their token, but it is never sent because the backend expects a cookie it never set.

**Why it happens:**
The current auth flow is deeply entangled across 18+ files:
- `auth-store.ts`: Zustand persist with `createJSONStorage(() => localStorage)` under key `auth-storage`
- `api-client.ts`: Interceptor reads token via `getAuthToken()` from localStorage and sets `Authorization: Bearer`
- `auth-context.tsx`: Rehydrates Zustand on mount, validates token via `GET /auth/me`
- `websocket-client.ts`: Passes token in `auth: { token: this.token }` to Socket.IO
- `auth-token.ts`: Utility that parses localStorage's `auth-storage` JSON
- `pages/api/email/attachments/[id]/download.ts`: Next.js API route reads from cookie OR Authorization header (already dual-path)
- E2E test fixtures: `localStorage.setItem('auth-storage', ...)` for test setup (5+ test files)
- `auth-store.ts` also sets a non-httpOnly `auth-token` cookie via `document.cookie` for img src auth

Changing any one of these without the others creates a split-brain auth state.

**Consequences:**
- All active sessions invalidated (no graceful transition).
- WebSocket connections fail (they use Bearer token, not cookies).
- Next.js API routes that proxy to backend lose their auth mechanism.
- E2E tests break immediately.
- CSRF flow must change because cookies are now the auth bearer, making CSRF protection more critical, not less.

**Prevention:**
1. Phase 1 (Backend): Accept BOTH `Authorization: Bearer` header AND httpOnly cookie. Set cookie on login response. Keep reading header as fallback.
2. Phase 2 (Frontend): On login success, store token in memory only (not localStorage). Backend sets httpOnly cookie. Zustand store keeps user state but NOT token. API client switches to cookie-based auth (`withCredentials: true` already set).
3. Phase 3 (WebSocket): Socket.IO supports cookie auth. Switch `auth: { token }` to cookie-based handshake on the server's WsGuard.
4. Phase 4 (Next.js API routes): Already partially cookie-aware (`req.cookies['auth-token']`). Consolidate to read the new httpOnly cookie name.
5. Phase 5 (Cleanup): Remove localStorage token persistence, `getAuthToken()` utility, old cookie `auth-token` set by `document.cookie`.
6. Phase 6 (E2E): Rewrite test fixtures to use login flow that sets cookies, not `localStorage.setItem`.

**CSRF interaction warning:** The existing CSRF implementation (`GET /auth/csrf-token` -> memory-cached token -> `X-CSRF-Token` header) works with the current setup. With httpOnly cookies carrying auth, CSRF protection becomes essential (currently it is defense-in-depth; with cookies it becomes the primary CSRF defense). Verify CSRF is enforced on ALL mutation endpoints before switching to cookie auth.

**Detection:**
- Write a canary test: login, verify cookie is set, make authenticated request without `Authorization` header, verify it succeeds.
- Monitor 401 rates during rollout.

**Phase:** Auth & Security Hardening. Requires minimum 3 sub-phases with backward-compatible transition.

---

### CP-3: API Response Contract Migration Breaks Frontend Silently

**What goes wrong:**
You standardize the backend response envelope from the current inconsistent mix (`{ success: true, ...data }` in ~half of controllers, raw payload in the rest) to a uniform `{ data, error, meta, requestId }` shape. The frontend keeps working because TanStack Query catches errors, but the data extraction path changes. Components that did `response.data.analytics` now need `response.data.data.analytics`. Some components break visibly; others return undefined and render empty states that look like "no data" rather than "broken."

**Why it happens:**
The frontend has silent fallback patterns that mask backend contract drift. Evidence from codebase:
- `use-dashboard.ts:707`: `emailTrendsOptions()` catches ALL errors and generates mock data (`// Generate mock data from email stats for last 7 days`). If the new envelope changes the shape, it silently falls back to fake data.
- `use-dashboard.ts:317,526,739`: Three dashboard queries with `retry: 0` -- they fail silently on contract mismatch.
- `use-signatures.ts:36`: Returns `[]` on error.
- `use-writing-style.ts:31-32`: Returns `null` on 404 instead of throwing.

These are the exact "silent frontend API fallbacks" the PRD flagged. But removing them BEFORE fixing the backend makes the app fragile. Fixing the backend BEFORE removing them means the fallbacks mask whether the new contract actually works.

**Consequences:**
- Dashboard shows mock data while developers think real data is flowing.
- Empty states that look like "user has no data" rather than "API broke."
- Regression goes undetected for days or weeks until someone notices data looks wrong.

**Prevention:**
1. Add telemetry BEFORE changing contracts: every silent fallback should log a warning to console/telemetry when it triggers. `console.warn('[FALLBACK] emailTrends using mock data, API response:', response)`.
2. Standardize backend contract with a NestJS interceptor that wraps ALL responses. Do NOT change individual controllers.
3. Frontend migration: update `apiClient` response interceptor to unwrap the new envelope globally, so individual query hooks do not need changes.
4. Contract tests (Pact or equivalent): define expected request/response pairs for each endpoint, run against both old and new contract.
5. Remove silent fallbacks LAST, after confirming real data flows through the new contract.

**Detection:**
- Add a response interceptor in `apiClient` that checks if response has both `success` and `data` fields (old format) and logs a deprecation warning.
- Pact contract tests in CI.

**Phase:** API Standardization. Must happen AFTER circular dep breaking (so modules are stable) and BEFORE auth migration (so contract tests cover auth endpoints).

---

## High Pitfalls (Severity: MAJOR FEATURE BREAKAGE)

### HP-1: Encrypted Field Hash Indexes Leak Information via Frequency Analysis

**What goes wrong:**
You implement ENC-03 (hash-based search on encrypted fields like `from`, `subject`, `displayName`) using deterministic SHA-256 hashes. The hash is stored alongside the encrypted value. An attacker with DB access can observe that hash `a1b2c3...` appears 47 times while hash `d4e5f6...` appears 3 times. Cross-referencing with public knowledge (e.g., "the CEO sends more emails than interns"), they identify which hash maps to which sender.

**Why it happens:**
The codebase already has the hash function (`hashForSearch` in `field-encryption.utils.ts:69`):
```typescript
export function hashForSearch(value: string, tenantId: string, salt: string): string {
  const normalized = `${salt}:${tenantId}:${value.toLowerCase().trim()}`;
  return createHash('sha256').update(normalized).digest('hex');
}
```

This is per-tenant salted, which prevents cross-tenant rainbow tables. But within a single tenant, frequency analysis still works because identical inputs produce identical hashes.

**The 17+ query sites** currently doing `contains+insensitive` on plaintext fields include:
- `email-folder.service.ts`: 15+ locations for `from`, `subject`, `bodyText`, folder path matching
- `contacts.service.ts`: `firstName`, `lastName`, `displayName`, `company` search
- `email-crud.service.ts`: VIP email matching on `from`
- `folder-lookup.service.ts`: folder name/path/specialUse matching

**Consequences:**
- Encryption provides false sense of security -- "we encrypt at rest" but hash indexes leak patterns.
- Regulatory risk: GDPR/SOC2 auditors may flag deterministic hashes on PII as insufficient.
- `contains` (substring) search is IMPOSSIBLE with hash indexes. You can only do exact-match. This breaks 12+ query sites that use substring `contains` on `from` and `subject`.

**Prevention:**
1. Accept that hash indexes only support EXACT MATCH, not substring search. Redesign the 12+ `contains` query sites to use alternative search methods (full-text search on a separate search index, or encrypted search via blind indexes with HMAC-based tokens).
2. For exact-match use cases (VIP email lookup, folder specialUse matching), deterministic hashes are acceptable with per-tenant salt.
3. For substring/fuzzy search (email search, contact search), use a separate search layer: either an encrypted search engine (CipherStash Protect was rejected for cloud dependency; consider local blind index approach) or keep a trigram GIN index on a separate non-encrypted search column that contains only non-PII searchable tokens.
4. Document the threat model: "hash indexes protect against offline DB theft; they do not protect against a compromised application server with query access."
5. Never hash fields with low cardinality (e.g., boolean flags, enum status) -- the hash becomes trivially reversible.

**Detection:**
- Security review before deploying hash indexes.
- Automated test: verify that no `contains` query is applied to a hash-indexed field (it would always return zero results).

**Phase:** Performance & Debt (ENC-03). Must be preceded by a search architecture decision: what replaces `contains` queries?

---

### HP-2: AI Run Ledger Adds Latency to Chat Streaming Pipeline

**What goes wrong:**
You insert AI Run Ledger writes into the chat pipeline's `onStepFinish` callback. Each tool call now triggers a Prisma write to the ledger table. The streaming response stutters because the writer is blocked waiting for DB operations.

**Why it happens:**
The current `onStepFinish` callback in `ai-chat.service.ts:241` already does:
1. `conversationService.saveAssistantMessage()` -- await with catch
2. `auditService.logToolExecution()` -- fire-and-forget with catch
3. `hitlService.createPendingAction()` -- await for HITL actions

Adding Run Ledger writes here adds another DB operation per step. With 5 max steps and 2-3 tool calls per step, that is 10-15 additional Prisma operations per chat interaction. Each one is ~5-20ms, adding up to 50-300ms of total latency on a streaming response.

**Consequences:**
- Visible stutter in AI chat responses between tool calls.
- Under load (multiple concurrent chat sessions), DB connection pool pressure increases.
- If ledger write fails, the chat response is interrupted or partially lost.

**Prevention:**
1. AI Run Ledger writes MUST be fire-and-forget (same pattern as current `auditService.logToolExecution()`). Never `await` a ledger write in the streaming path.
2. Better: use BullMQ to enqueue ledger writes. The `onStepFinish` callback emits a lightweight event; a background worker persists it. This decouples chat latency from ledger persistence.
3. Batch ledger writes: collect all step data during the stream, write a single `AiRun` record with nested `AiRunStep` records after the stream completes (in `onStreamFinish` or equivalent).
4. Add a circuit breaker on ledger writes. If the ledger table is slow (migration, index build), the chat pipeline should not degrade.
5. Latency budget: measure chat first-token-time and inter-step-time before and after ledger integration. Regression >50ms is a bug.

**Detection:**
- Benchmark: measure `onStepFinish` callback duration before and after ledger code.
- Alert on p95 chat response time regression.

**Phase:** Enterprise Prep (AI Run Ledger). Schema and contract first; integration with chat pipeline last.

---

### HP-3: Module Boundary Enforcement Blocks Legitimate Cross-Module Needs

**What goes wrong:**
You enforce strict module boundaries by creating interface contracts and forbidding direct cross-module service imports. Then you discover that `ProviderConfigService` legitimately needs 6 services from 4 different modules (`SyncSchedulerService`, `WebhookLifecycleService`, `QueueService`, `GoogleCalendarSyncService`, `MicrosoftCalendarSyncService`, `GoogleCalendarWebhookService`, `MicrosoftCalendarWebhookService`, `StorageService`). The "clean architecture" refactoring either (a) creates a massive interface layer that mirrors the implementation, or (b) blocks the service from functioning.

**Why it happens:**
`ProviderConfigService` is an orchestrator. When a provider is added/removed/updated, it needs to touch sync scheduling, webhook lifecycle, queues, calendar sync, and storage. This is genuine cross-cutting orchestration, not a dependency smell. Forcing it through event-driven patterns means you need to guarantee event ordering and transactional consistency across 6 operations -- which is harder than the original coupling.

**Evidence:**
- `provider-config.service.ts` has 8 `@Inject(forwardRef(...))` decorators
- `ai-chat.service.ts` legitimately needs `EmailModule`, `CalendarModule`, `ContactsModule`, `AiModule` services because AI tools operate across all domains
- `email-sync.module.ts` legitimately needs `ProvidersModule`, `EmailModule`, `AiModule` for sync orchestration

**Consequences:**
- Over-abstraction: interfaces that add indirection without reducing coupling.
- Event ordering bugs: events fire but arrive in wrong order, causing race conditions in provider setup.
- Developer velocity drops: every cross-module call requires an interface update, an event definition, and a handler registration.

**Prevention:**
1. Distinguish between "accidental coupling" and "essential coupling." Use events for accidental coupling (e.g., AI module updating embeddings after email sync). Keep direct injection for essential coupling (e.g., `ProviderConfigService` orchestrating provider lifecycle).
2. Define a "module interface" as the explicit list of services a module exports. Anything not exported is internal. This is already partially done in `email.module.ts:exports`.
3. Create "Orchestrator Services" that are allowed to import from multiple modules. Document them explicitly. They are the exception, not a violation.
4. Lint rule: no non-orchestrator service may import from more than 2 foreign modules.
5. Avoid the "event for everything" anti-pattern. Events are for decoupling independently-evolvable modules. Direct calls are for tightly-coordinated operations.

**Detection:**
- Dependency graph analysis in CI: flag NEW cross-module imports, but allow existing orchestrators.
- Architecture decision record (ADR) required for any new cross-module dependency.

**Phase:** Module Boundaries (v3.2 carry-forward). Define the boundary policy BEFORE enforcing it.

---

### HP-4: v3.2 VoltAgent Deletion Left Behind Unstable Wiring

**What goes wrong:**
v3.2 deleted 167 VoltAgent files and 33K LOC. The new AI SDK v6 layer was built and tested for chat functionality. But edge paths (error recovery, session timeout, HITL action execution after approval, memory/embedding queues triggered by chat context) may have lost wiring that was silently handled by VoltAgent's framework.

**Why it happens:**
When you delete a framework and rebuild, you reproduce the features you know about. The features you do not know about -- the ones that "just worked" because the framework handled them -- are the ones that break weeks later.

**Evidence:**
- v3.2 closed "partial" (20/25 plans). 5 plans were carried to v4.0.
- Phase 28 gap closure items: "chat 403, dead polling cleanup" -- these are symptoms of incomplete wiring.
- `AiChatModule` imports 4 modules via `forwardRef` -- these dependency chains were rebuilt, but may have subtle ordering differences from the VoltAgent era.

**Consequences:**
- Intermittent 403 errors in chat (already observed in Phase 28 gaps).
- Embedding queue stops processing after chat service restart.
- HITL actions approved by user but never executed (wiring between approval and execution lost).

**Prevention:**
1. Comprehensive smoke test suite for ALL AI paths: chat, HITL approve/reject, embedding triggers, memory retrieval, rate limiting, circuit breaker trip and recovery.
2. Monitor HITL action execution rate: approved actions should have >99% execution rate. Drop below 95% = alarm.
3. Test chat session persistence: create session, send 5 messages, restart backend, verify history loads.
4. Dead polling audit: identify any polling loops from pre-v3.2 that were not cleaned up.

**Detection:**
- E2E test: full chat flow with tool call -> HITL approval -> action execution.
- Health check endpoint that verifies AI pipeline connectivity (model reachable, embedding queue active, conversation table writable).

**Phase:** Phase 28 gap closure (immediate). Must be resolved BEFORE adding AI Run Ledger.

---

## Moderate Pitfalls (Severity: FUNCTIONALITY DEGRADED)

### MP-1: WebSocket Auth Migration Breaks Realtime for Connected Users

**What goes wrong:**
You migrate auth to httpOnly cookies. WebSocket connections currently pass the JWT via `auth: { token: this.token }` in the Socket.IO handshake. If the frontend stops storing the token in memory/localStorage, it cannot pass it to Socket.IO. The WebSocket gateway's auth guard expects a token in the handshake.

**Why it happens:**
Socket.IO over WebSocket does NOT automatically send cookies during the WebSocket upgrade handshake (only during the initial HTTP polling transport). If `transports: ['websocket', 'polling']` is configured (it is, in `websocket-client.ts:338`), the polling transport sends cookies, but the WebSocket upgrade does not.

**Consequences:**
- Realtime email notifications stop.
- Sync status updates invisible.
- AI action events not delivered.
- Users see stale data until they manually refresh.

**Prevention:**
1. Socket.IO polling transport DOES send cookies. Configure the WebSocket gateway to read auth from cookie (same httpOnly cookie) during the polling handshake phase.
2. Alternatively, the backend can issue a short-lived WebSocket-specific token via an API call, which the frontend passes in the handshake `auth` object. This decouples WebSocket auth from cookie auth.
3. Test with `transports: ['polling']` first to verify cookie-based auth works, then re-enable WebSocket transport.

**Phase:** Auth & Security Hardening (sub-phase 3 of auth migration).

---

### MP-2: Performance Optimization Regresses Functionality

**What goes wrong:**
You optimize LCP/TTI by aggressive code-splitting, removing unused imports, or deferring component hydration. A component that was eagerly loaded now loads lazily. The component's initialization code (e.g., WebSocket connection setup in Layout, auth rehydration in `_app.tsx`) runs later than expected, causing a race condition where data-fetching components mount before auth is ready.

**Why it happens:**
The auth flow has a precise timing requirement:
1. `_app.tsx` renders `AuthProvider`
2. `AuthProvider` calls `useAuthStore.persist.rehydrate()` to load token from localStorage
3. Auth context validates token via `GET /auth/me`
4. Only then do data-fetching components have a valid token

If code-splitting moves `AuthProvider` or the Layout component to a lazy chunk, the rehydration happens later. Components that mount during the initial server-render or first client paint will not have auth context.

**Consequences:**
- Flash of unauthenticated content followed by redirect to login.
- Race condition: API calls fire before token is available, get 401, trigger logout.
- Lighthouse metrics improve but user experience degrades.

**Prevention:**
1. Auth provider, layout shell, and route guard MUST be in the critical path (not lazy-loaded).
2. Performance optimization must target leaf components (widgets, charts, editors), not infrastructure.
3. Before/after testing: measure LCP/TTI AND functional correctness. Performance PR must include E2E test passing, not just Lighthouse score.

**Phase:** Performance & Debt. Must have E2E regression gate.

---

### MP-3: CSRF Flow Becomes Critical After Cookie Migration

**What goes wrong:**
Currently, CSRF protection is defense-in-depth: the JWT is in the `Authorization` header, so a CSRF attack cannot forge a request because it cannot set custom headers from a cross-origin form submission. After migrating to httpOnly cookies, the browser automatically attaches the auth cookie to all same-site requests. A cross-origin form submission now carries valid auth credentials.

**Why it happens:**
The existing CSRF implementation (`GET /auth/csrf-token` -> cached in memory -> `X-CSRF-Token` header on mutations) works, but it has a silent failure mode: if `getCsrfToken()` fails (line 57-61 in `api-client.ts`), it returns `''`, and the request proceeds WITHOUT a CSRF token. If the backend does not enforce CSRF on all mutation endpoints, the request succeeds. Currently this is acceptable because Bearer token auth prevents CSRF. After cookie migration, it is not.

**Consequences:**
- CSRF attacks become viable if any mutation endpoint lacks CSRF enforcement.
- Silent CSRF token fetch failures (`catch => return ''`) mean the app works but is unprotected.

**Prevention:**
1. BEFORE cookie migration: audit every mutation endpoint for CSRF guard.
2. Make CSRF token fetch failure a hard error (throw, not swallow).
3. Backend: enforce CSRF on ALL POST/PUT/DELETE/PATCH endpoints, no exceptions.
4. Backend: validate CSRF token strictly -- reject requests with missing or empty token.

**Phase:** Auth & Security Hardening. Must be completed BEFORE switching auth to cookies.

---

### MP-4: Event-Driven Decoupling Without EventEmitter Infrastructure

**What goes wrong:**
The plan to break circular deps recommends "replace cyclic imports with event contracts." You add `@nestjs/event-emitter` and start emitting domain events. But the codebase has ZERO existing `EventEmitter` usage. Every developer needs to learn a new pattern. Events that require transactional consistency (e.g., "email synced -> trigger embedding") lose their transactional guarantees because the event fires after the transaction commits, but the consumer may fail.

**Evidence:**
- `grep EventEmitter backend/src` returns zero results.
- `grep @OnEvent backend/src` returns zero results.
- All current cross-module communication is synchronous service injection.

**Consequences:**
- Inconsistent adoption: some modules use events, others use direct calls, creating TWO dependency patterns.
- Lost events: if the event handler throws, the emitter does not know and the operation appears to succeed.
- Debugging difficulty: stack traces stop at the event emission point.

**Prevention:**
1. Start with `@nestjs/event-emitter` for non-critical, fire-and-forget operations: embedding triggers, audit logging, analytics updates.
2. Keep synchronous service injection for operations requiring transactional consistency.
3. Adopt the "outbox pattern" for events that must be reliably delivered: write event to an outbox table in the same transaction, then a background worker processes the outbox.
4. Create a shared `DomainEvent` base class with `eventId`, `timestamp`, `tenantId`, `sourceModule`.
5. Add event handler error logging at the infrastructure level (global `@OnEvent('**')` handler that catches unhandled errors).

**Phase:** Architecture Stabilization. Introduce EventEmitter as part of the circular dep breaking, but only for non-critical paths first.

---

## Minor Pitfalls (Severity: DEVELOPER FRICTION / DELAYED DELIVERY)

### mP-1: Madge Circular Dependency Count is Misleading

**What goes wrong:**
The target is "reduce from 15 to <=5 circular dependencies." You run `madge --circular` and it reports 15 cycles. You break 10 of them. Then you discover that the remaining 5 are the hardest ones (the dense mesh around Email/Providers/EmailSync), and they account for 80% of the `forwardRef` usage.

**Prevention:** Prioritize by impact, not count. The Email/Providers/EmailSync/AiModule mesh is the critical cluster. Breaking even 2 cycles in that mesh is worth more than breaking 10 peripheral cycles.

---

### mP-2: E2E Test Suite Assumes localStorage Auth

**What goes wrong:**
All Playwright E2E tests set auth via `localStorage.setItem('auth-storage', ...)`. After auth migration, these tests fail because the app no longer reads from localStorage. Rewriting all test fixtures is a multi-day effort that blocks E2E CI.

**Evidence:** 5+ test files (`auth.setup.ts`, `fixtures.ts`, `compose.spec.ts`, `email-list.spec.ts`) use this pattern.

**Prevention:** Create a test helper that abstracts auth setup. Initially it uses localStorage; later it uses cookie injection. Change one helper, all tests work.

---

### mP-3: Mixed Component Library Creates Theme Conflicts

**What goes wrong:**
The codebase uses MUI for dashboard and shadcn/ui (Tailwind) for email views. Performance optimization or module boundary work may merge component boundaries, causing MUI's CSS-in-JS to conflict with Tailwind's utility classes, or theme tokens to desync.

**Prevention:** Keep the component library boundary explicit: MUI components NEVER import Tailwind utilities and vice versa. Use `ai-elements/` (Tailwind) and `dashboard/` (MUI) as hard boundaries.

---

### mP-4: Hash Migration for Encrypted Fields Requires Data Backfill

**What goes wrong:**
You add `fromHash`, `subjectHash` columns to the `Email` table and create hash indexes. But existing emails (potentially millions of rows) do not have hash values populated. Every search on the new hash index returns zero results until the backfill completes.

**Prevention:**
1. Background backfill job with rate limiting (similar to existing `EmbeddingBackfillService` pattern).
2. Dual-path search: if hash column is null, fall back to plaintext `contains` search. Only use hash index when the column is populated.
3. Backfill progress tracking with health endpoint.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Circular dep breaking | Runtime injection failure after forwardRef removal (CP-1) | Critical | One cycle at a time, boot test after each change |
| Circular dep breaking | Event-driven pattern without EventEmitter infrastructure (MP-4) | Moderate | Start with fire-and-forget events only |
| API standardization | Silent frontend fallbacks mask contract drift (CP-3) | Critical | Add telemetry to fallbacks BEFORE changing contracts |
| API standardization | Response envelope change breaks 50% of query hooks | High | Global interceptor on backend, global unwrap on frontend |
| Auth migration | Session lockout during transition (CP-2) | Critical | Dual-read transition period (header + cookie) |
| Auth migration | WebSocket auth breaks (MP-1) | Moderate | Polling transport reads cookies; test first |
| Auth migration | CSRF becomes mandatory (MP-3) | Moderate | Audit all mutation endpoints BEFORE cookie switch |
| Auth migration | E2E tests break (mP-2) | Minor | Abstract auth setup into helper |
| ENC-03 hash search | Substring search impossible with hash (HP-1) | High | Search architecture decision first |
| ENC-03 hash search | Frequency analysis leaks patterns (HP-1) | High | Document threat model, accept for exact-match |
| ENC-03 hash search | Backfill gap during migration (mP-4) | Minor | Dual-path search with plaintext fallback |
| AI Run Ledger | Streaming latency from synchronous writes (HP-2) | High | Fire-and-forget or BullMQ for writes |
| Module boundaries | Over-abstraction kills developer velocity (HP-3) | High | Allow orchestrator exceptions |
| Module boundaries | Madge count is misleading metric (mP-1) | Minor | Prioritize by impact, not count |
| v3.2 carry-forward | VoltAgent deletion left broken wiring (HP-4) | High | Smoke test all AI paths before adding features |
| Performance optimization | Auth race condition from lazy loading (MP-2) | Moderate | Never lazy-load auth infrastructure |
| Performance optimization | Functionality regression masked by better metrics (MP-2) | Moderate | E2E must pass alongside Lighthouse |

---

## Recommended Pitfall Resolution Order

1. **HP-4 first** (v3.2 stability verification) -- verify what is working before changing anything
2. **CP-1** (circular deps) -- foundational architecture must be stable before other changes
3. **CP-3** (API contracts) -- standardize the contract layer that all other features depend on
4. **CP-2** (auth migration) -- requires stable API contracts for testing
5. **HP-1** (encrypted search) -- needs search architecture decision that informs API contracts
6. **HP-2** (AI Run Ledger) -- needs stable AI pipeline (depends on HP-4) and stable module boundaries

---

## Sources

- NestJS circular dependency docs: [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)
- LogRocket guide: [How to avoid circular dependencies in NestJS](https://blog.logrocket.com/avoid-circular-dependencies-nestjs/)
- DEV.to event-driven decoupling: [Get Rid of Tightly Coupled Modules and Circular Dependencies in NestJS](https://dev.to/kishieel/get-rid-of-tightly-coupled-modules-and-circular-dependencies-in-nestjs-3do1)
- Next.js httpOnly cookie auth: [Next.js: Using HTTP-Only Cookies for Secure Authentication](https://maxschmitt.me/posts/next-js-http-only-cookie-auth-tokens)
- NestJS + Next.js auth guide: [Complete Authentication Guide with Nest.js](https://www.wisp.blog/blog/how-to-use-nextjs-as-a-front-end-framework-a-complete-authentication-guide-with-nestjs)
- Encrypted search leakage: [Understanding Leakage in Searchable Encryption](https://eprint.iacr.org/2024/1558.pdf)
- Searchable encryption pitfalls: [Attack of the week: searchable encryption](https://blog.cryptographyengineering.com/2019/02/11/attack-of-the-week-searchable-encryption-and-the-ever-expanding-leakage-function/)
- IronCore encrypted search: [IronCore Labs Encrypted Search](https://ironcorelabs.com/docs/data-control-platform/concepts/encrypted-search/)
- API contract management: [Managing API Changes: 8 Strategies (2026)](https://www.theneo.io/blog/managing-api-changes-strategies)
- API versioning best practices: [Best practices for versioning API contracts](https://proteinshaikh.medium.com/best-practices-for-versioning-api-contracts-to-avoid-breaking-changes-a54fbc6d469d)
- Codebase evidence: direct audit of `backend/src/modules/*/`, `frontend/stores/auth-store.ts`, `frontend/lib/api-client.ts`, `frontend/hooks/queries/use-dashboard.ts`, `backend/src/prisma/encryption/`
