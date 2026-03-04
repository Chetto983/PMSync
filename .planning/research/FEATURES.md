# Feature Research: v4.0 Enterprise Stabilization

**Domain:** Enterprise platform stabilization (architecture, API contracts, auth, performance, encryption, AI governance, authorization)
**Researched:** 2026-03-03
**Confidence:** HIGH (codebase audit verified against PRD gap analysis + current ecosystem research)

## Feature Landscape

### Table Stakes (Enterprise Buyers Expect These)

Features that enterprise procurement, security reviews, and SOC2 audits assume exist. Missing any of these blocks enterprise sales or fails security review.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Standardized API response envelope** | Every enterprise integration team expects consistent `{ data, error, meta, requestId }` shape across all endpoints. Current state: ~50% of controllers return `{ success: true, ... }`, remainder return raw payloads. Two exception filters exist (`HttpExceptionFilter` returns `{ statusCode, message, timestamp }`, `AllExceptionsFilter` returns `{ statusCode, message, timestamp, path }`) -- neither includes `requestId` or structured error codes. | MEDIUM | Global response interceptor wraps all success responses. Unified exception filter wraps all errors. ~32 controllers to verify. Must be additive -- existing clients that parse `success` field still work. |
| **API error taxonomy with machine-readable codes** | Enterprise clients need error codes (not just HTTP status + freeform string) for retry logic, alerting, support ticket correlation. Current: `message` is the only error discriminator. | MEDIUM | Define error code enum per domain (e.g., `AUTH_TOKEN_EXPIRED`, `EMAIL_NOT_FOUND`, `AI_RATE_LIMITED`, `TENANT_FORBIDDEN`). Wire into exception filters. Must ship with envelope -- they're the same contract. |
| **API versioning policy enforcement** | Enterprise integrations need deprecation windows and version guarantees. Current: 7 controllers use `api/v1/` prefix, 25 controllers are unversioned (`/auth`, `/emails`, `/folders`, `/calendar`, `/contacts`, `/compliance/*`, `/webhooks/*`, etc.). No deprecation headers, no sunset dates. | MEDIUM | Global prefix strategy. Route existing unversioned paths under `/api/v1/` with redirects or aliases. Document deprecation policy (minimum 6-month sunset). Low risk if done as additive routing. |
| **httpOnly cookie auth (off localStorage)** | Every enterprise security audit flags localStorage JWT as XSS blast radius expansion. Current: `auth-store.ts` persists token via Zustand `persist` middleware to localStorage. Also sets a **non-httpOnly** cookie via `document.cookie` for attachment inline images. Both are exploitable by any XSS vector. | HIGH | Backend sets httpOnly+Secure+SameSite cookie on login/refresh. Frontend stops managing tokens entirely. CSRF protection required (double-submit or synchronizer token). Attachment proxy needs rework -- current pattern reads token from JS-accessible cookie for `<img src>` tags. Likely needs signed URL or backend proxy approach. |
| **Circular dependency reduction (15 cycles to <=5)** | Not customer-facing, but blocks testability, module isolation, lazy loading, and future service extraction. Codebase has **26 `forwardRef()` calls across 12 modules**. `ProvidersModule` alone has 5 forwardRefs. `AiChatModule` has 4 forwardRefs. `EmailModule` has 4 forwardRefs. The dependency graph is a hairball. | HIGH | Three-pronged: (1) Extract shared interfaces into domain contracts module, (2) Replace direct cross-module imports with EventEmitter2 domain events, (3) Introduce facade services at module boundaries. Each cycle break touches module wiring + integration tests. |
| **Module boundary formalization** | AI module directly imports concrete services from Email, Calendar, Contacts via forwardRef. No interface contracts. Enterprise architecture reviews flag concrete cross-module coupling as maintainability risk. Also blocks lazy loading and independent testing. | HIGH | Define TypeScript interfaces per domain boundary (e.g., `IEmailSearchService`, `ICalendarQueryService`). AI module consumes interfaces, not implementations. Providers module publishes events instead of importing consumers. |
| **Frontend performance (LCP <2.5s, TTI <3.5s)** | Current ~4.1s TTI fails Core Web Vitals "Good" threshold. Enterprise buyers run Lighthouse as part of vendor evaluation. Lighthouse CI config exists at `lighthouserc.js` with correct thresholds but they're being violated. | MEDIUM | Route-level bundle analysis via `@next/bundle-analyzer`. Dynamic imports for heavy modules (TipTap editor, assistant-ui chat, calendar). Server Component migration where applicable. Image/font optimization. Lighthouse CI already configured -- just need to actually pass the thresholds. |
| **ENC-03: Hash-based search on encrypted fields** | 17+ query sites search fields that are now encrypted at rest (from v3.1 GDPR work). Without blind indexes, these queries either silently fail, return no results, or require full-table decrypt-then-filter (O(n)). The `hashForSearch()` utility already exists in `field-encryption.utils.ts` but is explicitly commented as "reserved for future Tier 2 implementation." | HIGH | Create blind index columns per searchable encrypted field (from, subject, displayName at minimum). Backfill HMAC hashes for all existing encrypted data. Rewrite 17+ query sites to use blind index lookup instead of plaintext `contains`. Add migration script. Crypto foundation is solid (AES-256-GCM encryption, SHA-256 HMAC hashing with tenant-scoped salt). |

