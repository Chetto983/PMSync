# Project Research Summary

**Project:** PMSync v4.0 Enterprise Stabilization
**Domain:** Brownfield enterprise stabilization of a NestJS/Next.js AI email platform
**Researched:** 2026-03-03
**Confidence:** HIGH (codebase-verified findings, all npm versions confirmed, official NestJS/Next.js docs cross-referenced)

## Executive Summary

PMSync v4.0 is a surgical stabilization milestone, not a feature expansion. The platform scored 58/100 on the March 2026 enterprise readiness audit. The v3.2 AI rebuild shipped functional AI chat but carried forward three categories of debt that block enterprise sales: architectural coupling (17 circular `forwardRef` edges across 12 modules), security gaps (localStorage JWT storage, mixed AES cipher modes, plaintext searchable PII fields), and API contract inconsistency (mixed response shapes across 32 controllers, 24 of 32 routes unversioned). The recommended approach applies three decoupling mechanisms in sequence — event bus for fire-and-forget cross-module notifications, interface injection tokens for return-value queries, and a global tool registry for AI chat — followed by API standardization, auth hardening, and data layer corrections. No framework swaps, no major version bumps. The stack (NestJS 11, Prisma 7, Next.js 16, AI SDK v6) is correct and stable. The work is wiring discipline.

The biggest technical risks are (1) removing `forwardRef` calls without understanding the full DI initialization graph, which can silently crash the app at bootstrap with vague "can't resolve dependencies" errors, and (2) migrating auth from localStorage to httpOnly cookies without a dual-read transition period, which will lock out all active sessions immediately. Both are solved by incrementalism: break one cycle at a time with a boot test after each removal, and run auth in dual-mode for two weeks before cutting over. The secondary risks are API contract drift masked by frontend silent fallbacks (three dashboard queries silently generate mock data on API failure), and the ENC-03 encrypted search implementation being technically limited to exact-match only — substring search on encrypted fields requires a full searchable encryption infrastructure that is out of scope for v4.0.

Five new dev/runtime dependencies are all that is required across the entire v4.0 scope. All other changes — httpOnly cookie migration, API response envelope, AI Run Ledger, blind indexes — are codebase work using already-installed packages. The infrastructure for most features already exists but is unwired or half-implemented: `CorrelationInterceptor` exists but is not registered globally, `hashForSearch()` exists but is explicitly commented "reserved for future Tier 2", `cookie-parser` is installed but cookies are not set httpOnly on login.

---

## Key Findings

### Recommended Stack

The existing stack requires no changes. Five additions address specific stabilization gaps that cannot be solved with existing tooling.

**Core technologies (existing, no changes):**
- **NestJS 11 + Prisma 7**: Backend foundation — stable, correct, no version changes needed
- **Next.js 16 + AI SDK v6**: Frontend and AI pipeline — rebuilt in v3.2, functional
- **PostgreSQL + Redis/BullMQ**: Data and queue layer — production-stable
- **`cookie-parser` 1.4.7 + `csrf-csrf` 4.0.3**: Already installed — httpOnly cookie migration requires no new packages, only code changes in `auth.controller.ts`, `auth-store.ts`, and `api-client.ts`
- **`@nestjs/swagger` 11.2.6**: OpenAPI already generated from 51+ files with 684 decorator occurrences — needs linting, not regeneration

**New additions (5 packages, all verified 2026-03-03 via npm view):**
- **`@nestjs/event-emitter` ^3.0.1** (backend runtime): Official NestJS event bus wrapping EventEmitter2; replaces `forwardRef` circular chains with domain events; peer deps confirmed compatible with NestJS 11.1.13
- **`dependency-cruiser` ^17.3.8** (backend devDep): CI-enforced module boundary rules with forbidden dependency patterns; madge detects cycles but cannot block them — dependency-cruiser blocks them
- **`@stoplight/spectral-cli` ^6.15.0** (backend devDep): OpenAPI spec linting via CLI; no account or server required; validates generated Swagger output for response consistency and naming conventions
- **`@pact-foundation/pact` ^16.2.0** (frontend devDep): Consumer-driven contract testing foundation; frontend defines expected API shapes, backend verifies it can fulfill them
- **`openapi-typescript` ^7.6.1** (frontend devDep): Generates TypeScript types from `/api/docs-json`; adopted incrementally alongside existing `apiClient` + TanStack Query pattern without rewrite

