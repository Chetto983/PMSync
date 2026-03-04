# PMSync — Enterprise Platform PRD

**Document Type:** Architecture Audit & Transformation Strategy
**Date:** 2026-03-04 (Consolidated from multiple audit passes, codebase-verified)
**Classification:** CTO-Level Technical Due Diligence
**Scope:** Full-stack audit of `backend/` and `frontend/`
**Method:** Static architecture and code audit. No source code modifications. Dependency, coupling, security, tenancy, RBAC, observability, AI orchestration, and enterprise UX readiness review.

---

## Table of Contents

1. [Executive Platform Assessment](#section-1--executive-platform-assessment)
2. [Backend Architecture Audit](#section-2--backend-architecture-audit)
3. [Frontend Architecture Audit](#section-3--frontend-architecture-audit)
4. [Cross-Layer Analysis](#section-4--cross-layer-analysis)
5. [Enterprise Gap Analysis](#section-5--enterprise-gap-analysis)
6. [Target Enterprise Architecture Proposal](#section-6--target-enterprise-architecture-proposal)
7. [Transformation Roadmap](#section-7--transformation-roadmap)
8. [KPIs & Enterprise Metrics](#section-8--kpis--enterprise-metrics)
9. [Immediate Executive Recommendations](#section-9--immediate-executive-recommendations)

---

## Section 1 — Executive Platform Assessment

### Overall Architecture Maturity

PMSync is a **well-engineered growth-stage SaaS** with broad functional depth (email, calendar, contacts, AI chat, queues, compliance). It has significantly outgrown its startup roots in several areas (AI orchestration, security, database design) while remaining immature in others (RBAC, CRM primitives, frontend permission enforcement). It is **not yet enterprise-grade CRM architecture** — governance, control-plane separation, and AI run observability are partial.

**Maturity Level:** 2.8 / 5 (Growth platform, pre-enterprise control plane)

| Dimension | Rating |
|-----------|--------|
| **Enterprise Readiness Score** | **42/100** |
| **Technical Debt Rating** | **Moderate-High (5.5/10 debt load)** |
| **Risk Classification** | **Medium-High** |
| **Scalability Ceiling** | ~8-12x users with infra tuning; ~3-5x data before redesign; 100x data not viable without architectural refactor |
| **Code Quality** | Above average for stage — clean patterns, consistent conventions |

### Strategic Bottlenecks

1. **Tenant data isolation relies entirely on application-layer filtering.** No Prisma middleware, no RLS. One missed `tenantId` WHERE clause = cross-tenant data breach. Single biggest security risk.
2. **Module coupling:** `forwardRef` in **24 files** (46 occurrences). Highest concentration in `email.module.ts` (4), `email-sync.module.ts` (3), `auth.module.ts` (3). Exact circular dependency cycle count unconfirmed (madge fails on Windows/Node22).
3. **Sparse RBAC coverage:** `RolesGuard` applied on only **3 of 33 controllers**. Flat string-based role model, no permission granularity.
4. **No frontend-backend contract tests.** Zero Pact or OpenAPI schema validation — response contract drift goes undetected until runtime.
5. **CRM primitives absent.** No Accounts, Deals, Activities, Pipelines. The "CRM" is a single alerts widget.
6. **Three competing design systems** (MUI, Tailwind/shadcn, custom chat CSS) create visual inconsistency and developer confusion.
7. **AI run observability partial.** Token-cost transparency and run-level reconciliation not unified into a single AI Run Ledger entity.

---

## Section 2 — Backend Architecture Audit

### 2.1 Architecture & Layering

**Maturity: 3.5/5**

NestJS modular architecture with 17 bounded contexts under `backend/src/modules/`. Clean controller → service → Prisma layering. Global composition root in `app.module.ts`. 33 controllers across 17 modules.

**Strengths:**
- Clear module boundaries: `ai`, `ai-chat`, `audit`, `auth`, `calendar`, `compliance`, `contacts`, `email`, `email-sync`, `health`, `labels`, `mistral`, `providers`, `realtime`, `subscription`, `tenants`, `users`
- Common layer (`common/`) provides shared guards, filters, interceptors, decorators
- Typed configuration in `config/`

**Critical Issues:**
- **`forwardRef` coupling in 24 files (46 occurrences).** Highest concentration: `email.module.ts` (4), `email-sync.module.ts` (3), `auth.module.ts` (3), plus multiple worker classes. Indicates structural coupling that increases regression risk and slows change velocity.
- **10+ files exceed 500-line limit.** Worst offenders: `email-sync-back.service.ts` (1429 lines), `auth.service.ts` (1212 lines), `emails.controller.ts` (1183 lines), `email-insights.service.ts` (1072 lines), `contacts.service.ts` (1049 lines)
- **No repository layer.** Services call Prisma directly, coupling domain logic to data access. When CQRS or read replicas are needed, every service must be refactored.
- **Circular dependency smell:** `MistralService.onModuleInit()` manually wires `ragService.setDependencies()` — indicates DI resolution failure.

**Recommendation:**
- Split into explicit bounded contexts: `Identity/Tenant`, `Comms Core`, `CRM Core`, `AI Orchestration`, `Billing/Entitlements`, `Observability`
- Replace cyclic imports with event contracts + domain interfaces
- Enforce architectural dependency rules in CI
- Target: reduce `forwardRef` from 24 files to ≤8 in Phase 1

### 2.2 API Design

**Maturity: 4/5**

| Feature | Status | Location |
|---------|--------|----------|
| Global versioning | `api/v1` prefix | `main.ts:118` |
| Error normalization | Unified envelope | `common/filters/api-exception.filter.ts` |
| Response envelope | `{ data, meta: { requestId, timestamp } }` | `common/interceptors/response-envelope.interceptor.ts` |
| Pagination | Standardized DTO | `common/dto/pagination.dto.ts` |
| Swagger/OpenAPI | Full integration | `@ApiTags`, `@ApiOperation`, `@ApiResponse` |
| Input validation | Global pipe | `whitelist: true`, `forbidNonWhitelisted: true` |
| Streaming exclusion | `@SkipEnvelope()` for SSE/metrics/exports | Intentional, not a gap |

**Gaps:**
- **No frontend-backend contract tests** (zero Pact or OpenAPI schema validation). Biggest unaddressed stability gap.
- No reusable sorting DTO (ad-hoc per controller)
- Dead filter files (`all-exceptions.filter.ts`, `http-exception.filter.ts`, `throttler-exception.filter.ts`) superseded by `ApiExceptionFilter`
- No v2 migration strategy (no header-based version negotiation)
- Pagination/filtering quality strong in email endpoints, not uniformly standardized across all domains

### 2.3 Multi-Tenancy

**Maturity: 4/5 (design) / 2/5 (enforcement)**

**Design is excellent:**
- Every domain table includes `tenantId`
- Composite PKs (`@@id([id, tenantId])`) on Email, Folder, Embedding, CalendarEvent, Contact — Citus-ready
- `TenantGuard` validates tenant from `x-tenant-id` header or JWT. Applied on **26 of 33 controllers**.
- Redis cache keys include tenantId
- Service-level tenant filtering is broadly present

**Enforcement is dangerous:**
- **NO global Prisma middleware/extension for tenantId scoping.** Every service must manually add `tenantId` to every query. One miss = cross-tenant data leak.
- **No database-level RLS.** Application-only filtering means a single code bug bypasses all isolation.
- **TenantGuard makes uncached DB query on every request** (`prisma.tenant.findFirst()` at guard level)
- Future code paths can still introduce accidental tenant leakage

**Recommendation:**
- P0 — Implement Prisma client extension that auto-injects `tenantId` from `AsyncLocalStorage` context
- Add PostgreSQL RLS policies as defense-in-depth
- Add automated tenant-leak negative security tests in CI
- Formalize tenant context propagation contracts (request, queue, event)
- Cache tenant lookups in TenantGuard

### 2.4 RBAC & Governance

**Maturity: 2.5/5**

| Feature | Status |
|---------|--------|
| Role model | Flat `User.role` string (not enum) |
| Permissions | None — no Permission model |
| RolesGuard | Opt-in, **applied on only 3 of 33 controllers** |
| TenantGuard | Applied on 26 of 33 controllers |
| Audit logging | `AuditLogInterceptor` — all authenticated requests, fire-and-forget |
| Tool execution audit | `AuditService.logToolExecution()` — fire-and-forget (failures logged as warnings) |
| Compliance | GDPR module (consent, legal acceptance, data export, deletion) |

**Critical Gaps:**
- No `Permission` model, `RolePermission` junction, or `@RequirePermission()` decorator
- `@Roles('admin')` is easily typo'd — no compile-time safety (string, not enum)
- RolesGuard coverage: 3/33 controllers. Endpoints without explicit `@UseGuards(RolesGuard)` are unprotected beyond JWT.
- No policy-level controls (object-level, action-level, field-level)
- No API key authentication for service-to-service calls
- Audit decision logs lack `policyVersion` and `why` context

**Recommendation:**
- Move to policy engine model (RBAC + ABAC)
- Create centralized authorization service with explicit permission taxonomy
- Extend audit model with immutable decision logs (`who`, `what`, `why`, `policyVersion`)

### 2.5 AI Orchestration Layer

**Maturity: 4/5**

This is a standout area. The AI pipeline is production-grade:

| Feature | Implementation |
|---------|---------------|
| Rate limiting | Three-layer: global `ThrottlerGuard`, per-plan `QuotaGuard`, daily dollar cap `CostProtectionService` |
| Circuit breaker | Dual: shared `getAiCircuitBreaker()` + local `LlmCircuitBreaker` in Mistral (redundant but functional) |
| PII protection | `PiiDetectionService` + `PiiResolutionService` — 12 PII types, tokenization before LLM, Redis-stored maps |
| Prompt guard | OWASP injection detection + roleplay jailbreak patterns |
| HITL | `HitlService` — ActionQueue entries with confidence scoring + cron-based expiry |
| Intent router | `IntentRouterService` — restricts active tools per step |
| Cost tracking | `AiRunLedgerService` — per-call model/tokens/latency/cost |
| Tool registry | `common/modules/tool-registry/` — self-registration by domain modules |
| Tool audit | `AuditService.logToolExecution()` — fire-and-forget |
| Conversation context | Sliding window with automatic summarization |

**Gaps:**
- **No unified AI Run Ledger entity.** Token usage metadata is partially captured but cost reconciliation is not fully token-accurate end-to-end. Run-level lineage and approval evidence are not normalized.
- Duplicate circuit breaker implementations (shared utility vs. MistralService inline class)
- No token budget cap per request — `stopWhen: stepCountIs(5)` limits steps, not token cost
- Cost map hardcoded in `AiRunLedgerService` — stale on pricing changes
- Summary generation fires without rate limit or circuit breaker
- Limited deterministic replay/auditability for enterprise regulated flows

**Recommendation:**
- Introduce **AI Run Ledger** entity (run, tool calls, decisions, approvals, costs, prompts, model, latency)
- Add deterministic workflow mode for high-stakes automations
- Add policy gates per tool/action with mandatory pre- and post-conditions
- Unify circuit breaker to single implementation

### 2.6 Observability

**Maturity: 3.5/5**

| Feature | Status |
|---------|--------|
| Structured logging | Pino via `nestjs-pino` |
| Correlation IDs | `AsyncLocalStorage`-based `CorrelationContextService`, globally wired in `main.ts` |
| Request IDs | Global `RequestIdMiddleware` on all routes |
| Response timing | Global `ResponseTimeInterceptor` |
| Audit logs | Fire-and-forget to `audit_logs` table |
| AI telemetry | `AiRunLedgerService` per-call metrics |
| Log rotation | `LogRotationService` (2-day FIFO) |
| Prometheus metrics | **Exists** — `health.controller.ts` exposes `/metrics` endpoint with email sync and queue metrics |
| Queue health | `QueueHealthService` with Prometheus text export |

**Critical Gaps:**
- **Prometheus endpoint is custom/partial** — not using `prom-client` library. Queue metrics and email sync metrics only. No request duration histograms, no cache hit/miss ratios, no AI cost aggregates.
- **No distributed tracing.** HTTP-level correlation is complete, but trace context does **not propagate across queue workers, WebSocket events, or AI tool call chains**.
- **Audit logs compete with production queries** for DB connections (same database)
- **Cache stats are in-memory only** — reset per process, no cross-instance aggregation
- No SLO-based alerting (only health endpoints)
- No error taxonomy

**Recommendation:**
- Adopt OpenTelemetry tracing (API → queue → worker → AI tool call)
- Upgrade Prometheus endpoint with `prom-client` for standard metric types
- Enforce correlation IDs across all async boundaries
- Add error taxonomy and SLO-based alerting

### 2.7 Performance & Scalability

**Maturity: 3.5/5**

| Feature | Status |
|---------|--------|
| Task queues | BullMQ — sync, send, bulk ops, folder ops, provider sync-back. Priority queues, concurrency presets, backpressure. |
| Redis caching | `CacheService` with namespace isolation, pipeline ops |
| Distributed locks | `RedisLockService` with Lua atomic release, fencing tokens |
| Prisma retry | `PrismaRetryService` — P2002/P2034 exponential backoff + jitter |
| Dead letter queue | Implemented |
| Schema sharding readiness | Composite PKs (Citus-ready) |
| Memory management | `MemoryManagerService` exists |

**Critical Gaps:**
- **Attachment proxy buffers full S3 response in memory.** `attachments.controller.ts:128-129` calls `arrayBuffer()` + `Buffer.from()` despite JSDoc claiming streaming. Real memory pressure risk under load.
- **WebSocket gateway has no Redis adapter.** Horizontal scaling = dropped realtime events.
- **JWT strategy makes redundant DB call** — fetches same session twice on cache miss
- **No connection pool configuration** — default Prisma pool under multi-tenant concurrency
- **Embedding backfill rate-limited at 2 req/s** — large backfills take days
- Monolithic service scaling limits for mixed workloads

**Recommendation:**
- Stream attachment proxy responses without full in-memory buffering (replace `arrayBuffer()` + `Buffer.from()` with piped stream)
- Add Redis adapter to WebSocket gateway
- Separate API and worker process scaling profiles
- Add DB partition/archive strategy for high-volume entities (emails, audit logs, AI messages)

### 2.8 Security & Compliance

**Maturity: 4/5**

**Comprehensive and rare for this stage:**
- JWT + httpOnly cookies (no localStorage token persistence), MFA (TOTP + WebAuthn/Passkeys), trusted devices, backup codes
- OAuth tokens AES-256-GCM encrypted with tenant-scoped key derivation
- Helmet with full CSP, CORS allowlist + regex, CSRF middleware
- Dual-tier rate limiting (100/min read, 30/min write)
- Global ValidationPipe with whitelist
- Production startup guards (weak secrets, debug flags)
- Full GDPR module (consent, legal acceptance, data export, deletion, scheduled retention cleanup)
- PII tokenization (12 types) before LLM
- Prompt injection detection (OWASP + jailbreak patterns)

**Gaps:**
- **No refresh token rotation** — 24h JWT lifetime is theft liability
- **Legacy CBC decrypt fallback** exists for pre-migration data (no auth tags on old ciphertext). New writes use AES-256-GCM exclusively. Re-encryption backfill status should be verified.
- `PasswordResetToken` lacks `tenantId` index — weak tenant scoping
- CORS regex allows all localhost ports (fine for dev, must be disabled in production)
- `AES_SECRET_KEY` defaults to `'default-key-change-in-production'`
- Compliance evidence model is not yet procurement-grade (no control mapping, no immutable audit package)

**Recommendation:**
- Run/verify CBC-to-GCM re-encryption backfill to eliminate legacy decrypt path
- Implement JWT refresh rotation (15-30min access token)
- Produce compliance control matrix (SOC2/GDPR/ISO-aligned) and evidence pipeline

### 2.9 Prisma Schema

**Maturity: 4.5/5**

~1100 lines, 35+ models. Extensive indexing (GIN trigram on email subject/from, composite indexes). Proper enum usage. GDPR annotations. Soft deletes. Cascade deletes on tenant. Optimistic concurrency (`version` field on Email).

**Gaps:**
- `User.role` is string, not enum — should be `role Role @default(USER)`
- `EmailAnalysis.modelUsed` defaults to `"gpt-4o-mini"` — stale (system uses Mistral)
- `AiMessage` lacks direct `tenantId` — requires join through `AiConversation` (GDPR purge requires subquery)
- 15 indexes on Email table — potential write overhead at high sync throughput

---

## Section 3 — Frontend Architecture Audit

### 3.1 UI Architecture

**Maturity: 3/5**

**Stack:** Next.js 16 (Pages Router) + React 19 + MUI 7 + TanStack Query 5 + Zustand 5

| Area | Status |
|------|--------|
| Module structure | Feature-based under `components/` (email, calendar, contacts, dashboard, billing, settings) |
| Pages | 27 files under `pages/`, flat structure |
| AI components | Separate tree under `src/components/chat/` (Tailwind/Radix) — different design system |
| UI primitives | `components/ui/` (shadcn-style) — third design system |

**Critical Issues:**
- **`pages/dashboard/email.tsx` is 1035 lines** — god-page violating project's own 500-line rule. Wires thread lists, preview panels, keyboard shortcuts, compose, labels, folders, drag-and-drop.
- **`components/email/compose/ComposeEditor.tsx` is 538 lines** — also over limit.
- **Three design systems coexist:** MUI (`components/`), Tailwind+Radix (`src/components/chat/`), shadcn (`components/ui/`). No governance on which to use.
- **Pages Router lock-in** — no native layouts, no streaming SSR, no server components. Performance ceiling.
- Dead code: `badge.old.tsx` in `ui/`
- No explicit enterprise shell/control-plane segregation

**Recommendation:**
- Introduce clear frontend domain packages: `crm`, `automation`, `admin`, `governance`, `operations`
- Move cross-cutting concerns (permissions, feature flags, policy gates) into shared platform layer
- Decompose `email.tsx` god-page

### 3.2 State Management

**Maturity: 4/5**

**Architecture is clean:**
- **Server state:** TanStack Query v5 — 20+ query hook files in `hooks/queries/`
- **Client state:** Zustand v5 — 9 stores in `stores/` (auth, email-ui, calendar, contact, dashboard, folders, labels, label-tree, sync)
- **API layer:** Typed modules in `lib/api/` with barrel export
- **API client:** Axios with CSRF, envelope unwrapping, 401/403 interceptors
- **Auth:** Entirely httpOnly cookie-based. `auth-store.ts` `setToken` is a no-op. localStorage only used for locale and UI display settings.

**Strengths:**
- Optimistic updates on email mutations
- `useShallow` selectors preventing unnecessary re-renders
- WebSocket → TanStack Query invalidation for realtime
- `keepPreviousData` on email lists (no skeleton flash on pagination)
- Virtual scrolling via `@tanstack/react-virtual`

**Gaps:**
- 150 `invalidateQueries` calls — 3 query trees invalidated per email mutation (scales poorly at 50+ concurrent users)
- No SSR data prefetching despite `HydrationBoundary` being wired
- Bulk operations invalidate cache per-id in forEach loop — O(n) cache operations
- Kanban assignments stored only in localStorage (lost on device switch)
- **Silent CSRF token fetch catch** in `api-client.ts` returns empty string on failure — could silently degrade CSRF protection

**Recommendation:**
- Fix silent CSRF catch to surface failures
- Consolidate API error normalization and enforce typed error contracts
- Introduce contract tests (Pact or OpenAPI validation) between frontend and backend

### 3.3 Enterprise CRM UX Primitives

**Maturity: 1/5**

This is the weakest area. The frontend has basic contacts management (7 component files), a CRM alerts widget, and follow-up/Kanban productivity patterns.

| CRM Feature | Status |
|------------|--------|
| Accounts/Companies | **Not implemented** |
| Activities/Timeline | **Not implemented** |
| Advanced filtering | **Not implemented** |
| Saved views | **Not implemented** |
| Deal/Pipeline management | **Not implemented** |
| Workflow/Automation builder | **Not implemented** (marketing copy only) |
| Admin console | **Not implemented** |
| Relationship mapping | **Not implemented** (`@xyflow/react` in deps but unused) |
| Bulk actions | Basic (no merge, no export, no import beyond sync) |
| Column customization | **Not implemented** |

**Recommendation:**
- Build unified CRM data model UI layer before adding advanced automation
- Add object-centric timeline and global activity feed
- Add saved views and enterprise-grade grid/table interactions

### 3.4 Multi-Tenancy & RBAC UI

**Maturity: 1/5**

- `RouteGuard` in `_app.tsx` checks `isAuthenticated` only — no role/permission checks
- Zero `<PermissionGate>` or `usePermission()` pattern
- No workspace selector or tenant context provider
- No admin permission matrix UI
- All authenticated users see identical UI regardless of role or plan

**Risk:** Users see features they cannot use → click → get API errors. Confusing and unprofessional.

**Recommendation:**
- Add policy-aware route guards and component guards
- Add tenant/workspace switcher with explicit context banner
- Build admin permission matrix screens

### 3.5 AI Layer UX

**Maturity: 3/5**

**Implemented:**
- 17 chat components (`ChatPage`, `ChatThread`, `ChatComposer`, layouts)
- 14 specialized tool renderers (Briefing, Contact, EmailList, EmailSearch, Event, CRM, etc.)
- HITL approval card with poll-based approve/reject
- Chain of thought display
- Undo send for emails

**Missing:**
- No explainability UI (confidence scores, evidence citations, source attribution)
- No agent execution trace/dashboard — zero run timeline UI
- No cost/token transparency per interaction (`tokenlens` in deps but no UI)
- No rollback for non-email AI actions (only email undo-send exists)
- HITL native `requires_action` path coded but not wired — half-finished feature

**Recommendation:**
- Add run timeline UI (intent, tool calls, approvals, outputs, failures)
- Add rollback-capable action cards where operations are reversible
- Add per-run cost and token panel

### 3.6 Observability UI

**Maturity: 1/5**

**Effectively nonexistent.**
- Billing quota alerts exist (`QuotaAlertBanner`) — a banner, not an observability tool
- No runtime error reporting (Sentry, Datadog RUM, LogRocket)
- No AI operations console
- No failure categorization dashboard
- No latency/SLO visualizations
- Console-based logger only (`lib/logger.ts`)
- Lighthouse CI exists (`lighthouserc.js`) but is build-time only

**Recommendation:**
- Build operations dashboard for support/ops/admin personas
- Add failure classes, retry visibility, queue lag and SLA burn indicators
- Integrate runtime error reporting (Sentry or equivalent)

### 3.7 Design System & White-Label

**Maturity: 3/5**

| Feature | Status |
|---------|--------|
| Theme architecture | MUI tokens in `theme/` (colors, spacing, typography, shadows, glassmorphism) |
| Dark/light mode | `next-themes` + MUI `ThemeProvider` |
| i18n | Full — `locales/en.ts` (3553 lines), `it.ts` (3530 lines), typed `AppTranslations` |
| Accessibility | Sparse — 65 aria attributes across 34 of 150+ component files |
| White-label | **Not implemented** — brand colors hardcoded in `tokens.ts` |
| Tenant branding | **Not implemented** |
| Error boundaries | `PageErrorBoundary` on all dashboard pages, `SectionErrorBoundary` for widgets |
| Reduced motion | `MotionConfig reducedMotion="user"` in `_app.tsx` |

**Gaps:**
- **Three parallel design systems** (MUI + emotion, Tailwind/shadcn, custom chat CSS) — CSS specificity conflicts possible
- Locale files at 3500+ lines approach monolith territory
- Accessibility below WCAG AA standards (65 aria attributes across 34 of 150+ files is sparse)
- i18n limited to 2 locales (EN, IT) — architecture supports more but global rollout needs locale pack strategy
- `badge.old.tsx` dead code

**Recommendation:**
- Consolidate to MUI + theme tokens as single source of truth
- Introduce tenant branding profile (logo, palette, typography, domain assets)
- Expand i18n to full locale pack strategy + formatting standards
- Establish accessibility budget and CI gates (WCAG AA)

### 3.8 Performance

**Maturity: 3/5**

| Feature | Status |
|---------|--------|
| Lazy loading | Dashboard widgets (`React.lazy`), landing sections (`next/dynamic`), compose dialogs |
| Bundle optimization | `optimizePackageImports` for MUI, lucide-react |
| Bundle analyzer | `@next/bundle-analyzer` integrated |
| Virtual scrolling | `@tanstack/react-virtual` for thread list |
| Error boundaries | `PageErrorBoundary` on all dashboard pages |

**Gaps:**
- No bundle size budget enforcement — no CI gate for regressions
- No SSR data prefetching despite `HydrationBoundary` being wired
- **149 production dependencies** — likely significant dead weight (`@xyflow/react`, `@rive-app/react-webgl2` appear unused)
- Tiptap with 30+ extension packages dominates compose bundle
- No image optimization (`remotePatterns` empty in next.config.js)

**Recommendation:**
- Set bundle budgets per route with CI checks
- Add Web Vitals regression checks
- Partition heavy modules (editor/chat/calendar) by route-level chunks
- Audit and remove unused dependencies

---

## Section 4 — Cross-Layer Analysis

### 4.1 API Contract Stability

| Aspect | Status | Risk |
|--------|--------|------|
| Response envelope | Consistent `{ data, meta }` backend, unwrapped by Axios interceptor | Low |
| Error model | Backend `{ error: { code, message, details } }` — frontend handles generically | Medium — no typed error codes on FE |
| Pagination | Backend `PaginatedResponse` matches frontend TanStack Query patterns | Low |
| Versioning | `api/v1` globally — frontend hardcodes `/api/v1/` in API modules | Medium — no auto-migration path |
| **Contract tests** | **Zero** — no Pact, no OpenAPI schema validation | **High** — drift undetected until runtime |

### 4.2 Authentication Flow Integrity

**Status: Medium-High**

Backend JWT + httpOnly cookies + CSRF double-submit → Frontend `auth-store` with `isAuthenticated` flag. Session validation on every request. No JWT in localStorage (confirmed: `setToken` is a no-op).

**Gaps:**
- Frontend CSRF token stored in module-scoped `let csrfToken` variable — lost on HMR in development
- Silent CSRF catch in `api-client.ts` could degrade protection
- Refresh token rotation not implemented (24h JWT lifetime)

### 4.3 Tenant Context Propagation

**Status: Medium**

Backend resolves tenant from `x-tenant-id` header or JWT → `TenantGuard` on 26/33 controllers → Frontend stores `tenantId` in auth store user object.

**Gap:** Frontend has no tenant context provider, no workspace switcher, no multi-tenant awareness in routing or components. Tenant propagation is one-way (login → store) with no runtime switching capability. No explicit tenant header management for delegated admin patterns.

### 4.4 Observability End-to-End

**Status: Medium**

Backend has correlation IDs via `AsyncLocalStorage` (globally wired in `main.ts`), request IDs on all routes, and audit logs. Prometheus metrics exist for queues and email sync.

**Gap:** Trace context does **not propagate across queue workers, WebSocket events, or AI tool call chains**. Frontend has zero correlation — no correlation ID forwarding, no error reporting service, no performance monitoring. Impossible to trace a user action from click to DB query.

### 4.5 Cost/Token Accounting

**Status: Medium-Low**

Backend tracks usage/cost protection at plan level via `CostProtectionService` and per-call via `AiRunLedgerService`. Frontend has billing quota alerts but no per-interaction cost display. `tokenlens` dependency exists but is unused. Per-run token-cost transparency is not first-class across backend+frontend.

### 4.6 Event-Driven Architecture

**Status: Medium**

Backend has WebSocket gateway (`RealtimeModule`) with socket.io. Frontend connects via `use-websocket.ts` and `use-email-realtime.ts`, feeding invalidations to TanStack Query. Strong event-driven design in sync/realtime subsystems.

**Gaps:**
- WebSocket gateway lacks Redis adapter — horizontal scaling breaks realtime
- No event bus (Kafka, NATS, RabbitMQ) for cross-service events
- AI orchestration and governance telemetry remain primarily request-centric and need event normalization
- No outbox pattern for domain events

---

## Section 5 — Enterprise Gap Analysis

### Gap Matrix

| Capability | Current State | Enterprise Required | Gap Severity |
|-----------|---------------|-------------------|--------------|
| **Tenant Data Isolation** | Application-layer `tenantId` filtering, no RLS | Prisma middleware + PostgreSQL RLS + negative security tests in CI | **CRITICAL** |
| **RBAC** | Flat string role, `RolesGuard` on 3/33 controllers | Permission model, global enforcement, UI gates, ABAC | **CRITICAL** |
| **Contract Tests** | Zero Pact/OpenAPI validation | Schema validation in CI, release gate | **HIGH** |
| **CRM Object Model** | Contacts only | Accounts, Contacts, Deals, Activities, Pipelines, Timeline | **HIGH** |
| **AI Run Observability** | Partial ledger, no unified entity | AI Run Ledger, run-level lineage, replayability | **HIGH** |
| **Admin Console** | Nonexistent | User mgmt, permissions, billing, audit, settings | **HIGH** |
| **Workflow Builder** | Marketing copy only | Visual builder with triggers, conditions, actions | **HIGH** |
| **Observability** | Partial Prometheus, structured logs | Full prom-client, OTel tracing, Sentry, dashboards, SLO alerting | **HIGH** |
| **Module Coupling** | `forwardRef` in 24 files | ≤8 forwardRef, event-based decoupling | **MEDIUM** |
| **Design System** | 3 competing systems | Unified system with white-label support | **MEDIUM** |
| **Accessibility** | Sparse ARIA coverage | WCAG AA compliance | **MEDIUM** |
| **Bundle Performance** | 149 deps, no budget | Tree-shaking, budgets, SSR prefetch, CI gates | **MEDIUM** |
| **JWT Refresh Rotation** | 24h access token | 15-min access + rotating refresh | **MEDIUM** |
| **Attachment Proxy** | Full in-memory buffering | Piped streaming | **MEDIUM** |
| **WebSocket Scaling** | No Redis adapter | Redis adapter for multi-instance | **MEDIUM** |
| **Distributed Tracing** | HTTP correlation only | OpenTelemetry spans across all boundaries | **MEDIUM** |
| **Legacy Encryption** | CBC decrypt fallback exists | GCM-only after backfill verification | **LOW** |
| **Event Bus** | None | Outbox pattern, Redis Streams → Kafka | **LOW** (premature) |
| **Plugin/Marketplace** | None | Extension points, sandboxed plugins | **LOW** (Phase 4) |

### Scalability Assessment

| Scale Target | Readiness | Blockers |
|-------------|-----------|----------|
| **10x users (5K)** | **Feasible with infra tuning** | Tenant isolation bug risk, no RLS, WebSocket breaks, TenantGuard uncached DB call, RBAC gaps |
| **100x data (100M emails)** | **Not viable without redesign** | 15 indexes on Email table, no partition/archive strategy, embedding backfill bottleneck, audit logs in production DB |

---

## Section 6 — Target Enterprise Architecture Proposal

### 6.1 Backend Target Architecture

```
┌─────────────────────────────────────────────────────┐
│                    API Gateway                       │
│  (Rate Limiting, Auth, Tenant Resolution, Routing)   │
├──────────┬──────────┬──────────┬───────────┬────────┤
│ Identity │  Comms   │   CRM    │    AI     │Billing │
│ & Tenant │Data Plane│   Core   │Orchestrat.│& Entit.│
├──────────┴──────────┴──────────┴───────────┴────────┤
│              Domain Service Layer                     │
│  (Business logic, validation, authorization)          │
├─────────────────────────────────────────────────────┤
│              Repository Layer (NEW)                   │
│  (Prisma abstraction, tenant-scoped queries)          │
├──────────┬──────────┬──────────────────┬────────────┤
│PostgreSQL│  Redis   │  Object Storage  │  Vector DB │
│ (+ RLS)  │(Cache/Q) │  (Attachments)   │(Embeddings)│
└──────────┴──────────┴──────────────────┴────────────┘
         ┌──────────────────────────┐
         │  Observability & Govern. │
         │  (Audit, Tracing, Compl.)│
         └──────────────────────────┘
```

**Bounded Contexts:**
- **Identity & Tenant Control Plane** — AuthN/AuthZ, tenant provisioning, org/workspace hierarchy, policy service
- **Comms Data Plane** — Email/calendar/contacts ingestion and normalization, provider connectors
- **CRM Core** — Accounts, Contacts, Deals, Activities, relationship graph, scoring
- **AI Orchestration** — Planner, tool runtime, policy guardrails, HITL, run ledger, evaluation
- **Billing & Entitlements** — Plans, quotas, cost guardrails, feature flags
- **Observability & Governance** — Audit, tracing, compliance evidence, operational metrics APIs

**Key Changes:**
- Repository layer between services and Prisma — abstracts data access, enforces tenant scoping
- Prisma client extension — auto-injects `tenantId` from `AsyncLocalStorage`
- PostgreSQL RLS — defense-in-depth for tenant isolation
- Permission model — `Permission`, `Role`, `RolePermission` with global `PermissionsGuard`
- CRM domain module — Accounts, Deals, Activities, Pipelines as first-class entities
- Event contracts replace circular `forwardRef` dependencies
- OpenTelemetry — distributed tracing across all services and queues
- Prometheus via `prom-client` — request duration, queue depth, AI cost, cache ratios

### 6.2 Frontend Target Architecture

```
┌─────────────────────────────────────────────────────┐
│       App Shell + Control Plane                      │
│  (Tenant switch, policy-aware routing, admin)        │
├──────────┬──────────┬──────────┬───────────┬────────┤
│  Email   │ Calendar │   CRM    │Automation │  Ops   │
│Workspace │Workspace │Workspace │ Workspace │Worksp. │
├──────────┴──────────┴──────────┴───────────┴────────┤
│              Shared Platform Layer                    │
│  PermissionGate, DataTable, FilterBuilder,           │
│  TimelineFeed, BulkActions, EmptyStates              │
├─────────────────────────────────────────────────────┤
│              Design System (Unified MUI)              │
│  Theme Tokens (single source of truth)               │
├─────────────────────────────────────────────────────┤
│              Data Layer                               │
│  TanStack Query + Zustand + WebSocket + SSR Prefetch │
│  + Typed API contracts + Error taxonomy              │
└─────────────────────────────────────────────────────┘
```

**Key Changes:**
- Unify design system to MUI + theme tokens. Migrate chat/AI from Tailwind.
- Permission system: `<PermissionGate permission="contacts.edit">`, `usePermission()` hook
- Tenant context provider + workspace selector
- Enterprise components: DataTable with column customization, FilterBuilder with saved views, TimelineFeed, BulkActionBar
- Observability dashboard: agent run viewer, error categorization, cost/token display
- Admin console: user management, role/permission matrix, billing controls, audit log viewer
- CRM Workspace: object explorer, timeline, saved views, bulk actions
- Automation Workspace: workflow designer, run history, approvals, rollback
- Ops Workspace: queue health, run failures, SLO dashboards, budgets

### 6.3 AI Orchestration Pattern

Three-layer orchestrator:

```
User Request
    │
    ▼
1. INTENT + PLAN LAYER
   Intent Router → Tool Selector → Permission Check → Policy Gate
    │
    ▼
2. EXECUTION LAYER
   Token Budget Check → HITL Gate → Tool Execution (typed, idempotent)
   → Circuit Breaker → LLM Call → Retries
    │
    ▼
3. GOVERNANCE LAYER
   AI Run Ledger → Cost Ledger → OTel Trace Emit → Approval Evidence
   → Rollback Registry → Response Assembly
```

**Additions over current:**
- Unified AI Run Ledger entity (run, tool calls, decisions, approvals, costs, prompts, model, latency)
- Token budget cap per request (not just step count)
- Unified circuit breaker (eliminate duplicate implementations)
- OpenTelemetry trace spans for every AI step
- Cost transparency forwarded to frontend per interaction
- Rollback registry for non-email AI actions
- Deterministic workflow mode for high-stakes automations
- Policy gates per tool/action with mandatory pre/post-conditions

### 6.4 Event-Driven Opportunities

- Introduce outbox pattern for domain events
- Emit and consume events for: email sync completion, contact updates, CRM score changes, AI action lifecycle, budget alerts
- Use event contracts to decouple modules and reduce circular dependencies (target: `forwardRef` from 24 → ≤8)
- Start with Redis Streams, evolve to Kafka at scale

### 6.5 Plugin/Module System Strategy

**Phase 1:** Internal module registry with standardized interfaces
**Phase 2:** Extension points — custom tools, custom CRM fields, custom workflows. Extension contracts (`capabilities`, `scopes`, `resource access policies`, `UI contribution points`).
**Phase 3:** Sandboxed third-party plugins with signed manifests and approval pipeline
**Phase 4:** Marketplace with billing integration, certification pipeline, compatibility versioning

### 6.6 Workflow Builder Feasibility

**Assessment:** Feasible with current foundations. The AI tool registry provides the execution engine. `@xyflow/react` already in dependencies.

**Implementation sequence:**
1. Canonical action registry and typed input/output schemas
2. Policy engine integration per node
3. Durable workflow state machine with retries and compensation steps
4. Visual builder + execution debugger + template library

### 6.7 Marketplace Extensibility

- Multi-tenant app install model with scoped permissions
- Event subscription model for app triggers
- Revenue and quota integration via entitlements service
- Security review and app certification process

---

## Section 7 — Transformation Roadmap

### Phase 1 — Stabilization & Debt Reduction (0-3 months)

| Milestone | Risk | Impact | Complexity |
|-----------|------|--------|-----------|
| Implement Prisma tenant-scoping middleware + RLS | Low | **Critical** — eliminates #1 security risk | Medium |
| Add automated tenant-leak negative security tests in CI | Low | Defense-in-depth | Low |
| Introduce frontend-backend contract tests (Pact/OpenAPI) | Low | Eliminates silent contract drift | Medium |
| Break top circular deps (reduce `forwardRef` 24→≤8) | Medium | Velocity improvement | High (labor) |
| Decompose god-files (10+ files > 500 lines) | Low | Merge conflict reduction | High (labor) |
| Fix attachment proxy to stream S3 (not buffer) | Low | Memory pressure fix | Low |
| Implement JWT refresh token rotation (24h→15min) | Low | Theft window reduction | Medium |
| Fix WebSocket Redis adapter | Low | Enables horizontal scaling | Low |
| Verify/run CBC-to-GCM re-encryption backfill | Low | Eliminates legacy decrypt path | Low |
| Fix silent CSRF token fetch catch in `api-client.ts` | Low | CSRF protection reliability | Low |
| Remove dead code/dependencies, add bundle size budget | Low | Bundle reduction, clarity | Low |
| Upgrade Prometheus endpoint with `prom-client` | Low | Enables standard monitoring | Medium |

**Exit Criteria:** Zero cross-tenant data leak risk. Contract tests in CI. Metrics standardized. All files < 500 lines. `forwardRef` ≤8.

### Phase 2 — Enterprise Foundation (3-6 months)

| Milestone | Risk | Impact | Complexity |
|-----------|------|--------|-----------|
| Build Permission model + policy-based auth (RBAC+ABAC) | Medium | Enables enterprise RBAC | High |
| Frontend `PermissionGate` + `usePermission()` | Medium | UI reflects actual permissions | Medium |
| Tenant context provider + workspace switcher | Medium | Multi-org support | Medium |
| Admin console (user mgmt, roles, audit) | Medium | Required for enterprise procurement | High |
| CRM domain module (Accounts, Deals, Activities) | Medium | Core CRM capability | High |
| Enterprise UI components (DataTable, FilterBuilder, Timeline) | Medium | CRM UX foundation | High |
| Unify design system (MUI consolidation) | Medium | Visual consistency, developer velocity | High (labor) |
| OpenTelemetry integration across all boundaries | Low | End-to-end tracing | Medium |
| Sentry/error tracking integration | Low | Production error visibility | Low |
| Establish contract testing and schema governance pipeline | Medium | Release stability | Medium |

**Exit Criteria:** RBAC functional. CRM objects in place. Admin console usable. Single design system. Tracing end-to-end.

### Phase 3 — AI Governance & Observability (6-9 months)

| Milestone | Risk | Impact | Complexity |
|-----------|------|--------|-----------|
| Implement AI Run Ledger entity + explainability APIs | Medium | Auditability, cost reconciliation | High |
| Token budget enforcement per request + per-user daily cap | Low | Cost protection | Medium |
| Per-interaction cost transparency UI | Low | User trust, budget awareness | Medium |
| AI execution trace dashboard (run timeline) | Medium | Debugging, audit, compliance | High |
| Unified circuit breaker consolidation | Low | Code clarity | Low |
| HITL native path activation + push notifications | Medium | Enterprise approval workflows | Medium |
| AI action rollback registry | Medium | Safety for non-email AI actions | High |
| Deterministic mode for high-risk automations | Medium | Regulated flow support | High |
| Operations dashboard (latency, failures, queue health, SLOs) | Medium | Operational maturity | High |
| WCAG AA accessibility audit + remediation | Medium | Enterprise/government procurement | High |

**Exit Criteria:** AI operations fully auditable with unified ledger. Cost transparent. Rollback functional. Ops dashboard live.

### Phase 4 — Marketplace & Advanced Automation (9-15 months)

| Milestone | Risk | Impact | Complexity |
|-----------|------|--------|-----------|
| Workflow builder UI (visual node editor via `@xyflow/react`) | High | Automation differentiation | Very High |
| Workflow execution engine (durable state machine) | High | Business process automation | High |
| Custom CRM fields/objects | Medium | Enterprise flexibility | High |
| Extension point API + plugin contracts | High | Platform extensibility | Very High |
| Third-party plugin sandbox + certification | High | Ecosystem growth | Very High |
| White-label theming + tenant branding profiles | Medium | Enterprise branding | Medium |
| Marketplace infrastructure + app governance | High | Revenue channel | Very High |
| App Router migration | Medium | Performance ceiling removal | High |
| Global localization expansion | Low | International readiness | Medium |

**Exit Criteria:** Workflow builder live. Plugin system functional. White-label ready. Marketplace beta.

---

## Section 8 — KPIs & Enterprise Metrics

### Platform SLO Targets

| Metric | Current | Phase 1 Target | Phase 2 Target | Enterprise Target |
|--------|---------|----------------|----------------|-------------------|
| API read p95 latency | Unknown | < 500ms | < 300ms | ≤ 300ms |
| API write p95 latency | Unknown | < 800ms | < 700ms | ≤ 700ms |
| AI chat first token p95 | Unknown | < 2.0s | < 1.5s | ≤ 1.5s |
| Queue processing success rate | Unknown | > 98% | > 99% | ≥ 99.5% |

### AI Reliability & Cost

| Metric | Current | Phase 1 Target | Enterprise Target |
|--------|---------|----------------|-------------------|
| Agent failure rate (hard fail) | Unknown | < 5% | < 2% |
| HITL action success after approval | Unknown | > 95% | ≥ 99% |
| Cost per automation run | Tracked server-side | Visible in admin UI | Visible per-user + alerts, 20% reduction via routing/caching |
| Token accounting coverage | Partial | 80% of AI runs | 100% of AI runs with prompt/completion/total persisted |

### Security & Governance

| Metric | Current | Phase 1 Target | Enterprise Target |
|--------|---------|----------------|-------------------|
| Tenant isolation integrity | Application-only (risky) | Prisma middleware + CI tests | Prisma + RLS + 0 confirmed leaks |
| Permission enforcement coverage | ~10% (3/33 controllers) | 50% endpoints | ≥ 95% with explicit policy checks + test coverage |
| Audit event completeness | Partial | 80% sensitive ops | 100% linked to actor, tenant, requestId, decision source |
| JWT access token lifetime | 24h | 30min | 15min |
| Contract test pass rate | 0% (none exist) | Introduced in CI | 100% required for release gate |

### Frontend Performance

| Metric | Current Estimate | Phase 1 Target | Enterprise Target |
|--------|-----------------|----------------|-------------------|
| Lighthouse Performance | Unknown | ≥ 80 | ≥ 90 |
| FCP | ~2-3s | < 1.5s | < 1.0s |
| LCP p75 | Unknown | < 3.0s | ≤ 2.5s |
| Bundle budget per primary route | No budget | Established with CI gate | Strict threshold, CI failure on regression |

### Testing & Release Quality

| Metric | Current | Phase 1 Target | Enterprise Target |
|--------|---------|----------------|-------------------|
| Backend test coverage | Unknown | ≥ 60% | ≥ 80% line / ≥ 90% critical-path |
| Frontend test coverage | Unknown | ≥ 50% | ≥ 70% line / ≥ 85% critical flows |
| Contract test pass rate | N/A | Introduced | 100% required for release gate |
| `forwardRef` usage | 24 files | ≤ 8 files | ≤ 4 files |

### Operational

| Metric | Current | Phase 1 Target | Enterprise Target |
|--------|---------|----------------|-------------------|
| Deployment frequency | Manual | Weekly | Daily (CI/CD) |
| MTTR | Unknown (limited observability) | < 2h | < 30min |
| Incident detection time | Unknown | < 15min (alerts) | < 5min (auto-detect) |
| Log correlation coverage | HTTP only | HTTP + queues | Full stack (FE → BE → Queue → AI → DB) |

---

## Section 9 — Immediate Executive Recommendations

**Next 30 days — highest ROI actions:**

1. **Implement Prisma tenant-scoping middleware** + add negative security tests in CI. This is the single biggest unaddressed security gap. One missed `tenantId` = data breach.

2. **Introduce frontend-backend contract tests** (Pact or OpenAPI schema validation). Zero contract tests means response drift is undetectable until runtime.

3. **Launch `forwardRef` burn-down plan** (24 files → ≤8 in Phase 1) using event contracts and domain interfaces. This unblocks all future modularization.

4. **Define enterprise authorization model** — permission taxonomy and policy service contract. `RolesGuard` covers only 3/33 controllers today.

5. **Fix attachment proxy memory buffering** (`attachments.controller.ts:128-129`) — switch to piped stream from S3. This is a live memory pressure risk.

6. **Stand up AI Run Ledger schema and telemetry contract** to unblock explainability and cost traceability.

7. **Verify CBC-to-GCM re-encryption backfill** to eliminate legacy decrypt path.

---

## Appendix A — Backend Maturity Scorecard

| Area | Score | Key Issue |
|------|-------|-----------|
| Architecture & Layering | 3.5/5 | 24 files with forwardRef, god-files, no repository layer |
| API Design | 4/5 | Dead filters, no sort DTO, zero contract tests |
| Multi-Tenancy | 4/5 design, 2/5 enforcement | No global tenant filter, no RLS |
| RBAC & Governance | 2.5/5 | Flat roles, 3/33 controllers guarded |
| AI Orchestration | 4/5 | Duplicate circuit breakers, no unified run ledger, no token budget |
| Observability | 3.5/5 | Partial Prometheus, no distributed tracing |
| Performance & Scalability | 3.5/5 | Attachment buffering, WebSocket scaling, JWT redundant calls |
| Security & Compliance | 4/5 | 24h JWT, CBC fallback, not procurement-grade evidence |
| Prisma Schema | 4.5/5 | Stale defaults, AiMessage tenant gap |

**Backend Average: 3.6/5**

## Appendix B — Frontend Maturity Scorecard

| Area | Score | Key Issue |
|------|-------|-----------|
| UI Architecture | 3/5 | God-page (1035 lines), three design systems |
| State Management | 4/5 | Aggressive invalidation, silent CSRF catch, no SSR prefetch |
| CRM UX Primitives | 1/5 | Nonexistent beyond basic contacts |
| Multi-Tenancy & RBAC UI | 1/5 | Zero permission enforcement |
| AI Layer UX | 3/5 | Missing cost transparency, execution trace, rollback |
| Observability UI | 1/5 | Absent |
| Design System & White-Label | 3/5 | Three systems, no white-label, sparse a11y |
| Performance | 3/5 | 149 deps, no bundle budget |

**Frontend Average: 2.4/5**

## Appendix C — Risk Register

| ID | Risk | Severity | Likelihood | Impact | Mitigation |
|----|------|----------|-----------|--------|------------|
| R1 | Cross-tenant data leak via missed tenantId filter | Critical | High | Data breach, legal liability | Prisma middleware + RLS + CI tests (Phase 1) |
| R2 | Contract drift between FE/BE undetected | High | High | Runtime failures, user-facing errors | Contract tests in CI (Phase 1) |
| R3 | JWT theft with 24h lifetime | High | Medium | Account takeover | Refresh rotation (Phase 1) |
| R4 | WebSocket events lost at scale | High | Certain (>1 instance) | Broken realtime UX | Redis adapter (Phase 1) |
| R5 | Attachment proxy OOM under load | Medium | Medium | API crashes | Stream piping (Phase 1) |
| R6 | Production incident undetected | High | High | Extended outage | OTel + alerts (Phase 1-2) |
| R7 | Unauthorized feature access | Medium | High | User confusion, trust erosion | RBAC + PermissionGate (Phase 2) |
| R8 | AI cost overrun per request | Medium | Medium | Unexpected bills | Token budget cap (Phase 3) |
| R9 | Bundle size regression | Low | High | Degraded load times | Size budget + CI gate (Phase 1) |
| R10 | Design system inconsistency | Medium | Certain | Developer confusion, visual bugs | MUI consolidation (Phase 2) |
| R11 | Module coupling blocks modularization | Medium | Certain | Slower velocity, harder testing | forwardRef burn-down (Phase 1) |

---

*Generated: 2026-03-04 | PMSync Enterprise Platform Audit — Consolidated*