### Differentiators (Competitive Advantage)

Features that go beyond what enterprises minimally require and position PMSync as architecturally superior to competitors.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI Run Ledger (explainability foundation)** | Most AI email tools are black boxes. A normalized run ledger (run ID, tool calls, decisions, approvals, token costs, model, latency per step) gives enterprise compliance teams what they need for regulated industries. No competitor in the AI email space (Superhuman, Shortwave, Front) has run-level audit. Token usage is already partially tracked in `ai-chat.service.ts` (promptTokens, completionTokens). | MEDIUM | New Prisma models: `AiRunLedger` (run_id, conversation_id, user_id, tenant_id, model, total_tokens, total_cost, duration_ms, status) and `AiRunStep` (step_id, run_id, step_type [tool_call/generation/approval], tool_name, input_hash, output_hash, tokens, latency_ms). Wire into existing `AiChatService.streamChat()` via `onStepFinish` / `onFinish` callbacks. Schema + telemetry plumbing only -- no UI in v4.0. |
| **Permission taxonomy definition (RBAC to RBAC+ABAC prep)** | Current auth is role-string based (`admin`, `super-admin`) with `RolesGuard` on only **3 of 32 controllers** (tenants, email-sync, gdpr). Defining the taxonomy now -- resource:action pairs, permission enum, `PolicyService` interface -- lets enterprise customers see a credible authorization roadmap during procurement evaluation, even before full ABAC ships. | MEDIUM | Define permission enum (e.g., `email:read`, `email:send`, `calendar:manage`, `ai:chat`, `admin:tenant`, `compliance:export`). Create `PolicyService` interface contract with `canAccess(user, resource, action): boolean`. Map existing role strings to permission sets. Document which endpoints require which permissions. No runtime enforcement change yet -- that's Phase 2 per PRD. |
| **Silent fallback elimination with degraded-state telemetry** | Frontend query hooks in `use-dashboard.ts` silently fall back to empty/default data when APIs fail ("Graceful fallbacks when APIs fail"). This hides backend contract drift and gives false confidence. Replacing with explicit error boundaries + telemetry makes the platform self-diagnosing. Enterprise ops teams value platforms that surface their own issues. | LOW | Audit all query hooks for patterns like `catch(() => defaultValue)` or `fallback` patterns. Replace with typed error states that render explicit degraded UI. Optionally emit client-side telemetry for failed API calls. Low effort, high diagnostic value. |
| **Event-driven domain decoupling (outbox pattern prep)** | Beyond just breaking circular deps: introducing typed domain events (`EmailSynced`, `ContactUpdated`, `AiRunCompleted`, `FolderRenamed`) creates the foundation for future webhook/automation/marketplace features that enterprise customers expect. EventEmitter2 is the standard NestJS approach. | MEDIUM | Define typed event contracts per domain as TypeScript interfaces. Publish events from domain services. Subscribe from cross-domain consumers. Replace direct imports where possible. This is the architectural investment that compounds in PRD Phase 2 (workflow builder, marketplace). |
| **Encryption standardization (AES-GCM everywhere)** | PRD flagged mixed encryption modes: `field-encryption.utils.ts` uses AES-256-GCM (correct), but provider token encryption paths may use legacy CBC. Standardizing to authenticated encryption with rotation policy is both security hygiene and SOC2 audit evidence. | LOW | Audit all encryption call sites in `backend/src`. Verify provider-config.service.ts (9 forwardRef occurrences suggests complex crypto wiring). Migrate any legacy CBC paths to GCM. Document rotation policy. Low blast radius since GCM is already the primary path. |
| **Correlation ID global propagation** | `CorrelationInterceptor` exists but PRD notes it's "not globally wired." Propagating requestId across API -> BullMQ worker -> AI tool call -> WebSocket enables enterprise-grade incident triage without full OpenTelemetry investment. | LOW | Wire existing `CorrelationInterceptor` globally in `app.module.ts`. Pass `requestId` through BullMQ job data. Include in AI run ledger steps. Include in API response envelope `meta.requestId`. |