**Rejected additions (evaluated and excluded):**
- CASL RBAC library: define permission taxonomy and `PolicyService` interface first; pick the implementation library in v4.1 after the model is designed
- OpenTelemetry: `CorrelationInterceptor` already exists but is not globally registered; wire it first, full OTel in Phase 3 of PRD
- `openapi-generator-cli`: full client codegen would force a rewrite of all `lib/api/*.ts` modules; `openapi-typescript` (types only) is sufficient

### Expected Features

Research established a three-wave prioritization derived from dependency analysis of the codebase. Wave 1 is the prerequisite layer — nothing else lands cleanly without stable module boundaries, a uniform API contract, and globally-wired correlation IDs.

**Must have (P1 — enterprise readiness blockers):**
- **API response envelope + error taxonomy**: Uniform `{ data, meta, requestId }` success and `{ error: { code, message, details }, meta }` error shapes; currently 50% raw payloads, two conflicting exception filters returning different shapes, zero machine-readable error codes
- **API versioning policy enforcement**: 24 of 32 controllers unversioned; enterprise integrators require deprecation windows; solved by `app.setGlobalPrefix('api/v1')` in `main.ts`
- **Correlation ID global wiring**: `CorrelationInterceptor` exists but is not registered in `AppModule`; wire it globally and propagate `requestId` through BullMQ jobs and AI run records
- **Module boundary formalization**: Define `IStorageService`, `ISyncAuthService`, `IProviderTokenService` injection token interfaces; these interfaces are the prerequisite for breaking cycles without losing functionality
- **Circular dependency reduction** (17 forwardRef edges to 3-5): Three mechanisms in sequence — event bus for fire-and-forget notifications (eliminates 7-9 edges), interface injection for return-value queries (eliminates 3-4 edges), ToolRegistryService for AI tools (eliminates 4 edges)
- **httpOnly cookie migration**: `auth-store.ts` stores JWT in localStorage via Zustand `persist` middleware; every enterprise security audit flags this as XSS blast radius; backend already supports cookie extraction in `jwt.strategy.ts` — migration is primarily a frontend change
- **ENC-03 blind indexes on encrypted fields**: `hashForSearch()` utility exists but explicitly commented "reserved for future Tier 2 implementation"; 17+ query sites search plaintext PII fields; exact-match blind indexes on `from` field are feasible in v4.0; substring search on encrypted fields is not (requires full searchable encryption infrastructure)

**Should have (P2 — strengthens enterprise story):**
- **AI Run Ledger schema + telemetry**: No competitor in AI email (Superhuman, Shortwave, Front) has run-level audit trail; token cost already partially tracked in `ai-chat.service.ts`; schema addition + fire-and-forget telemetry wiring is the v4.0 scope; UI deferred to Phase 3
- **Frontend performance** (LCP <2.5s, TTI <3.5s): Currently ~4.1s TTI, failing Lighthouse "Good" threshold; `lighthouserc.js` CI config exists with correct thresholds but they are violated; bundle splitting and dynamic imports are the fix
- **Permission taxonomy definition**: Document `email:read`, `email:send`, `calendar:manage`, `ai:chat`, `admin:tenant` resource:action pairs and create `PolicyService` interface; zero implementation risk, pure TypeScript definition
- **Silent fallback elimination + degraded-state telemetry**: Three dashboard queries use `retry: 0` and silently return mock data on failure; replacing with explicit error states surfaces backend contract drift

**Defer to v4.1+ (anti-features for this milestone):**
- Full ABAC policy engine: needs CRM object model first (PRD Phase 2); implementing before the object model exists is premature abstraction
- AI Run Ledger UI (run timeline, cost panel, replay): needs schema to collect production data before the right UI is knowable
- OpenTelemetry distributed tracing: correlation IDs first; full OTel requires infrastructure (Jaeger/Tempo) and is PRD Phase 3
- Database-level Row-Level Security: Prisma 7 + PostgreSQL RLS interaction is notoriously painful; keep `TenantGuard` app-level enforcement and add tenant-leak negative tests instead
- Compliance evidence pipeline: document existing controls informally; build the pipeline when pursuing actual SOC2 certification

### Architecture Approach

