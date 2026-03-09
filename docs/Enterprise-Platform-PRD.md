# PMSync Enterprise Platform PRD

> Mixed-state architecture audit from 2026-03-06.
> This document still contains legacy JWT-refresh and older AI/runtime references that should be treated as migration history rather than the current backend source of truth.
> For the current backend reference set, use [`../technical_overview.md`](../technical_overview.md), [`../backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md`](../backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md), [`../backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md`](../backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md), and [`../backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md`](../backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md).

**Document Type:** Enterprise Platform Audit + Transformation PRD
**Date:** March 6, 2026
**Last Updated:** March 6, 2026 (codebase-verified audit)
**Scope:** `backend/` (NestJS 11, Prisma, BullMQ) and `frontend/` (Next.js 16, React 19)

## Assessment Method
- Static architecture and code audit across backend and frontend implementation.
- Dependency and coupling checks (circular dependency verification via forwardRef grep).
- Security, tenancy, RBAC, observability, AI orchestration, and enterprise UX readiness review.
- Schema analysis (58 Prisma models, Citus-ready composite PKs).
- No source code modifications performed.

---

## SECTION 1 - Executive Platform Assessment

### 1.1 Overall Architecture Maturity
PMSync is a well-structured growth-stage SaaS platform with broad functional depth (email, calendar, contacts, AI chat, queues, compliance controls, HITL automation). Significant architectural debt has been paid down since the initial audit: circular dependencies are eliminated, API contracts are standardized, auth uses httpOnly cookies, and an AI Run Ledger is operational. Remaining gaps are in governance granularity (RBAC is role-string, not policy-graph), CRM domain depth (no Account/Deal/Activity models), operational observability (no OpenTelemetry), and enterprise UX controls (no workspace switcher, no component-level permissions).

**Maturity Level:** 3.5 / 5 (Solid growth platform, approaching enterprise control plane)

### 1.2 Enterprise Readiness Score (0-100)
**68 / 100** (up from 58 — reflects debt reduction, auth hardening, API standardization, AI ledger)

### 1.3 Technical Debt Rating
**Medium (5.0 / 10 debt load)** (down from 7.2 — circular deps eliminated, response/error contracts unified, auth hardened)
- Remaining debt drivers: string-based RBAC, no OTel tracing, in-memory event bus (no outbox), minimal CRM domain model, no component-level permission guards.

### 1.4 Risk Classification
**Medium-High** (down from High)
- Primary risk domains: RBAC granularity for enterprise delegation, missing CRM domain entities for sales workflows, incomplete distributed tracing, no multi-workspace UX.

### 1.5 Scalability Ceiling Estimate
- **Users/workloads:** ~10x to 15x with current architecture plus infrastructure tuning (queue scaling, DB tuning, cache tuning). Citus-ready composite PKs on 5 core models improve sharding readiness.
- **Data volume:** ~5x to 8x before requiring explicit data-plane redesign (partition strategy, archival strategy, event streams for heavy analytics).
- **100x data target:** not achievable safely without persistent event bus (outbox pattern), data partitioning, and archive strategy.

### 1.6 Strategic Bottlenecks
- RBAC model is role-string based, not policy/permission graph based (single `role` field on User).
- No CRM domain entities (Account, Deal, Opportunity, Activity) — only Contact + relationship scoring + email-based lead detection.
- AI governance telemetry has a Run Ledger but no deterministic replay or policy-gated workflow execution.
- Frontend has auth gating but lacks enterprise route/component permission matrix enforcement.
- No workspace/org switcher UX despite backend multi-tenancy support.
- Event-driven architecture uses in-memory EventEmitter2 — no persistent outbox for guaranteed delivery.
- OpenTelemetry is referenced in comments but not integrated as an actual SDK.

---

## SECTION 2 - Backend Architecture Audit

### 2.1 Architecture and Layering
**Current state**
- 18 domain modules + 16 common infrastructure modules with clear separation.
- **Zero circular dependencies** — all eliminated through phases 32, 45-03, and 49-03.
- 6 `@Global()` modules break potential cycles: `MistralModule`, `CacheModule`, `ScheduledJobsModule`, `TransactionalEmailModule`, `StorageModule`, `ToolRegistryModule`.
- Domain events via EventEmitter2 decouple cross-module communication (e.g., `EmailIndexedEvent` decouples EmailSync from AI).