### Anti-Features (Commonly Requested, Often Problematic at This Stage)

Features that seem like they belong in enterprise stabilization but create more problems than they solve if attempted now.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full ABAC policy engine** | PRD recommends RBAC+ABAC. Enterprise customers ask for fine-grained permissions. | Implementing a full policy engine (Cerbos/OPA integration, policy DSL, attribute evaluation) is 3-6 months of work. Doing it before the CRM object model exists (Accounts, Deals, Activities -- PRD Phase 2) means designing policies for objects that don't exist yet. Classic premature abstraction. | Define the taxonomy and `PolicyService` interface NOW. Implement the engine in Phase 2 when CRM objects exist to authorize against. |
| **AI Run Ledger UI (run timeline, cost panel, replay)** | PRD Section 3.5 recommends agent execution trace timeline in UI. Looks great in demos. | Backend schema doesn't exist yet. Building UI on an unstable data model means throwaway work. The ledger needs to bake for at least one sprint of real production data before anyone knows what the right UI is. | Ship schema + telemetry contract in v4.0. Collect data. Build UI in Phase 3 per PRD timeline. |
| **OpenTelemetry distributed tracing** | PRD Section 2.6 recommends it. Ops teams want trace correlation across API/queue/AI/WebSocket. | Full OTel integration is large surface area: instrument all HTTP handlers, BullMQ workers, AI SDK calls, Prisma queries, WebSocket events. Requires collector infrastructure (Jaeger/Tempo). The existing `CorrelationInterceptor` + `ResponseTimeInterceptor` provide 80% of the triage value at 10% of the cost. | Wire correlation interceptor globally. Add requestId to all log lines and API responses. Full OTel in Phase 3 alongside ops dashboard. |
| **Database-level Row-Level Security (RLS)** | PRD Section 2.3 recommends DB-level tenant isolation. Security purists prefer it. | PostgreSQL RLS with Prisma is notoriously painful. Prisma doesn't support `SET` session variables natively, requiring raw SQL or middleware hacks. Prisma 7 hasn't solved this. Current `TenantGuard` app-level enforcement works, is tested, and is consistent. Breaking it for RLS introduces new failure modes. | Keep TenantGuard. Add automated tenant-leak negative tests in CI (query as tenant A, verify no tenant B data). Revisit RLS when/if migrating to multi-database per tenant. |
| **Consumer-driven contract testing (Pact)** | PRD Section 8.5 mentions 100% contract test pass rate for releases. | Pact infrastructure (broker, provider verification, consumer stubs, CI pipeline) is significant investment. Zero contract tests exist today. The gap from 0 to Pact is too large for a stabilization milestone. | Start with OpenAPI schema validation in CI -- already have Swagger/OpenAPI decorators on 51+ files (684 decorator occurrences). Validate response shapes match OpenAPI spec. Graduate to Pact when multiple frontend teams exist. |
| **Per-route bundle budgets with CI gates** | PRD Section 3.8 recommends strict bundle budgets per route. | Setting wrong budget thresholds blocks deployments with false positives. No per-route baseline data exists. Need at least one sprint of measurement before setting thresholds. | Run `@next/bundle-analyzer`, establish baselines for each route. Set budgets after collecting data. Lighthouse CI already exists for aggregate performance gating. |
| **Compliance evidence pipeline (SOC2/GDPR/ISO controls matrix)** | PRD Section 2.8 mentions procurement-grade compliance evidence. | Building a full compliance evidence pipeline (control mapping, automated evidence collection, reporting) is a project unto itself. Current audit logging and GDPR endpoints are the foundation, not the ceiling. | Document existing controls informally. Build the evidence pipeline when pursuing actual SOC2 certification (likely Phase 2-3). |