The stabilization preserves the modular monolith and introduces three decoupling mechanisms to untangle the 17-edge circular dependency mesh without changing the runtime topology. The Email/Providers/EmailSync/AiModule cluster is the highest-impact target — the `ProvidersModule` alone accounts for 5 forwardRef edges and currently imports all its consumers, inverting the dependency direction. The decoupling strategy is explicit: domain events replace fire-and-forget cross-module calls; injection tokens replace direct service imports where return values are needed; the ToolRegistryService eliminates all four of AiChatModule's domain module forwardRefs entirely. The API response envelope change is implemented as a single global interceptor (approximately 40 lines) registered once in AppModule, not as 32 individual controller rewrites.

**Major components (new or significantly modified):**
1. **EventEmitterModule + domain event types** (`common/events/`) — typed events `EmailSyncedEvent`, `ProviderConnectedEvent`, `ContactUpdatedEvent`, `CalendarIcsDetectedEvent` decouple producers from consumers; EventEmitter2 wildcard patterns enable `email.*` subscriptions
2. **Interface contracts** (`common/interfaces/`) — `IStorageService` (token: `STORAGE_SERVICE`), `ISyncAuthService` (token: `SYNC_AUTH_SERVICE`), `IProviderTokenService` (token: `PROVIDER_TOKEN_SERVICE`); abstract tokens registered in provider modules, consumed without module imports
3. **ToolRegistryModule** (`common/ai/`) — global module; domain modules call `toolRegistry.register('email', fn)` in `onModuleInit()`; AiChatModule calls `getAllTools(tenantId, userId)` at runtime with zero domain module imports
4. **ResponseEnvelopeInterceptor** (`common/interceptors/`) — wraps all success responses in `{ data, meta: { requestId, timestamp } }`; `@SkipEnvelope()` decorator for SSE/streaming endpoints including `ai/chat`
5. **Unified ApiExceptionFilter** (`common/filters/`) — replaces two conflicting filters; emits `{ error: { code, message, details }, meta: { requestId, timestamp } }` with machine-readable error codes per domain
6. **AiRunLedgerService** + Prisma `AiRunLedger` model — fire-and-forget writes (BullMQ enqueue or `catch`-swallowed); captures `runType`, `model`, token counts, `estimatedCostUsd`, `latencyMs`, `toolCallCount`, `hitlRequired`, `requestId`, `parentRunId`
7. **Hash-based blind indexes** (`prisma/encryption/`) — HMAC-SHA256 on `from` field for exact-match sender lookup; `hashForSearch()` utility already exists; `subject` intentionally left plaintext in v4.0 because substring search is critical for UX and incompatible with deterministic hashing

**Data flow before vs. after:**
- Before: `Frontend (localStorage JWT, Authorization: Bearer header) -> Mixed API paths (some /api/v1/, most bare) -> Raw controller payloads, two conflicting exception filter shapes -> 17 forwardRef service graph -> No AI run telemetry -> Database (bodyText/bodyHtml encrypted, from/subject plaintext)`
- After: `Frontend (httpOnly cookie, withCredentials: true) -> api/v1/* prefix (global) -> ResponseEnvelopeInterceptor ({ data/error, meta, requestId }) -> EventBus + interface injection + ToolRegistry -> AiRunLedger fire-and-forget -> Database (from encrypted + blind index, AI Run Ledger, subject plaintext)`

### Critical Pitfalls

The five most dangerous failure modes, ordered by likelihood of causing production regressions:

1. **forwardRef removal crashes the app at bootstrap (CP-1)** — NestJS resolves dependencies eagerly during module initialization; `forwardRef` delays resolution. When wrappers are removed and module structure changes, the initialization order shifts. The app compiles successfully but fails at runtime with vague "Nest can't resolve dependencies of X" errors. Prevention: map the full dependency graph with `madge --circular` before touching any module; remove one cycle at a time; run a full `NestFactory.create(AppModule)` boot test after each removal; never remove a `forwardRef` without a replacement mechanism already verified in place.

2. **Auth migration locks out all active sessions (CP-2)** — Switching the backend to set httpOnly cookies and stopping the `Authorization: Bearer` header readthrough will immediately invalidate every existing session. The token is currently referenced across 18+ files (Zustand persist to localStorage, `api-client.ts` interceptor, `websocket-client.ts` Socket.IO `auth` object, `auth-token.ts` utility, 5+ E2E test fixtures). Prevention: three-phase transition — backend sets httpOnly cookies AND continues accepting Bearer header; frontend migrates to `withCredentials: true`; then Bearer readthrough is removed. Minimum two weeks between Phase 1 and Phase 3 of the migration.

