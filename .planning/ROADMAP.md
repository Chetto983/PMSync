# Roadmap: MailAgent

## Milestones

- ✅ **v1.0 Stability & Code Quality** - Phases 1-5 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** - Phases 6-10 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** - Phases 11-13 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** - Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** - Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** - Phases 23-30 (shipped 2026-03-03, partial)
- 🚧 **v4.0 Enterprise Stabilization** - Phases 31-37 (in progress)

## Phases

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) - SHIPPED 2026-02-09</summary>

Phases 1-12: VoltAgent audit, modern chat UI, priority scoring, follow-ups refactor, nested labels, chat UI on mail, chat improvements, email tool triage, artifact renderers, UI review, AI module audit, test fixes. 12 phases, 42 plans, 19/19 requirements.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) - SHIPPED 2026-02-27</summary>

Phases 13-22: PII tokenization, database encryption at rest, GDPR core compliance, data rights & legal, rich artifacts UI, AI triage & bulk ops, AI draft generation, GDPR guard mounting, triage prompt enrichment, bug audit. 10 phases, 31/32 requirements (ENC-03 deferred).

</details>

<details>
<summary>✅ v3.2 AI Rebuild & Cleanup (Phases 23-30) - SHIPPED 2026-03-03 (partial)</summary>

Phases 23-28: SDK foundation, backend core pipeline, tools & RAG, non-chat AI, chat frontend, cleanup & VoltAgent deletion. 6 phases complete (20 plans). Phases 29-30 (architecture hardening, performance & debt) carried forward to v4.0 as ARCH-01/02/03 and PERF-01/02.

</details>

---

## 🚧 v4.0 Enterprise Stabilization (Phases 31-37)

**Milestone Goal:** Stabilize architecture for enterprise readiness -- break circular dependencies, standardize API contracts, harden auth, add AI observability, fix encrypted search, and resolve performance debt. Based on Enterprise Platform PRD Phase 1 (Stabilization & Debt Reduction) plus v3.2 carry-forward items.

**Strategy:** Sequential dependency chain for foundational work (Phases 31-34), then partially parallel workstreams (Phases 35-37). Module boundaries must be stable before API standardization; API contracts must be locked before auth hardening; correlation IDs (from API phase) needed for AI Run Ledger entries.

**Phase Numbering:**
- Integer phases (31-37): Planned milestone work
- Decimal phases (e.g., 33.1): Urgent insertions if needed

- [x] **Phase 31: Foundation & Stability Verification** - Verify v3.2 baseline, close Phase 28 gaps, install foundation infrastructure (completed 2026-03-03)
- [x] **Phase 32: Architecture Decoupling** - Break circular dependencies (17 to 5), wire domain events, enforce module boundaries in CI (completed 2026-03-03)
- [x] **Phase 33: API Contract Standardization** - Global response envelope, unified error filter, API versioning, correlation IDs, OpenAPI linting, silent fallback elimination (completed 2026-03-03)
- [x] **Phase 34: Auth Security Hardening** - httpOnly cookie migration with dual-mode transition, AES-GCM standardization (completed 2026-03-04)
- [x] **Phase 35: AI Observability & Permissions** - AI Run Ledger telemetry, cost reporting endpoints, permission taxonomy (completed 2026-03-04)
- [x] **Phase 36: Encrypted Search** - HMAC blind indexes on encrypted fields for exact-match sender lookup (completed 2026-03-04)
- [x] **Phase 37: Performance & Debt Closure** - LCP <2.5s / TTI <3.5s, resolve 7 deferred v3.1 bugs (completed 2026-03-04)
- [x] **Phase 38: Attachment Proxy Path Fix** - Fix broken attachment download proxy URL missing /api/v1 prefix (gap closure) (completed 2026-03-04)
- [ ] **Phase 39: Code Quality & CI Hygiene** - Split email.tsx, fix Lighthouse CI mixed-PR gap, fix OpenAPI CI masking, remove auth-token stub (gap closure)

## Phase Details

### Phase 31: Foundation & Stability Verification
**Goal**: Verified working baseline with Phase 28 gaps closed and all foundation infrastructure installed (zero existing behavior changes)
**Depends on**: Nothing (first v4.0 phase)
**Requirements**: PERF-03
**Success Criteria** (what must be TRUE):
  1. Chat 403 error resolved -- user can open AI chat and send a message without authentication failures
  2. Dead action-counts polling disabled -- browser network tab shows zero recurring failed requests to removed endpoints
  3. E2E mobile viewport tests pass in CI -- Playwright chat tests run at 375px breakpoint without skips
  4. `@nestjs/event-emitter` installed and `EventEmitterModule.forRoot()` registered in AppModule -- app boots without errors
  5. `dependency-cruiser` installed in warn-only mode with baseline config -- `npx depcruise --validate` runs and reports current violations without blocking