## Feature Dependencies

```
API Response Envelope
    |-- requires --> Error Taxonomy (error codes go inside envelope)
    |-- requires --> API Versioning Policy (envelope shape is the per-version contract)
    |-- requires --> Correlation ID Propagation (requestId goes in envelope meta)
    |-- enables --> Silent Fallback Elimination (frontend can parse typed errors)
    |-- enables --> OpenAPI Schema Validation (envelope shape is testable)

Module Boundary Formalization
    |-- enables --> Circular Dependency Breaking (interfaces before decoupling)
    |-- enables --> Lazy-loadable AI Module (can't lazy-load circular deps)
    |-- enables --> Event-Driven Domain Decoupling (events replace direct imports)
    |-- enables --> Independent Module Testing

Circular Dependency Breaking
    |-- requires --> Module Boundary Formalization (define interfaces first)
    |-- uses ----> Event-Driven Domain Decoupling (events are the mechanism)

httpOnly Cookie Auth
    |-- independent (no upstream deps, but changes CORS/CSRF globally)
    |-- conflicts with --> Current Attachment Proxy (reads token from JS cookie)
    |-- requires --> CSRF Protection (new requirement when using cookies)

ENC-03 Blind Indexes
    |-- requires --> hashForSearch() (already exists, unused)
    |-- requires --> Schema Migration (new columns per searchable field)
    |-- requires --> Backfill Script (hash all existing encrypted data)
    |-- blocks  --> Any new encrypted field search capability

AI Run Ledger
    |-- requires --> ConversationService (already exists)
    |-- requires --> Correlation ID Propagation (requestId links HTTP to AI run)
    |-- enhances --> Existing Audit Logging (run-level granularity on top)
    |-- enables --> Future: AI cost dashboard, run replay, policy gates per tool

Permission Taxonomy
    |-- requires --> Nothing (pure definition work, no implementation)
    |-- enables --> Future: PolicyGuard decorator, ABAC engine, admin permission UI
    |-- enhances --> Existing RolesGuard (taxonomy maps roles to permission sets)

Frontend Performance
    |-- independent (parallel workstream)
    |-- benefits from --> API Response Envelope (fewer retry/fallback code paths)
    |-- benefits from --> Silent Fallback Elimination (less dead code in bundles)

Encryption Standardization
    |-- independent (audit + migrate existing paths)
    |-- enhances --> ENC-03 (ensures consistent crypto primitives everywhere)
```

### Dependency Notes

- **API Envelope requires Error Taxonomy:** The envelope shape includes the error object structure. Designing them separately leads to mismatched contracts. They MUST ship as one unit.
- **Circular Dep Breaking requires Module Boundaries:** You cannot decouple modules until you define what the interface contracts ARE. Formalization is the prerequisite. Attempting to break cycles without interfaces is random refactoring that creates new, different coupling.
- **httpOnly Cookie conflicts with Attachment Proxy:** Current inline attachment images use `<img src="/api/attachments/...">` with a non-httpOnly cookie set by `document.cookie` in `auth-store.ts`. Migration to httpOnly means JS cannot set the cookie. Options: (a) backend proxy that reads httpOnly cookie and forwards to storage, (b) short-lived signed URLs generated server-side, (c) Next.js API route proxy.
- **AI Run Ledger requires Correlation IDs:** Without requestId propagation, run steps can't be correlated to the triggering HTTP request. Wire correlation globally before or alongside ledger work.
- **Permission Taxonomy is pure definition:** No code changes to existing auth flow. TypeScript enum + interface + documentation. Zero risk to existing functionality. Can be done by a single person in 2-3 days.
- **ENC-03 and Frontend Performance are parallelizable:** They touch completely different codebases (Prisma/backend vs Next.js/frontend) and have no dependencies on each other.

## Stabilization Priority (v4.0)

### Wave 1: Contracts & Boundaries (Ship First)

These establish the contracts everything else depends on. Without them, later work lacks stable foundations.