3. **API contract change masked by frontend silent fallbacks (CP-3)** — The new response envelope changes the data extraction path (`response.data.analytics` becomes `response.data.data.analytics`). Three dashboard queries in `use-dashboard.ts` silently generate mock data on any error, making broken contracts look like empty data. Prevention: add `console.warn` telemetry to every silent fallback BEFORE changing the backend contract; update `apiClient` response interceptor to unwrap the envelope globally so individual query hooks require no changes; remove fallbacks only after confirming real data flows through the new contract shape.

4. **ENC-03 blind indexes cannot support substring search (HP-1)** — Deterministic HMAC-SHA256 hashes support exact-match lookups only. Of the 17+ query sites using `contains+insensitive` on PII fields, most use substring patterns (email search bar, contact search). Encrypting `subject` and adding a blind index would return zero results for every non-exact search. Prevention: architecture decision recorded before schema changes land — `subject` stays plaintext in v4.0; only `from` (email address) gets a blind index for exact VIP/sender matching. Full searchable encryption (trigram HMAC or dedicated engine) is a v5.0 scope item.

5. **AI Run Ledger adds streaming latency if written synchronously (HP-2)** — The `onStepFinish` callback in `ai-chat.service.ts` already chains three DB operations per step; adding synchronous ledger writes adds 50-300ms per chat turn under concurrent load. Prevention: fire-and-forget pattern only (same as existing `auditService.logToolExecution()`) — never `await` a ledger write in the streaming code path; alternatively enqueue via BullMQ so chat latency is fully decoupled from persistence; measure first-token-time and inter-step-time before and after integration, treat >50ms regression as a bug.

---

## Implications for Roadmap

Research establishes a clear dependency chain. The ARCHITECTURE.md build order is the most authoritative guide; this section synthesizes findings from all four research files into consolidated phase recommendations.

### Phase 1: Stability Verification and Foundation Infrastructure (Weeks 1-2)

**Rationale:** Before changing anything on a working production system, verify what is actually working. v3.2 closed 20/25 plans with 5 carried forward. Phase 28 chat 403 errors and dead polling are symptoms of incomplete wiring from the VoltAgent deletion — these must be diagnosed before additional AI observability layers are added on top of broken foundations (HP-4 from PITFALLS.md). Foundation infrastructure additions are purely additive with zero existing code changes.

**Delivers:**
- Confirmed smoke test results for all AI paths: chat, HITL approve/reject, embedding queue triggers, session persistence after backend restart
- Phase 28 gap items diagnosed and resolved
- `@nestjs/event-emitter` installed, `EventEmitterModule.forRoot()` in AppModule
- Domain event type files created in `common/events/` (email.events.ts, provider.events.ts, contact.events.ts, calendar.events.ts) — type definitions only, no producers or consumers yet
- Interface contracts created in `common/interfaces/` — `IStorageService`, `ISyncAuthService`, `IProviderTokenService` — no wiring yet
- ToolRegistryModule and ToolRegistryService created in `common/ai/` — no domain registrations yet
- `AiRunLedger` Prisma schema added and migration run — no service wiring yet
- `dependency-cruiser` installed in warn-only mode with baseline `.dependency-cruiser.cjs` config

**Addresses (FEATURES.md):** Phase 28 gap closure, AI Run Ledger schema foundation
**Avoids:** HP-4 (diagnose v3.2 wiring gaps before adding AI observability), CP-1 (map the graph before touching any module)
**Research flag:** No additional research needed — standard patterns throughout

### Phase 2: Architecture Decoupling (Weeks 2-4)

**Rationale:** Module boundaries must be stable before API standardization, because the API surface spans module boundaries. Attempting API changes while circular dependency refactoring is in progress creates mid-stream breakage. FEATURES.md Wave 1 dependency graph: "Module Boundary Formalization must precede Circular Dependency Breaking." The ProvidersModule cluster (5 forwardRef edges) is the highest-priority target; the AiChatModule tool registry migration (4 edges) is the second highest.