**Plans**: 2 plans (Wave 1 -- parallel)

Plans:
- [ ] 31-01-PLAN.md -- Phase 28 gap closure: fix chat 403 auth error, remove dead action-counts polling, create dedicated mobile E2E test suite at 375px
- [ ] 31-02-PLAN.md -- Foundation infrastructure: install EventEmitterModule, dependency-cruiser baseline, domain event types, interface contracts, AiRunLedger Prisma schema

### Phase 32: Architecture Decoupling
**Goal**: Circular dependencies reduced from 17 forwardRef edges to 5 or fewer, with typed domain events wired and module boundary rules enforced in CI
**Depends on**: Phase 31
**Requirements**: ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):
  1. `madge --circular` reports 5 or fewer circular dependency edges -- down from 17 forwardRef calls
  2. Domain events fire and are consumed correctly -- an email sync triggers `EmailSyncedEvent`, a provider connect triggers `ProviderConnectedEvent`, and consumers react without direct module imports
  3. AiChatModule has zero forwardRef imports to domain modules -- all tools discovered via ToolRegistryService where domain modules self-register
  4. `dependency-cruiser` runs in error mode in CI -- a PR introducing a forbidden cross-module import is blocked from merging
**Plans**: 4 plans (Wave 1 -> Wave 2 -> Wave 3 -> Wave 4, sequential dependency chain)

Plans:
- [ ] 32-01-PLAN.md -- ToolRegistryModule implementation, IProviderTokenService + ICryptoService contracts, TenantDeleted + DeletionExpired events, unit + integration tests (Wave 1)
- [ ] 32-02-PLAN.md -- AiChatModule cluster decoupling: IAiTool wrappers, OnModuleInit self-registration, forwardRef removal, STORAGE_SERVICE registration (Wave 2, depends on 32-01)
- [ ] 32-03-PLAN.md -- ProvidersModule + Compliance cluster decoupling: interface injection, ProviderConnectedEvent consumer handlers, all Phase 31 event wiring, remaining edges (Wave 3, depends on 32-02)
- [ ] 32-04-PLAN.md -- dependency-cruiser circular rule to error severity, known-violations baseline, madge install, CI pipeline step (Wave 4, depends on 32-03)

### Phase 33: API Contract Standardization
**Goal**: Every API endpoint returns uniform response/error shapes with correlation IDs, versioning is enforced, and frontend silent fallbacks are replaced with explicit degraded states
**Depends on**: Phase 32
**Requirements**: API-01, API-02, API-03, API-04, API-05, PERF-04
**Success Criteria** (what must be TRUE):
  1. Every non-streaming API response is wrapped in `{ data, meta: { requestId, timestamp } }` -- verified by hitting 5+ endpoints from different domains and checking response shape
  2. Every API error returns `{ error: { code, message, details }, meta: { requestId } }` with machine-readable error codes -- no raw exception payloads leak to the client
  3. All controller routes resolve under `api/v1/` prefix -- no bare routes exist outside webhook exclusions
  4. Every HTTP response includes a `x-request-id` header populated by CorrelationInterceptor -- BullMQ job payloads include the originating `requestId`
  5. OpenAPI spec passes Spectral linting in CI -- `frontend/types/api.generated.ts` exists and is importable
  6. Silent frontend fallbacks (dashboard mock data on API failure) replaced with explicit error/degraded states -- browser console shows no suppressed API errors
**Plans**: 3 plans (Wave 1 -> Wave 2 parallel pair)

Plans:
- [ ] 33-01-PLAN.md -- Backend core: ResponseEnvelopeInterceptor + ApiExceptionFilter + setGlobalPrefix('api/v1') + controller prefix cleanup + CorrelationInterceptor global registration
- [ ] 33-02-PLAN.md -- Frontend adaptation: apiClient baseURL + envelope unwrap interceptor + /api/v1/ path strip + silent fallback elimination
- [ ] 33-03-PLAN.md -- BullMQ correlation ID propagation + OpenAPI Spectral linting + openapi-typescript type generation