- [ ] **Module boundary formalization** -- Define interface contracts for all cross-domain service access points. Prerequisite for circular dep breaking.
- [ ] **API response envelope + error taxonomy + versioning** -- Ship as one unit. Global interceptor + exception filter + prefix policy. All downstream work (frontend error handling, contract validation, fallback removal) depends on this.
- [ ] **Correlation ID global wiring** -- Wire existing `CorrelationInterceptor` globally. Include requestId in response envelope. Prerequisite for AI Run Ledger.

### Wave 2: Security & Architecture (Ship After Wave 1)

These depend on Wave 1 contracts or touch security-critical paths.

- [ ] **Circular dependency breaking** -- With interfaces defined, replace forwardRef chains with events + interface injection. Target: 15 cycles to <=5.
- [ ] **httpOnly cookie migration** -- Backend sets cookie, frontend stops managing tokens. CSRF protection. Attachment proxy rework.
- [ ] **Encryption standardization** -- Audit all crypto paths, migrate legacy CBC to GCM. Low effort, high security review value.
- [ ] **Permission taxonomy definition** -- Document resource:action pairs, create `PolicyService` interface. Prep for PRD Phase 2.

### Wave 3: Data & Performance (Parallelizable After Wave 1)

These are parallelizable with each other and with Wave 2. They benefit from stable API contracts but don't strictly require Wave 2 completion.

- [ ] **ENC-03 blind indexes** -- Schema migration, backfill, 17+ query site rewrites. Most complex single feature by line count. Start as soon as schema team is available.
- [ ] **AI Run Ledger schema + telemetry** -- New Prisma models, wire into AiChatService onStepFinish/onFinish. Requires correlation IDs from Wave 1.
- [ ] **Frontend performance optimization** -- Bundle analysis, dynamic imports, Server Component migration. Lighthouse CI enforcement. Fully independent workstream.
- [ ] **Silent fallback elimination** -- Depends on API envelope being stable (Wave 1). Replace graceful degradation with explicit error states + telemetry.
- [ ] **Event-driven domain decoupling** -- EventEmitter2 typed events. Can progress alongside circular dep breaking in Wave 2 or ship as Wave 3 investment.

### Deferred (v4.1+ / PRD Phase 2-3)

- [ ] **Full ABAC policy engine** -- Needs CRM object model first (PRD Phase 2)
- [ ] **AI Run Ledger UI** -- Needs schema to stabilize + production data (PRD Phase 3)
- [ ] **OpenTelemetry distributed tracing** -- Correlation IDs first, full OTel with ops dashboard later (PRD Phase 3)
- [ ] **Database RLS** -- Keep app-level TenantGuard, add negative leak tests
- [ ] **Consumer-driven contract testing (Pact)** -- Start with OpenAPI validation, graduate later
- [ ] **Compliance evidence pipeline** -- Document existing controls, build pipeline when pursuing certification

## Feature Prioritization Matrix

| Feature | Enterprise Value | Implementation Cost | Risk if Deferred | Priority |
|---------|-----------------|---------------------|-------------------|----------|
| API response envelope + error taxonomy | HIGH | MEDIUM | HIGH -- every integration broken differently | P1 |
| API versioning policy | HIGH | LOW | HIGH -- breaking changes without deprecation window | P1 |
| Module boundary formalization | MEDIUM | MEDIUM | HIGH -- blocks all architecture refactoring | P1 |
| Correlation ID global propagation | MEDIUM | LOW | MEDIUM -- blocks AI Run Ledger, degrades incident triage | P1 |
| httpOnly cookie migration | HIGH | HIGH | HIGH -- security audit blocker for enterprise deals | P1 |
| Circular dependency breaking | MEDIUM | HIGH | MEDIUM -- blocks testability, lazy loading, service extraction | P1 |
| ENC-03 blind indexes | HIGH | HIGH | HIGH -- encrypted field search is currently broken | P1 |
| AI Run Ledger schema + telemetry | MEDIUM | MEDIUM | MEDIUM -- blocks explainability roadmap for regulated industries | P2 |
| Permission taxonomy definition | MEDIUM | LOW | LOW -- prep work, unblocks Phase 2 but doesn't block v4.0 | P2 |
| Frontend performance (LCP/TTI) | HIGH | MEDIUM | MEDIUM -- fails Lighthouse thresholds, visible in vendor evals | P2 |
| Silent fallback elimination | MEDIUM | LOW | LOW -- hidden bugs, not customer-facing but ops-impactful | P2 |
| Encryption standardization | MEDIUM | LOW | LOW -- limited blast radius, mostly audit hygiene | P2 |
| Event-driven domain decoupling | MEDIUM | MEDIUM | LOW -- architectural investment, compounds in Phase 2 | P3 |