**Delivers:**
- ProvidersModule decoupled: emits `provider.connected/disconnected/updated` events; all 5 consumer module imports removed
- AiChatModule decoupled: domain modules register tools via `toolRegistry.register()` in `onModuleInit()`; AiChatModule reads from ToolRegistryService; zero domain module forwardRefs remain in AiChatModule
- ISyncAuthService interface extracted: CalendarModule and ContactsModule depend on abstract token, not on EmailSyncModule directly
- IStorageService interface extracted: AiModule accesses attachment storage via interface, not via EmailModule forwardRef
- `email.created`, `email.deleted`, `email.synced`, `calendar.ics.detected`, `contact.updated` events wired (producers emit, consumers listen)
- forwardRef count: 17 to 3-5 (remaining: Tenants/Compliance for GDPR cascade, Users/EmailSync for profile sync, ScheduledJobs/Compliance for retention — these are acceptable orchestrator coupling)
- `dependency-cruiser` switched to error mode in CI: violations block PR merge

**Addresses (FEATURES.md):** Module boundary formalization, circular dependency reduction, event-driven domain decoupling
**Uses (STACK.md):** `@nestjs/event-emitter`, `dependency-cruiser`
**Avoids:** CP-1 (one cycle at a time with boot test after each), HP-3 (ProviderConfigService is an orchestrator — it is allowed to coordinate multiple modules; distinguish essential coupling from accidental coupling), MP-4 (events for fire-and-forget only; direct injection for transactional consistency)
**Research flag:** No additional research needed — well-documented NestJS patterns with official examples

### Phase 3: API Contract Standardization (Weeks 3-5)

**Rationale:** After module boundaries are clean, standardize the API surface that spans those modules. FEATURES.md Wave 1 establishes the API contract as the layer everything downstream depends on — frontend error handling, contract validation, silent fallback removal, and OpenAPI snapshot testing all require a stable, uniform contract to test against. Correlation ID wiring in this phase is the prerequisite for meaningful AI Run Ledger entries in Phase 5.

**Delivers:**
- `ResponseEnvelopeInterceptor` registered as `APP_INTERCEPTOR` in AppModule; `@SkipEnvelope()` decorator for SSE/streaming endpoints
- Unified `ApiExceptionFilter` replacing both `AllExceptionsFilter` and `HttpExceptionFilter`; machine-readable error codes per domain (`EMAIL_NOT_FOUND`, `AUTH_TOKEN_EXPIRED`, `AI_RATE_LIMITED`, `TENANT_FORBIDDEN`, etc.)
- `app.setGlobalPrefix('api/v1')` in `main.ts` with webhook paths excluded
- Manual `api/v1/` prefixes removed from 8 controllers (6 dual-routed, 2 manually prefixed)
- `CorrelationInterceptor` globally registered in AppModule (currently exists, not wired)
- Frontend `apiClient` base URL updated; global response interceptor unwraps envelope so no individual query hook changes needed
- Silent fallbacks instrumented with telemetry warnings before contract change, then progressively removed after validation
- OpenAPI spec exported to `docs/openapi.json` and committed; `@stoplight/spectral-cli` linting added to CI
- `openapi-typescript` generating `frontend/types/api.generated.ts`; incremental adoption in existing api module files

**Addresses (FEATURES.md):** API response envelope, error taxonomy, API versioning policy, correlation ID propagation, silent fallback elimination
**Uses (STACK.md):** `@stoplight/spectral-cli`, `openapi-typescript`, `@pact-foundation/pact` (first contract tests written)
**Avoids:** CP-3 (telemetry on fallbacks BEFORE contract change; global apiClient unwrap so hooks need no individual changes)
**Research flag:** No additional research needed — NestJS interceptor/filter patterns are well-documented

### Phase 4: Auth Security Hardening (Weeks 4-6)

**Rationale:** Depends on API standardization. CORS configuration and the now-stable response format must be locked before cookie auth is layered on top. CSRF changes from defense-in-depth to primary defense mechanism after cookie migration, so a full CSRF enforcement audit of all mutation endpoints must complete before the cookie cutover. The three-phase transition (dual-mode, frontend migration, header removal) cannot be compressed.

**Delivers:**
- CSRF audit completed: all mutation endpoints enforce CSRF; `getCsrfToken()` failure changed from silent `return ''` to hard throw
- Backend Phase 1: `auth.controller.ts` sets httpOnly Secure SameSite cookies on login/refresh while still returning tokens in response body (dual-mode)
- Frontend migration: Zustand auth-store removes token from state; `auth-token.ts` deleted; `apiClient` removes Authorization header interceptor, adds `withCredentials: true`
- WebSocket auth: polling transport cookie auth tested and verified; Socket.IO WsGuard updated to read httpOnly cookie from handshake
- Next.js API route proxies consolidated to read new httpOnly cookie name
- E2E test fixtures abstracted into single `authHelper` (cookie-based login flow); all 5+ fixture files updated via helper
- Backend Phase 3: tokens removed from response body after two-week dual-mode window; Bearer header fallback removed