### Phase 34: Auth Security Hardening
**Goal**: Frontend auth uses httpOnly secure cookies instead of localStorage, all encryption paths use AES-GCM
**Depends on**: Phase 33
**Requirements**: SEC-01, SEC-03
**Success Criteria** (what must be TRUE):
  1. After login, no JWT token exists in localStorage or sessionStorage -- httpOnly cookie is the sole auth credential, verified via browser DevTools Application tab
  2. User stays logged in across browser sessions (cookie persists) and can log out cleanly (cookie cleared)
  3. WebSocket connections authenticate via cookie -- Socket.IO chat and notification channels work without Bearer header
  4. All E2E test fixtures use a single `authHelper` that authenticates via cookie flow -- no test directly manipulates localStorage tokens
  5. All encryption in the codebase uses AES-GCM -- audit confirms zero remaining AES-CBC usage (or documented migration plan for any edge cases)
**Plans**: 3 plans (Wave 1 parallel pair + Wave 2)

Plans:
- [ ] 34-01-PLAN.md -- Backend dual-mode cookie auth: cookie.helper.ts, auth controller cookie setting on all success paths, logout clearing, WS cookie extraction, JWT expiry alignment to 7d
- [ ] 34-02-PLAN.md -- Frontend cookie migration: auth-store localStorage removal, apiClient Bearer removal, WebSocket withCredentials, ChatRuntimeProvider, attachment proxy, E2E fixture migration
- [ ] 34-03-PLAN.md -- AES-GCM standardization: CryptoService upgrade from CBC to GCM with CBC fallback decryption, unit tests, audit

### Phase 35: AI Observability & Permissions
**Goal**: Every AI call is recorded in the Run Ledger with cost and latency data, queryable via API; permission taxonomy documented with PolicyService interface
**Depends on**: Phase 33 (needs correlation IDs for requestId in ledger entries)
**Requirements**: AIOBS-01, AIOBS-02, AIOBS-03, AIOBS-04
**Success Criteria** (what must be TRUE):
  1. After sending a chat message, an AiRunLedger record exists with runType, model, token counts, estimatedCostUsd, latencyMs, toolCallCount, and requestId -- verified via database query
  2. Non-chat AI calls (briefing, follow-up detection, draft generation) each create their own ledger entries -- all AI paths are instrumented
  3. `GET /api/v1/ai/runs` returns paginated run records filtered by tenant and date range; `GET /api/v1/ai/runs/cost-summary` returns aggregate cost per tenant
  4. Chat streaming latency is not regressed -- first-token-time measured before and after ledger integration, difference is less than 50ms
  5. Permission taxonomy document exists with resource:action pairs and PolicyService TypeScript interface defined -- ready for RBAC implementation in v4.1
**Plans**: 2 plans (Wave 1 -> Wave 2)

Plans:
- [ ] 35-01-PLAN.md -- AiRunLedgerService + fire-and-forget telemetry wiring across all 6 AI call paths
- [ ] 35-02-PLAN.md -- AI runs query endpoints (GET /runs, GET /runs/cost-summary) + permission taxonomy (Permission enum, IPolicyService interface)

### Phase 36: Encrypted Search
**Goal**: Exact-match sender lookup works on encrypted `from` field via HMAC blind indexes, with architecture decision formally recorded
**Depends on**: Phase 31 (foundation infrastructure only)
**Requirements**: SEC-02
**Success Criteria** (what must be TRUE):
  1. Architecture decision recorded: `subject` stays plaintext in v4.0; only `from` gets blind index for exact sender matching -- document explains why substring search is incompatible with deterministic hashing
  2. Searching for an exact sender email address returns correct results using the `fromHash` index -- no plaintext `from` value is queried
  3. Background backfill job has processed all existing emails -- dual-path search (hash if populated, plaintext fallback) works during and after backfill
  4. Threat model documented: blind indexes protect against offline DB theft; frequency analysis risk acknowledged
**Plans**: 2 plans (Wave 1 -> Wave 2, sequential)

Plans:
- [ ] 36-01-PLAN.md -- HMAC blind index infrastructure: hmacForBlindIndex function, TenantKeyService.getHmacKey, fromHash schema column, Prisma extension write-path injection, HashSearchService, backfill script, ADR-036
- [ ] 36-02-PLAN.md -- Query site migration: migrate 2 exact-match sender queries (meeting-prep, relationship-score) to HashSearchService, full suite verification, codebase audit