**What improved since initial audit**
- forwardRef usage fully eliminated across all module files.
- TransactionalEmailModule and StorageModule extracted as @Global() to break EmailModule cycles.
- Domain event handlers wrap in try/catch with logger.error per best practices.

**Remaining risks**
- In-memory event bus (EventEmitter2) — no persistent outbox for guaranteed delivery across restarts.
- Single-process event propagation limits horizontal scaling of event consumers.

**Recommendation**
- Introduce outbox pattern for critical domain events (email sync completion, contact updates, AI action lifecycle).
- Consider replacing EventEmitter2 with a durable message broker for multi-instance deployments.

### 2.2 API Design
**Current state**
- 36 controllers, all under `/api/v1` prefix.
- **Standardized response envelope** via `ResponseEnvelopeInterceptor`: `{ data, meta: { requestId, timestamp } }`.
- **Unified error contract** via `ApiExceptionFilter`: `{ error: { code, message, details }, meta: { requestId } }`.
- `@SkipEnvelope()` decorator available for opt-out at handler/controller level.
- Pagination/filtering strong in email endpoints.

**What improved since initial audit**
- Response envelope is now globally applied (was inconsistent).
- Error handling is unified with typed error codes (`RATE_LIMITED`, `RESOURCE_DUPLICATE`, `RESOURCE_NOT_FOUND`, `INTERNAL_ERROR`).
- Rate limit errors include `Retry-After` header.
- ValidationPipe errors parse to field-level details.

**Remaining risks**
- No formal API contract testing or versioned OpenAPI artifacts in CI.
- Single version (`v1`) — no deprecation/migration strategy for future versions.

**Recommendation**
- Introduce API contract tests and versioned OpenAPI artifact generation.
- Plan v2 versioning strategy before introducing breaking changes.

### 2.3 Multi-Tenancy
**Current state**
- `tenantId` on every domain model with cascading deletes.
- **Citus-ready composite primary keys** on 5 core models: `Email`, `Folder`, `CalendarEvent`, `Contact`, `Embedding` — `@@id([id, tenantId])`.
- Unique constraints always include `tenantId`.
- `TenantGuard` enforces active tenant and blocks cross-tenant access except `super-admin`.

**What improved since initial audit**
- Citus composite PKs enable horizontal sharding by tenant (not present in initial audit).
- Tenant cascading deletes properly configured.

**Remaining risks**
- Isolation is still application-enforced, not DB policy-enforced (no RLS).
- No automated tenant-leak negative security tests in CI.

**Recommendation**
- Add automated tenant-leak tests (negative security tests) in CI.
- Evaluate DB-level RLS for defense-in-depth.

### 2.4 RBAC and Governance
**Current state**
- Single string `role` field on User model (`admin`, `super-admin`).
- Guards: `JwtAuthGuard`, `TenantGuard`, `RolesGuard`, `LegalAcceptanceGuard`, `ConsentGuard`.
- `@Roles('admin', 'super-admin')` decorator for role enforcement.
- Audit logging via `AuditLogInterceptor` with AUDIT-01 compliance.
- GDPR compliance: append-only `UserConsent`, `LegalAcceptance`, `DataExportRequest` models.

**Risks**
- Coarse-grained authorization — no separate Role/Permission tables, no policy engine.
- Missing object-level, action-level, field-level permission controls.

**Recommendation**
- Move to policy engine model (RBAC + ABAC) with explicit permission taxonomy.
- Create centralized authorization service with permission graph.
- Extend audit model with immutable decision logs (`who`, `what`, `why`, `policyVersion`).

### 2.5 AI Orchestration Layer
**Current state**
- AI chat pipeline with rate limiting, circuit breaker, PII redaction, intent routing, tool orchestration, HITL action queue.
- **AI Run Ledger implemented** (`AiRunLedgerService`): tracks runType, model, promptTokens, completionTokens, totalTokens, estimatedCostUsd, latencyMs, toolCallCount, hitlRequired, requestId, status.
- Cost pricing per model (mistral-small-latest, mistral-large-latest).
- Fire-and-forget telemetry with error safety.
- `ActionQueue` model with confidence scoring, approval flow, and `AgentLearningProfile` for adaptive confidence.
- `WritingStyleProfile` for personalized draft generation (25+ metrics).
- 11 action types (SEND_EMAIL, REPLY_EMAIL, SCHEDULE_MEETING, CREATE_TASK, UPDATE_DEAL, etc.).