**Addresses (FEATURES.md):** httpOnly cookie migration, encryption standardization (CBC to GCM audit runs in parallel as low-effort sub-task)
**Avoids:** CP-2 (dual-mode transition period eliminates session lockout), MP-1 (WebSocket polling transport tested before WebSocket upgrade is re-enabled), MP-3 (CSRF audit before cookie cutover — not after), mP-2 (E2E helper abstracted before migration begins)
**Research flag:** No additional research needed — well-documented NestJS + Next.js httpOnly cookie auth pattern. WebSocket cookie auth behavior under NestJS WsGuard should be branch-tested before Phase 4 begins (minor gap noted in Confidence section).

### Phase 5: AI Observability — Run Ledger Integration (Weeks 5-7)

**Rationale:** Schema from Phase 1 exists. `CorrelationInterceptor` wired from Phase 3 makes `requestId` available for ledger entries. Module boundaries are clean from Phase 2, so AI service wiring is stable. This phase adds observability without touching any user-facing features. The fire-and-forget constraint is non-negotiable.

**Delivers:**
- `AiRunLedgerService` implemented with `startRun()`, `completeRun()`, `failRun()`, `listRuns()`, cost aggregation per tenant
- `AiChatService.streamText()` wrapped: fire-and-forget ledger writes only (BullMQ enqueue or `.catch()` swallowed)
- `BriefingService`, `FollowUpDetectionService`, `DraftGenerationService`, `EmailTriageService` all wrapped with ledger calls
- Model pricing lookup implemented (config file or environment variable; not hardcoded)
- `GET /api/v1/ai/runs` admin query endpoint with tenant and date filters
- `GET /api/v1/ai/runs/cost-summary` for per-tenant cost reporting
- Permission taxonomy documented: `email:read`, `email:send`, `calendar:manage`, `ai:chat`, `ai:runs:read`, `admin:tenant` resource:action pairs; `PolicyService` interface defined

**Addresses (FEATURES.md):** AI Run Ledger schema + telemetry, permission taxonomy definition
**Avoids:** HP-2 (fire-and-forget writes only — latency measured before and after and treated as a blocking regression if >50ms)
**Research flag:** No additional research needed. Model pricing table for cost calculation is a minor lookup gap — handle at implementation time.

### Phase 6: Encrypted Search and Data Layer (Weeks 6-8)

**Rationale:** This phase is independent of other phases after Phase 1 infrastructure is in place. It benefits from stable module boundaries (Phase 2) but does not require API or auth changes. The search architecture decision (exact-match only, subject stays plaintext) must be formally recorded as an architecture decision before schema changes land — this cannot be revisited after the migration runs on production data.

**Delivers:**
- Architecture decision recorded: `subject` stays plaintext in v4.0; only `from` (email address) gets blind index for exact sender matching
- `fromHash` and `toHash` columns added to Email schema with `@@index([tenantId, fromHash])`
- `field-encryption.extension.ts` updated: HMAC-SHA256 computed on write for configured `hashField` entries
- `HashSearchService` created: converts search terms to HMAC for query (normalizes lowercase, applies tenant salt)
- Background backfill job following `EmbeddingBackfillService` pattern: rate-limited, dual-path search during backfill (hash if populated, plaintext `contains` fallback)
- 17+ query sites audited: exact-match `from` address queries migrated to hash; all `contains` queries remain on plaintext fields
- `CryptoService` audit: legacy AES-CBC usage in `CryptoService` flagged; migration plan to AES-GCM documented (execution may extend to v4.1 if blast radius is large)
- Threat model documented: blind indexes protect against offline DB theft; frequency analysis risk acknowledged and accepted for exact-match use case

**Addresses (FEATURES.md):** ENC-03 blind indexes, encryption standardization
**Avoids:** HP-1 (exact-match only — architecture decision prevents substring search on hashed fields that would silently return zero results; threat model is explicit), mP-4 (dual-path search during backfill prevents zero-result gap)
**Research flag:** Needs formal team decision on the v5.0 searchable encryption path (trigram HMAC, CipherStash-style, or dedicated search engine) before v4.0 schema locks in the blind index pattern. The v4.0 scope is clear and correct; the migration path forward needs a scoped research session before v4.1 planning begins.