### Phase 37: Performance & Debt Closure
**Goal**: Frontend performance meets enterprise targets and all deferred v3.1 bugs are resolved
**Depends on**: Phase 31 (no architectural dependency, independent workstream)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. Bundle analysis shows email list page initial chunk reduced (dialog components split out via dynamic imports) -- evidence captured in before/after comparison
  2. Lighthouse TTI on email list page < 3.5s in production build (CI-measurable without backend)
  3. All 7 deferred bugs from v3.1 audit resolved -- RC-A1/A8 confirmed still fixed from Phase 22 (Redis locks present), remaining BUG-REPORT items (BUG-011/012/018/029/038/039/044) closed or accepted with rationale
  4. Lighthouse CI budget gates enforced in CI pipeline -- PRs that regress LCP/TTI/CLS beyond thresholds are blocked (continue-on-error removed)
**Plans**: 2 plans (Wave 1 -> Wave 2, sequential)

Plans:
- [ ] 37-01-PLAN.md -- Bundle analysis baseline, dynamic imports for email.tsx dialogs, optimizePackageImports expansion (PERF-01)
- [ ] 37-02-PLAN.md -- Deferred v3.1 bug closure (BUG-011/012/018/029/038/039/044), Lighthouse CI enforcement (PERF-02)

### Phase 38: Attachment Proxy Path Fix
**Goal**: Fix broken email attachment download — proxy URL missing `/api/v1` prefix after Phase 33 setGlobalPrefix
**Depends on**: Phase 33, Phase 34 (fixes cross-phase integration gap)
**Requirements**: API-03, SEC-01
**Gap Closure:** Closes 2 partial requirements, 1 integration gap, 1 broken E2E flow from v4.0 audit
**Success Criteria** (what must be TRUE):
  1. `frontend/pages/api/email/attachments/[id]/download.ts` proxy URL includes `/api/v1` prefix — attachment downloads return 200, not 404
  2. E2E flow "Email Attachment Download" passes — user can click download on an email attachment and receive the file
**Plans**: 1 plan

Plans:
- [ ] 38-01-PLAN.md -- Fix attachment proxy backend URL to include /api/v1 prefix, verify download flow

### Phase 39: Code Quality & CI Hygiene
**Goal**: Resolve tech debt items flagged by milestone audit — file size violation, CI coverage gaps, dead code
**Depends on**: Phase 37 (builds on performance/CI work)
**Requirements**: None (tech debt closure, no new requirements)
**Gap Closure:** Closes 4 tech debt items from v4.0 audit
**Success Criteria** (what must be TRUE):
  1. `email.tsx` split to under 500 lines per file — CLAUDE.md limit respected
  2. Lighthouse CI triggers on ALL PRs touching frontend code, including mixed backend+frontend PRs
  3. CI OpenAPI generation step fails the pipeline on real errors (continue-on-error removed or scoped correctly)
  4. `frontend/lib/utils/auth-token.ts` deprecation stub removed — no dead auth code remains
**Plans**: 1 plan

Plans:
- [ ] 39-01-PLAN.md -- Split email.tsx, fix Lighthouse CI trigger scope, fix OpenAPI CI masking, remove auth-token.ts stub

## Progress

**Execution Order:**
Phases 31-34 execute sequentially (dependency chain). Phases 35, 36, 37 can execute in parallel after their dependencies are met.
31 -> 32 -> 33 -> 34
                33 -> 35
31 -> 36 (parallel after Phase 31)
31 -> 37 (parallel after Phase 31)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 31. Foundation & Stability Verification | 2/2 | Complete    | 2026-03-03 |
| 32. Architecture Decoupling | 4/4 | Complete    | 2026-03-03 |
| 33. API Contract Standardization | 3/3 | Complete    | 2026-03-03 |
| 34. Auth Security Hardening | 3/3 | Complete    | 2026-03-04 |
| 35. AI Observability & Permissions | 2/2 | Complete    | 2026-03-04 |
| 36. Encrypted Search | 2/2 | Complete    | 2026-03-04 |
| 37. Performance & Debt Closure | 2/2 | Complete    | 2026-03-04 |
| 38. Attachment Proxy Path Fix | 1/1 | Complete   | 2026-03-04 |
| 39. Code Quality & CI Hygiene | 0/1 | Pending     | — |

---
*Roadmap created: 2026-02-09*
*v3.2 phases added: 2026-02-27 -- 8 phases, 25 plans, 33 requirements mapped*
*v3.2 closed (partial): 2026-03-03 -- 20/25 plans complete, carry-forward to v4.0*
*v4.0 phases added: 2026-03-03 -- 7 phases, 19 plans (est), 19 requirements mapped*
*v4.0 gap closure phases added: 2026-03-04 -- 2 phases (38-39), closes 1 broken E2E flow + 4 tech debt items*