**What improved since initial audit**
- AI Run Ledger entity now exists and records per-run cost/token data.
- Agent learning profiles track approval patterns for confidence auto-adjustment.
- Writing style analysis enables personalized AI outputs.

**Remaining risks**
- No deterministic replay/auditability for regulated enterprise flows.
- No policy gates per tool/action with mandatory pre- and post-conditions.
- Cost pricing is hardcoded in service (should be configurable).

**Recommendation**
- Add deterministic workflow mode for high-stakes automations.
- Add policy gates per tool/action with mandatory pre- and post-conditions.
- Externalize cost pricing to configuration.

### 2.6 Observability
**Current state**
- Structured logging (Pino), request ID middleware, throttling filter, response-time interceptor.
- Correlation context service tracks correlationId across requests.
- AI Run Ledger provides per-run metrics.
- Prometheus-compatible health endpoints.
- Queue health instrumentation present.
- Attachment metrics service references OpenTelemetry patterns but uses in-memory counters.

**Remaining risks**
- No actual OpenTelemetry SDK integration — only comments and patterns.
- Incomplete end-to-end trace correlation across API -> queue -> worker -> AI tool call.
- Incident triage still log-centric vs trace-centric.

**Recommendation**
- Integrate OpenTelemetry SDK for distributed tracing (API -> queue -> worker -> AI tool call).
- Replace in-memory metrics with Prometheus/OTel collector.
- Add error taxonomy and SLO-based alerting.

### 2.7 Performance and Scalability
**Current state**
- Strong queue model with BullMQ, priority queues, concurrency presets, and backpressure controls.
- Redis caching for hot paths and quota checks. Redis lock service for distributed locking.
- Prisma retry service handles P2002/P2034 errors with exponential backoff.
- Circuit breaker utility for external service resilience.
- Citus-ready composite PKs for horizontal sharding on 5 core models.
- GIN trigram indexes on Email `subject` and `from` for text search.
- HNSW vector index on AIMemory `vector` for similarity search.

**Risks**
- Monolithic service scaling limits for mixed workloads.
- Attachment proxy path may buffer full content in API tier.

**Recommendation**
- Separate API and worker process scaling profiles.
- Stream attachment proxy paths without full in-memory buffering.
- Add DB partition/archive strategy for high-volume entities (emails, audit logs, AI messages).

### 2.8 Security and Compliance
**Current state**
- **httpOnly cookie authentication** (SEC-01): dual-cookie strategy with 15-min access token and 7-day refresh token scoped to `/api/v1/auth/refresh`. Production uses `__Host-` prefix.
- CSRF middleware with token-based protection on mutation requests.
- Throttling, Helmet, consent/legal guards.
- Provider tokens encrypted; field encryption extension exists.
- GDPR endpoints: consent management (append-only), data export/deletion, legal acceptance tracking, scheduled retention cleanup.
- MFA support with backup codes, WebAuthn credentials, and trusted devices.