### Phase 7: Bug Fixes, Performance, and Delivery Polish (Weeks 7-9)

**Rationale:** Parallelizable with Phases 5 and 6 as an independent workstream. These items do not depend on architectural changes and can be assigned to separate developer capacity. Performance optimization must never target auth or layout infrastructure — only leaf components.

**Delivers:**
- RC-A1/A8 race conditions resolved: distributed Redis locks on folder CRUD operations in `folder-sync.service.ts`
- 7 deferred v3.1 bugs resolved
- Dead code deleted: `extractPlainText()` in `base-email-sync.service.ts` lines 1314-1346 (never called)
- Frontend LCP/TTI: `@next/bundle-analyzer` per-route baseline established; dynamic imports for TipTap editor, assistant-ui chat panel, calendar components
- Lighthouse CI thresholds enforced: LCP <2.5s, TTI <3.5s (currently violated at ~4.1s TTI)
- Per-route bundle budgets set after measurement data collected (not before baselines exist)
- Memory profile run under simulated concurrent load

**Addresses (FEATURES.md):** Frontend performance (LCP/TTI), deferred v3.1 bugs
**Avoids:** MP-2 (auth infrastructure is never lazy-loaded; E2E tests must pass alongside Lighthouse improvement), mP-3 (MUI/Tailwind component library boundary kept explicit — `ai-elements/` is Tailwind, `dashboard/` is MUI, never mixed)
**Research flag:** Next.js bundle optimization patterns are well-documented. If LCP targets prove unreachable with code-splitting alone, Server Component migration candidates need a scoped research session for specific routes only.

### Phase Ordering Rationale

- **Phase 1 before all others**: Verifying what works prevents stabilization work from destabilizing the working baseline. Foundation installations are zero-risk additions.
- **Phase 2 before Phase 3**: Module boundaries must be stable before the API surface spanning those modules is standardized. A forwardRef change during API standardization can break controller wiring mid-flight.
- **Phase 3 before Phase 4**: CORS configuration and the response format must be locked before cookie auth is layered on. The CSRF enforcement audit (mandatory before cookie cutover) also requires the final response format to be known.
- **Phase 3 before Phase 5**: Correlation ID global wiring (Phase 3) is a prerequisite for meaningful AI Run Ledger entries — without requestId, run steps cannot be correlated to their triggering HTTP request.
- **Phase 6 is parallel to Phases 4 and 5**: Database-level encryption changes are independent of API layer and auth changes. Different developer capacity, different files.
- **Phase 7 is parallel to Phases 5 and 6**: Bug fixes and performance optimization touch different files with no dependency on architectural changes.

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 6 (ENC-03, v5.0 path)**: The v4.0 decision (exact-match only, subject stays plaintext) is correct. But the v5.0 searchable encryption architecture — whether trigram HMAC, CipherStash-style blind indexing, or a dedicated search engine like OpenSearch — is unresearched and needs scoping before v4.0 schema locks in the blind index pattern that must be extended.

Phases with standard patterns (no additional research needed):
- **Phase 1**: NestJS EventEmitter setup and dependency-cruiser configuration — official docs are complete
- **Phase 2**: Circular dependency breaking with NestJS events and interface injection — well-documented with multiple working examples
- **Phase 3**: NestJS interceptor/filter patterns — textbook NestJS implementation
- **Phase 4**: httpOnly cookie auth with NestJS + Next.js — multiple verified working examples exist
- **Phase 5**: LLM observability telemetry wiring — established patterns; pricing table is a minor implementation decision
- **Phase 7**: Next.js bundle optimization — well-documented App Router patterns

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All 5 new packages verified via `npm view` on 2026-03-03; peer dependencies confirmed against NestJS 11.1.13; existing packages confirmed installed; all 6 evaluated-and-rejected packages have documented rationale |
| Features | HIGH | Derived from direct codebase audit (26 forwardRef calls counted, auth-store.ts localStorage persist confirmed, use-dashboard.ts mock fallback patterns confirmed, lighthouserc.js threshold violations confirmed) cross-referenced against PRD gap analysis |
| Architecture | HIGH | Component map derived from auditing every `*.module.ts` file; actual forwardRef count is 17 (PRD estimated 15 — discrepancy noted and verified); build order validated against dependency chain analysis; data flow diagrams reflect actual current state |
| Pitfalls | HIGH | All critical pitfalls are codebase-verified with line-level evidence (18+ files with localStorage token, 17+ `contains` queries on PII fields, three silent mock-data fallbacks in use-dashboard.ts); severity ratings are conservative |