**Priority key:**
- P1: Must ship in v4.0 -- blocks enterprise readiness, security compliance, or foundational for other work
- P2: Should ship in v4.0 -- high value relative to cost, strengthens enterprise story
- P3: Nice to have in v4.0 -- architectural investment that pays off later, can defer without blocking

## Competitor Feature Analysis

| Feature | Superhuman / Shortwave | Front (enterprise email) | HubSpot CRM | Our Approach |
|---------|------------------------|--------------------------|--------------|--------------|
| API contracts | Private API, no public contracts | Public REST API with versioned envelope and typed errors | Public API v3 with standard error codes, rate limit headers | Standardize envelope + error taxonomy + versioning. Match Front/HubSpot contract quality. |
| Auth security | httpOnly cookies + OAuth | httpOnly cookies, SSO, SAML | httpOnly cookies, SSO, OAuth, MFA | Migrate to httpOnly in v4.0. SSO/SAML deferred to Phase 2. MFA already exists. |
| AI explainability | None (black box AI) | Limited (AI suggestions with no audit trail) | None for email AI features | AI Run Ledger is a genuine differentiator. No competitor in AI email has run-level audit. |
| Permission model | Simple roles (no granular permissions) | RBAC with team-level scopes and per-inbox permissions | RBAC + custom permissions per CRM object | Define taxonomy now. Match Front's team scoping in Phase 2 when org model exists. |
| Encrypted search | N/A (cloud-hosted, trust the vendor) | N/A (cloud-hosted) | N/A (cloud-hosted) | Self-hosted advantage: ENC-03 blind indexes prove we handle data sovereignty correctly for regulated industries. |
| Performance | Sub-100ms everything (native-feel) | Fast but heavy enterprise UI | Heavy CRM, accepts slower UX | Target <2.5s LCP. Won't match Superhuman speed but must pass Lighthouse "Good" threshold. |
| Module architecture | Unknown (closed source) | Unknown (closed source) | Monolith with clear domain boundaries (public knowledge) | Break circular deps, formalize boundaries. Match HubSpot-level modularity. |

## Sources

### Primary Sources (Codebase + PRD)
- [Enterprise Platform PRD](D:/PMSync/docs/Enterprise-Platform-PRD.md) -- Sections 1-8, primary gap analysis
- [PROJECT.md](D:/PMSync/.planning/PROJECT.md) -- v4.0 scope definition and current state
- Codebase audit: 26 forwardRef() calls across 12 modules, 32 controllers with mixed versioning, `auth-store.ts` localStorage persistence, `field-encryption.utils.ts` with unused hashForSearch(), `lighthouserc.js` with violated thresholds