**What improved since initial audit**
- Browser auth migrated from localStorage to httpOnly cookies (was the #1 security recommendation).
- CSRF protection fully implemented.
- MFA with WebAuthn and trusted device management.

**Remaining risks**
- Encryption approach may not be fully uniform across all token paths.
- Compliance evidence model is not yet procurement-grade (control mapping, immutable audit package).

**Recommendation**
- Audit all encryption paths for uniform AES-GCM with rotation policy.
- Produce compliance control matrix (SOC2/GDPR/ISO-aligned) and evidence pipeline.

---

## SECTION 3 - Frontend Architecture Audit

### 3.1 UI Architecture
**Current state**
- Next.js Pages Router with clear domain routes: email, calendar, contacts, AI chat, analytics, settings, tasks, profile.
- 14 component directories organized by feature: `ai`, `billing`, `calendar`, `chat`, `common`, `contacts`, `crm`, `dashboard`, `email`, `layout`, `mfa`, `productivity`, `providers`, `settings`, `ui`.
- AI chat uses assistant-ui runtime with 17 self-registering tool UIs.
- `ChatChainOfThought` displays step-by-step AI reasoning.

**Risks**
- Some complexity in chat components (custom CSS files alongside Tailwind).
- No explicit enterprise shell/control-plane segregation.

**Recommendation**
- Consider consolidating CSS approach in chat components (Tailwind only or MUI only).
- Introduce admin/governance workspace separation for enterprise personas.

### 3.2 State Management
**Current state**
- TanStack Query for server state with 5-min stale time and 30-min GC time.
- 9 Zustand stores for UI state: auth, dashboard, email-ui, calendar, contact, folders, label, label-tree, sync.
- Auth context validates session via `/auth/me` endpoint using httpOnly cookie.
- Hydration-safe using `useSyncExternalStore` (React 18 pattern).
- Query hooks organized in `hooks/queries/` with barrel exports.

**What improved since initial audit**
- Auth token no longer in localStorage — fully cookie-based.
- Comprehensive query hook library with proper key factories.

**Remaining risks**
- Error handling supports both old (`{ message }`) and new (`{ error: { message } }`) shapes — migration shim still present.

**Recommendation**
- Remove dual error shape support once backend migration is fully verified.
- Add telemetry for API error patterns to detect contract drift.

### 3.3 Enterprise CRM UX Primitives
**Current state**
- Contact management with relationship scoring (relationshipScore, recencyScore, frequencyScore, reciprocityScore, trendScore).
- Stale contact detection via `CrmAlertsWidget` (top 5 stale contacts).
- Email-based lead detection via `EmailAnalysis` (DealSignal enum: NEW_LEAD, INTEREST_SHOWN, OBJECTION, NEGOTIATION, READY_TO_BUY, CHURNING).
- Contact activity feed component exists.
- Follow-up tracking with commitment/waiting-for/action-item extraction.
- NLP deadline detection on emails.

**Still missing for Salesforce-grade CRM**
- No Account/Organization entity.
- No Deal/Opportunity entity or pipeline stages (only email-level DealSignal detection).
- No Activity/Call Log entity (only email interactions tracked).
- No saved views, advanced segment builder, or bulk admin workflows across CRM objects.
- No workflow builder UX with auditable automation graph.

**Recommendation**
- Build canonical CRM data model (Account, Deal, Activity) before adding advanced automation.
- Add object-centric timeline and global activity feed.
- Add saved views and enterprise-grade grid/table interactions.

### 3.4 Multi-Tenancy and RBAC UI
**Current state**
- `RouteGuard` component enforces authentication for `/dashboard` routes.
- Tenant identity present in auth store (populated from `/auth/me`).
- User role field available but no frontend permission matrix.
- Backend enforces all RBAC policies; frontend defers to backend responses.

**Gaps**
- No workspace/org switcher UX (backend supports multi-tenancy but frontend doesn't expose switching).
- No route-level role matrix enforcement in frontend.
- No component-level permission guard framework.

**Recommendation**
- Add policy-aware route guards and component guards.
- Add tenant/workspace switcher with explicit context banner.
- Build admin permission matrix screens.

### 3.5 AI Layer UX
**Current state**
- Full chat interface with `ChatRuntimeProvider` (assistant-ui runtime).
- **17 tool UIs** self-registering: EmailSearch, ListEmails, SemanticSearch, EmailList, EmailContent, Contact, Event, Folder, Count, Analysis, FollowUp, Memory, Briefing, CRM, Triage, plus FallbackToolUI.
- `HitlApprovalCard` for human-in-the-loop approval flow.
- `ChatChainOfThought` for step-by-step reasoning display.
- `ChatSuggestions` for contextual action suggestions.
- Desktop and mobile chat layouts.

**Gaps**
- No full agent execution trace timeline (chain-of-thought is partial).
- No undo/rollback model for completed automations.
- No per-run token/cost transparency surface in UI (data exists in backend AI Run Ledger).

**Recommendation**
- Add run timeline UI exposing AI Run Ledger data (intent, tool calls, approvals, outputs, costs).
- Add rollback-capable action cards where operations are reversible.
- Surface per-run cost and token panel from backend ledger.

### 3.6 Observability UI
**Current state**
- Analytics page at `/dashboard/analytics`.
- Dashboard widgets: QuickActionsBar, PredictiveInsightsWidget, UnreadEmailsWidget, DeadlinesWidget, TodayEventsWidget, FollowUpWidget, PriorityInboxWidget, AiTriageWidget, TrendChartsWidget, BriefingWidget.
- Billing quota alert banner (`QuotaAlertBanner`).

**Gaps**
- No operations console for AI/automation runs.
- No failure categorization dashboard.
- No latency/SLO visualizations by tenant/workflow.

**Recommendation**
- Build operations dashboard for support/ops/admin personas.
- Add failure classes, retry visibility, queue lag and SLA burn indicators.

### 3.7 Design System and White-Label
**Current state**
- Strong theme token system with design tokens (`tokens.ts`), typography, light/dark themes.
- MUI integration with Next-themes for system/light/dark switching.
- Brand colors: Primary cyan `hsl(189, 70%, 50%)`, Secondary purple `hsl(258, 55%, 57%)`.
- Semantic domain colors: email=blue, calendar=orange, contacts=purple, tasks=green.
- Comprehensive i18n: English (130KB) and Italian (138KB) translation files with typed locale hook.
- Error boundaries and skeleton loading patterns.

**Gaps**
- Branding is globally hardcoded, not tenant-overridable.
- i18n scope limited to EN/IT — insufficient for enterprise global rollout.
- Mixed CSS approaches: MUI for main app, Tailwind for chat components, custom CSS files for chat layout.

**Recommendation**
- Introduce tenant branding profile (logo, palette, typography, domain assets).
- Expand i18n framework to full locale pack strategy + formatting standards.
- Consolidate CSS approach to reduce maintenance burden.
- Establish accessibility budget and CI gates (WCAG AA).

### 3.8 Performance
**Current state**
- Dynamic imports with SSR: false for non-critical components (ExpandedMessage, LabelPickerDialog, FolderPickerDialog, KeyboardShortcutsDialog).
- React.lazy + Suspense for email thread view.
- WidgetSkeleton and ThreadListSkeleton fallbacks.
- TanStack Query with 5-min stale time and request deduplication.
- Next.js Image component for automatic AVIF/WebP optimization.
- Bundle analyzer integration exists.

**Risks**
- Large dependency surface and complex dashboard pages can regress TTI/FCP without strict budgets.

**Recommendation**
- Set bundle budgets per route.
- Add CI checks for Web Vitals regression.
- Partition heavy modules (editor/chat/calendar) by route-level chunks.

---

## SECTION 4 - Cross-Layer Analysis

### 4.1 API Contract Stability
**Status:** Medium-High (up from Medium-Low)
- Response envelope and error contracts are now standardized globally.
- Frontend error-utils still supports dual error shape (old + new) — migration shim should be removed.
- No formal contract testing in CI yet.

### 4.2 Error Model Consistency
**Status:** Medium-High (up from Low)
- Backend error shape is normalized via `ApiExceptionFilter` with typed codes.
- Frontend `getApiErrorMessage()` handles both old and new shapes gracefully.

### 4.3 Authentication Flow Integrity
**Status:** High (up from Medium)
- Backend uses httpOnly cookies with `__Host-` prefix in production.
- CSRF protection active on mutation requests.
- Frontend never touches tokens directly (XSS-proof).
- Auto-refresh with queue-based concurrency handling for 401s.
- MFA with WebAuthn, backup codes, and trusted devices.

### 4.4 Tenant Context Propagation
**Status:** Medium (unchanged)
- Tenant context carried in JWT and enforced by guards.
- Citus-ready composite PKs enable future sharding.
- Frontend lacks multi-workspace UX and explicit tenant header management.

### 4.5 End-to-End Observability Traceability
**Status:** Medium (up from Medium-Low)
- Correlation context service exists.
- AI Run Ledger provides per-run telemetry.
- Full request -> queue -> worker -> AI tool distributed trace still incomplete (no OTel SDK).

### 4.6 Cost/Token Accounting Alignment
**Status:** Medium-High (up from Medium-Low)
- AI Run Ledger records promptTokens, completionTokens, totalTokens, estimatedCostUsd per run.
- Per-run data exists in backend but is not yet surfaced in frontend UI.

### 4.7 Logging Correlation Capability
**Status:** Medium-High (up from Medium)
- Request IDs via middleware.
- Correlation context service tracks correlationId.
- AI Run Ledger includes requestId for cross-referencing.
- Global propagation across all async boundaries still partial.

### 4.8 Event-Driven vs Request-Driven Coherence
**Status:** Medium-High (up from Medium)
- Domain events via EventEmitter2: EmailSyncedEvent, EmailIndexedEvent, ContactCreatedEvent, ContactUpdatedEvent, ProviderAuthRefreshedEvent, TenantDeletedEvent, ConsentGrantedEvent/RevokedEvent, etc.
- Event handlers decouple EmailSync -> AI pipeline.
- No persistent outbox — in-memory event bus limits durability guarantees.

---

## SECTION 5 - Enterprise Gap Analysis Matrix

| Domain | Current State | Required State (Enterprise CRM AI) | Gap Severity |
|---|---|---|---|
| Enterprise CRM platform | Contact + relationship scoring + email-based lead detection (DealSignal), no Account/Deal/Activity | Canonical CRM domain model with extensible object graph and timeline | High |
| AI-powered automation layer | Chat + 17 tool UIs + HITL + Run Ledger + agent learning profiles | Policy-governed deterministic automation, full replay, per-run cost UI | Medium-High |
| Governance and compliance | String-based RBAC + audit logs + GDPR endpoints + consent management | Fine-grained policy engine (RBAC+ABAC), immutable evidence pipeline, control mapping | High |
| Operational maturity | Health endpoints, queue metrics, structured logs, correlation IDs, Run Ledger | SLO-driven ops console, OpenTelemetry distributed tracing, incident-grade telemetry | Medium-High |
| Scalability to 10x users | Citus-ready composite PKs, Redis caching, BullMQ queues | Proven horizontal scale playbooks and workload partitioning | Medium-Low |
| Scalability to 100x data | Citus-ready but no outbox pattern, no archive strategy | Partitioned data plane, persistent event bus, archive strategy, event-driven analytics | Medium-High |

---

## SECTION 6 - Target Enterprise Architecture Proposal

### 6.1 Ideal Backend Architecture
Evolve the current **modular monolith** (18 domain modules, zero circular deps) toward **service-oriented boundaries** with strict domain ownership.

**Proposed bounded contexts**
- `Identity & Tenant Control Plane`
  - AuthN/AuthZ, tenant provisioning, org/workspace hierarchy, policy service.
  - **Current foundation:** auth module, tenants module, users module, compliance module.
- `Comms Data Plane`
  - Email/calendar/contacts ingestion and normalization, provider connectors.
  - **Current foundation:** email, email-sync, calendar, contacts, providers, labels modules.
- `CRM Core` (NEW)
  - Accounts, Deals, Activities, pipeline stages, relationship graph, scoring.
  - **Current foundation:** Contact model with relationship scoring, EmailAnalysis with DealSignal.
- `AI Orchestration`
  - Planner, tool runtime, policy guardrails, HITL, run ledger, evaluation.
  - **Current foundation:** ai, ai-chat, mistral modules, tool-registry, ActionQueue, AgentLearningProfile, AiRunLedger.
- `Billing & Entitlements`
  - Plans, quotas, cost guardrails, feature flags.
  - **Current foundation:** subscription module with Autumn integration, feature flag guards.
- `Observability & Governance`
  - Audit, tracing, compliance evidence, operational metrics APIs.
  - **Current foundation:** audit module, correlation context, AI Run Ledger, health module.

### 6.2 Ideal Frontend Architecture
- `App Shell + Control Plane` (tenant switch, policy-aware routing, admin console).
- `CRM Workspace` (object explorer, timeline, saved views, bulk actions).
- `Automation Workspace` (workflow designer, run history, approvals, rollback).
- `Ops Workspace` (queue health, run failures, SLO dashboards, budgets).
- Shared platform SDK for typed API contracts, error taxonomy, permission guards.

### 6.3 AI Orchestration Pattern
Evolve current three-layer orchestrator:
1. **Intent + Plan Layer** (classify, plan, policy-check) — partially exists via intent routing.
2. **Execution Layer** (typed tools, retries, idempotency keys) — 17 tools operational with HITL.
3. **Governance Layer** (HITL gates, run ledger, cost and policy audit) — Run Ledger + ActionQueue operational, policy gates pending.

### 6.4 Event-Driven Opportunities
- **Migrate from in-memory EventEmitter2 to persistent outbox pattern** for critical domain events.
- Current domain events to preserve: EmailSyncedEvent, EmailIndexedEvent, ContactCreatedEvent, ContactUpdatedEvent, ProviderAuthRefreshedEvent, TenantDeletedEvent, ConsentGrantedEvent/RevokedEvent.
- Add events for: CRM score changes, AI action lifecycle, budget alerts, deal stage transitions.

### 6.5 Plugin/Module System Strategy
- Define extension contracts (`capabilities`, `scopes`, `resource access policies`, `UI contribution points`).
- Require signed manifests and sandboxed execution for third-party actions.
- Provide compatibility versioning and marketplace validation pipeline.

### 6.6 Workflow Builder Feasibility
Feasible with current foundations if this sequence is followed:
1. Canonical action registry (11 ActionTypes already defined) and typed input/output schemas.
2. Policy engine integration per node.
3. Durable workflow state machine with retries and compensation steps (VoltAgent workflow_states model exists as foundation).
4. Visual builder + execution debugger.

### 6.7 Marketplace Extensibility Strategy
- Multi-tenant app install model with scoped permissions.
- Event subscription model for app triggers.
- Revenue and quota integration via entitlements service.
- Security review and app certification process.

---

## SECTION 7 - Transformation Roadmap

## Phase 1 - Enterprise Foundation (0-3 months)
**Milestones**
- Introduce policy-based authorization service (RBAC+ABAC) replacing string-based roles.
- Implement workspace/org model and tenant switching UX.
- Add API contract tests and versioned OpenAPI artifact generation.
- Remove frontend dual error shape shim.
- Add automated tenant-leak negative security tests in CI.

**Risk:** Medium-High
**Impact:** Very High (enterprise procurement readiness)
**Complexity:** High

## Phase 2 - CRM Domain and Observability (3-6 months)
**Milestones**
- Deliver CRM canonical objects (Account, Deal, Activity) with timeline and saved views.
- Integrate OpenTelemetry SDK for distributed tracing (API -> queue -> worker -> AI tool call).
- Surface AI Run Ledger data in frontend (per-run cost/token panel).
- Ship operations dashboard (latency, failures, budget, queue health).
- Add deterministic workflow mode for high-risk AI automations.

**Risk:** High
**Impact:** Very High (CRM depth + auditability)
**Complexity:** High

## Phase 3 - Scale and Governance (6-9 months)
**Milestones**
- Migrate EventEmitter2 to persistent outbox pattern for critical domain events.
- Add DB partition/archive strategy for high-volume entities (emails, audit logs, AI messages).
- Produce compliance control matrix (SOC2/GDPR/ISO-aligned) and evidence pipeline.
- Implement component-level permission guards in frontend.
- Add SLO-based alerting and error taxonomy.

**Risk:** Medium-High
**Impact:** High (scale + compliance)
**Complexity:** High

## Phase 4 - Marketplace and Advanced Automation (9-15 months)
**Milestones**
- Release workflow builder with reusable templates.
- Launch plugin/marketplace extension framework.
- Add certification and app governance pipeline.
- Expand white-label and global localization capabilities.
- Add rollback-capable action cards in AI UX.

**Risk:** High
**Impact:** Transformational (platform expansion and monetization)
**Complexity:** Very High

---

## SECTION 8 - KPIs and Enterprise Metrics

### 8.1 Platform SLO Targets
- API read latency p95: **<= 300 ms**
- API write latency p95: **<= 700 ms**
- AI chat first token p95: **<= 1.5 s**
- Queue processing success rate: **>= 99.5%**

### 8.2 AI Reliability and Cost
- Agent run failure rate (hard fail): **< 2.0%**
- HITL action execution success after approval: **>= 99.0%**
- Cost per automation run (median): track and reduce by **20%** with routing/caching optimization
- Token accounting coverage: **100% of AI runs** have prompt/completion/total tokens persisted (AI Run Ledger operational)

### 8.3 Security and Governance
- Tenant isolation integrity: **0 confirmed cross-tenant leaks**, continuous negative security tests in CI
- Permission enforcement coverage: **>= 95%** endpoints with explicit policy checks and test coverage
- Audit event completeness: **100%** sensitive operations linked to actor, tenant, requestId, decision source

### 8.4 Frontend Performance and Quality
- Lighthouse Performance (core dashboard routes): **>= 90**
- Largest Contentful Paint p75: **<= 2.5 s**
- JS bundle budget per primary route: strict threshold with CI failure on regression

### 8.5 Testing and Release Quality
- Backend test coverage target: **>= 80% line / >= 90% critical-path services**
- Frontend test coverage target: **>= 70% line / >= 85% critical interaction flows**
- Contract test pass rate (frontend-backend): **100% required for release gate**

---

## SECTION 9 - Current Architecture Inventory

### 9.1 Backend Modules (18 Domain + 16 Common)

| Module | Controllers | Key Services |
|--------|-------------|-------------|
| ai | 4 | Briefing, triage, knowledge base, embeddings, email analysis |
| ai-chat | 2 | Streaming chat, HITL approval |
| audit | 0 | AuditLogInterceptor, audit service |
| auth | 2 | JWT, MFA, WebAuthn, OAuth, cookie management |
| calendar | 2 | Calendar sync, webhooks |
| compliance | 5 | GDPR, consent, data deletion/export, legal acceptance |
| contacts | 2 | Contact CRUD, relationship scoring, sync |
| email | 7 | Email CRUD, folders, attachments, signatures, templates, calendar invites |
| email-sync | 2 | Gmail, Microsoft, IMAP drivers, webhooks |
| health | 1 | Health checks, diagnostics |
| labels | 1 | Email label management |
| mistral | 0 | @Global LLM provider |
| providers | 2 | OAuth provider management, callbacks |
| realtime | 0 | WebSocket gateways |
| subscription | 3 | Billing (Autumn), webhooks, usage tracking |
| tenants | 1 | Tenant management |
| users | 1 | User profiles, preferences |
| tool-registry | 0 | @Global AI tool registration |

**Common Infrastructure:** Cache, scheduled jobs, Redis (lock, rate limiter, connection), Prisma retry, crypto, correlation context, feature flags, CSRF middleware, request ID middleware, circuit breaker.

### 9.2 Database Models (58 Total)

| Category | Models | Count |
|----------|--------|-------|
| Core Tenancy & Auth | Tenant, User, Session, RefreshToken, PasswordResetToken, UserPreferences, DashboardPreference, MfaSecret, MfaBackupCode, TrustedDevice, WebAuthnCredential | 11 |
| Email | Email, Folder, EmailLabel, UserLabel, EmailAttachment, EmailSignature, EmailTemplate, ScheduledEmail, EmailFollowUp, EmailAnalysis, AiDraftFeedback | 11 |
| Calendar | CalendarEvent, CalendarEventAttachment, CalendarPreference, CalendarSyncState | 4 |
| Contacts | Contact, ProviderContact | 2 |
| AI & Learning | AiConversation, AiMessage, AIMemory, AiRunLedger, MistralAgent, WritingStyleProfile, Embedding | 7 |
| Actions & Automation | ActionQueue, AgentLearningProfile, AgentActionFeedback | 3 |
| Compliance | AuditLog, UserConsent, LegalAcceptance, DataExportRequest, WebhookSubscription | 5 |
| Billing | Subscription | 1 |
| Provider | ProviderConfig | 1 |
| External (VoltAgent) | voltagent_memory_conversations, voltagent_memory_messages, voltagent_memory_steps, voltagent_memory_users, voltagent_memory_workflow_states | 5 |

**Citus-Ready (Composite PKs):** Email, Folder, CalendarEvent, Contact, Embedding

### 9.3 Frontend Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/auth/*` | Login, register, OAuth callback, password reset |
| `/dashboard` | Main dashboard with 10+ widgets |
| `/dashboard/email` | Email client (compose, threads) |
| `/dashboard/ai` | AI chat (17 tool UIs, HITL, chain-of-thought) |
| `/dashboard/ai/follow-ups` | Follow-up tracking |
| `/dashboard/calendar` | Calendar view |
| `/dashboard/contacts` | Contact management |
| `/dashboard/tasks` | Productivity / Kanban |
| `/dashboard/analytics` | Analytics dashboard |
| `/dashboard/settings` | User settings |
| `/dashboard/profile` | User profile |
| `/privacy`, `/terms` | Legal pages |

---

## Immediate Executive Recommendations (Next 30 Days)
1. Define enterprise authorization model (permission taxonomy and policy service contract) to replace string-based roles.
2. Add automated tenant-leak negative security tests in CI.
3. Remove frontend dual error shape shim (backend error contract is now standardized).
4. Add API contract tests with versioned OpenAPI artifact generation.
5. Surface AI Run Ledger data in a minimal frontend panel to demonstrate cost/token transparency.
6. Evaluate persistent event bus options to replace in-memory EventEmitter2 for critical paths.