**Overall confidence:** HIGH

### Gaps to Address

- **ENC-03 v5.0 path**: The v4.0 decision (exact-match only via HMAC blind index on `from`, subject stays plaintext) is correct and safe. The v5.0 searchable encryption architecture is unresearched. Acceptable gap for v4.0 execution; must be scoped before v4.1 planning begins to avoid boxing in the schema design.

- **Model pricing table for AI Run Ledger**: Cost calculation requires tokens multiplied by a per-model rate. Mistral pricing may change; a hardcoded constant is a maintenance burden. Decide at implementation time whether to use a config file, environment variable, or a pricing API call. Minor implementation decision, not a planning blocker.

- **WebSocket auth under NestJS WsGuard + httpOnly cookies**: The recommended mitigation (test polling transport first, then re-enable WebSocket upgrade) is correct in principle. The exact behavior of Socket.IO cookie transmission during the WebSocket upgrade handshake in this specific NestJS WsGuard configuration is inferred from Socket.IO transport documentation, not directly tested. Should be branch-verified before Phase 4 begins to avoid surprises.

- **Pact broker infrastructure tension**: STACK.md recommends `@pact-foundation/pact` and FEATURES.md correctly notes the 0-to-Pact gap is too large for a stabilization milestone. Resolution: add Pact as a devDependency and write contract tests for three to five major endpoint groups; defer Pact broker infrastructure and full CI integration to v4.1. The devDependency addition is correct; the CI pipeline scope is the deferred part.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase audit — all `*.module.ts` files (forwardRef counts and patterns), `auth-store.ts`, `api-client.ts`, `jwt.strategy.ts`, `main.ts`, `encryption.config.ts`, `field-encryption.extension.ts`, `use-dashboard.ts` (silent fallback patterns), `lighthouserc.js` (threshold violations confirmed)
- [NestJS Events official docs](https://docs.nestjs.com/techniques/events) — EventEmitter2 integration patterns
- [NestJS Circular Dependency official docs](https://docs.nestjs.com/fundamentals/circular-dependency) — forwardRef guidance and alternatives
- npm registry (verified 2026-03-03) — all 5 new package versions and peer dependencies confirmed
- [Enterprise Platform PRD](D:/PMSync/docs/Enterprise-Platform-PRD.md) — gap analysis, phase definitions, priority ratings

### Secondary (MEDIUM confidence)
- [Trilon: Avoiding Circular Dependencies in NestJS](https://trilon.io/blog/avoiding-circular-dependencies-in-nestjs) — event-driven decoupling patterns
- [DEV.to: Get Rid of Tightly Coupled Modules in NestJS](https://dev.to/kishieel/get-rid-of-tightly-coupled-modules-and-circular-dependencies-in-nestjs-3do1) — interface injection pattern
- [Tigran.tech: NestJS Cookie-Based JWT Authentication](https://tigran.tech/nestjs-cookie-based-jwt-authentication/) — httpOnly cookie migration implementation
- [Stackademic: Standardizing API Responses in NestJS](https://blog.stackademic.com/standardizing-api-responses-in-nestjs-with-interceptors-and-exception-filters-cf65efd27d04) — envelope interceptor pattern
- [Portkey: Complete Guide to LLM Observability](https://portkey.ai/blog/the-complete-guide-to-llm-observability/) — AI run ledger field design
- [ankane/blind_index](https://github.com/ankane/blind_index) — HMAC blind index established pattern (Ruby, pattern applies to Node)
- [Cossack Labs: Searchable Encryption](https://docs.cossacklabs.com/acra/security-controls/searchable-encryption/) — frequency analysis risk documentation
- [Cerbos: Designing an Authorization Model for Enterprise](https://www.cerbos.dev/blog/designing-an-authorization-model-for-an-enterprise) — permission taxonomy patterns

### Tertiary (LOW confidence — needs validation at implementation time)
- Socket.IO WebSocket upgrade + httpOnly cookie behavior under NestJS WsGuard: inferred from Socket.IO transport documentation, not directly tested in this configuration
- Mistral per-token pricing for AI Run Ledger cost calculation: sourced from public docs at research time; subject to change

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