### Architecture & Circular Dependencies
- [NestJS Circular Dependency docs](https://docs.nestjs.com/fundamentals/circular-dependency) -- Official guidance (HIGH confidence)
- [Trilon: Avoiding Circular Dependencies in NestJS](https://trilon.io/blog/avoiding-circular-dependencies-in-nestjs) -- Event-driven patterns (MEDIUM confidence)
- [NestJS EventEmitter module patterns](https://dev.to/ezilemdodana/event-driven-architecture-with-nestjs-using-the-eventemitter-module-35fe) -- EventEmitter2 integration (MEDIUM confidence)
- [NestJS Modular Monolith + DDD template](https://github.com/jsantanders/modular-monolith-nestjs) -- Reference architecture (MEDIUM confidence)
- [NestJS Modular Monolith + Event-Driven template](https://github.com/deadislove/nestJS-modular-monolith-event-driven-architecture-template) -- Reference architecture (MEDIUM confidence)

### API Standardization
- [Standardizing API Responses in NestJS - Stackademic](https://blog.stackademic.com/standardizing-api-responses-in-nestjs-with-interceptors-and-exception-filters-cf65efd27d04) -- Interceptor + filter pattern (MEDIUM confidence)
- [nest-standard-response library](https://github.com/simioni/nest-standard-response) -- Reference implementation (MEDIUM confidence)
- [NestJS Error Handling - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/error-handling-nestjs/) -- Error taxonomy patterns (MEDIUM confidence)
- [DEV.to: Consistent NestJS responses via Interceptors](https://dev.to/refifauzan/make-your-response-consistent-in-nestjs-using-interceptors-511c) -- Implementation guide (MEDIUM confidence)

### Auth & Security
- [Next.js v16 httpOnly cookies with NestJS backend](https://github.com/vercel/next.js/discussions/85600) -- Next.js 16 specific (HIGH confidence, official discussion)
- [Refresh tokens via httpOnly Cookie - NestJS + React](https://dev.to/zenstok/part-33-how-to-implement-refresh-tokens-through-http-only-cookie-in-nestjs-and-react-265e) -- Implementation pattern (MEDIUM confidence)
- [Next.js httpOnly Cookie Auth - Max Schmitt](https://maxschmitt.me/posts/next-js-http-only-cookie-auth-tokens) -- Pattern guide (MEDIUM confidence)

### Encrypted Search
- [Blind Index for encrypted search - ankane](https://github.com/ankane/blind_index) -- Reference implementation, Ruby but pattern applies (HIGH confidence)
- [Searchable Encryption - Cossack Labs](https://docs.cossacklabs.com/acra/security-controls/searchable-encryption/) -- HMAC blind index theory (HIGH confidence)
- [Encrypted Records Searchability (Feb 2026)](https://maciej.litwiniuk.net/posts/2026-02-25-searchability-for-encrypted-records/) -- Recent practical guide (MEDIUM confidence)
- [Blind Indexes in 3 Minutes - Medium](https://medium.com/@joshuakelly/blind-indexes-in-3-minutes-making-encrypted-personal-data-searchable-b26bce99ce7c) -- Quick explainer (MEDIUM confidence)
- [SitePoint: Search on Encrypted Fields](https://www.sitepoint.com/how-to-search-on-securely-encrypted-database-fields/) -- Implementation patterns (MEDIUM confidence)

### AI Governance & Observability
- [LLM Observability Guide 2026 - Portkey](https://portkey.ai/blog/the-complete-guide-to-llm-observability/) -- AI run ledger patterns (MEDIUM confidence)
- [AI Audit Logging - Medium](https://medium.com/@pranavprakash4777/audit-logging-for-ai-what-should-you-track-and-where-3de96bbf171b) -- What to track (MEDIUM confidence)
- [AI Observability - Kore.ai](https://www.kore.ai/blog/what-is-ai-observability) -- Enterprise AI monitoring (MEDIUM confidence)
- [Enterprise AI Compliance 2025 - FutureAGI](https://futureagi.com/blogs/ai-compliance-guardrails-enterprise-llms-2025) -- Compliance requirements (MEDIUM confidence)

### Authorization Models
- [Enterprise Authorization Models - Cerbos](https://www.cerbos.dev/blog/designing-an-authorization-model-for-an-enterprise) -- RBAC+ABAC design (HIGH confidence)
- [RBAC vs ABAC vs PBAC - Oso](https://www.osohq.com/learn/rbac-vs-abac-vs-pbac) -- Permission model comparison (HIGH confidence)
- [3 Common Authorization Designs for SaaS - Cerbos](https://www.cerbos.dev/blog/3-most-common-authorization-designs-for-saas-products) -- SaaS patterns (MEDIUM confidence)
- [Enterprise Access Control Types - AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-api-access-authorization/access-control-types.html) -- AWS guidance (HIGH confidence)

### Frontend Performance
- [Next.js Performance Tuning - QED42](https://www.qed42.com/insights/next-js-performance-tuning-practical-fixes-for-better-lighthouse-scores) -- Practical LCP/TTI fixes (MEDIUM confidence)
- [React & Next.js Best Practices 2026 - FAB Web Studio](https://fabwebstudio.com/blog/react-nextjs-best-practices-2026-performance-scale) -- Current patterns (MEDIUM confidence)
- [Core Web Vitals Optimization Guide 2025](https://www.digitalapplied.com/blog/core-web-vitals-optimization-guide-2025) -- Metrics guide (MEDIUM confidence)
- [Optimize Web Vitals in Next.js App Router 2025 - Makers Den](https://makersden.io/blog/optimize-web-vitals-in-nextjs-2025) -- App Router specific (MEDIUM confidence)

---
*Feature research for: PMSync v4.0 Enterprise Stabilization*
*Researched: 2026-03-03*
