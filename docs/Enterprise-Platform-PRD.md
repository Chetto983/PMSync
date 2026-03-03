# MailAgent Enterprise Platform PRD

**Document Type:** Enterprise Platform Audit + Transformation PRD  
**Date:** March 3, 2026  
**Scope:** `backend/` (NestJS 11, Prisma, BullMQ) and `frontend/` (Next.js 16, React 19)

## Assessment Method
- Static architecture and code audit across backend and frontend implementation.
- Dependency and coupling checks (including circular dependency detection).
- Security, tenancy, RBAC, observability, AI orchestration, and enterprise UX readiness review.
- No source code modifications performed.

---

## SECTION 1 - Executive Platform Assessment

### 1.1 Overall Architecture Maturity
MailAgent is a strong growth-stage SaaS platform with broad functional depth (email, calendar, contacts, AI chat, queues, compliance controls). It is **not yet enterprise-grade CRM architecture** because governance, API consistency, control-plane separation, and AI run observability are partial.

**Maturity Level:** 2.8 / 5 (Growth platform, pre-enterprise control plane)

### 1.2 Enterprise Readiness Score (0-100)
**58 / 100**

### 1.3 Technical Debt Rating
**High (7.2 / 10 debt load)**
- Core debt drivers: module coupling, mixed API versioning, partial RBAC model, inconsistent response contracts, frontend fallback/mocked paths in production API clients.

### 1.4 Risk Classification
**High**
- Primary risk domains: governance and RBAC coverage, contract drift, security posture around browser token handling, and incomplete AI operational traceability.

### 1.5 Scalability Ceiling Estimate
- **Users/workloads:** ~8x to 12x with current architecture plus infrastructure tuning (queue scaling, DB tuning, cache tuning).
- **Data volume:** ~3x to 5x before requiring explicit data-plane redesign (partition strategy, archival strategy, event streams for heavy analytics).
- **100x data target:** not achievable safely without architectural refactor.

### 1.6 Strategic Bottlenecks
- Monolith-level module coupling (15 circular dependencies in backend dependency graph).
- No centralized API versioning/policy layer.
- RBAC model is role-string based, not policy/permission graph based.
- AI governance telemetry is partial (limited run-level lineage and cost/token reconciliation).
- Frontend has auth gating but lacks enterprise route/component permission matrix enforcement.
- Tenant isolation is largely app-level discipline; no database-level row-level security enforcement.

---

## SECTION 2 - Backend Architecture Audit

### 2.1 Architecture and Layering
**Current state**
- 17 domain modules with broad coverage.
- Dependency graph shows **15 circular dependencies** (madge), including chains across `ai`, `email`, `calendar`, `email-sync`, `providers`, `contacts`.
- Extensive cross-module `forwardRef` style coupling in critical services.

**Risks**
- Slower change velocity and higher regression risk.
- Harder test isolation and domain boundary enforcement.
- Runtime wiring fragility for future platform extensions.

**Recommendation**
- Split into explicit bounded contexts: `Identity/Tenant`, `Comms Core`, `CRM Core`, `AI Orchestration`, `Billing/Entitlements`, `Observability`.
- Replace cyclic imports with event contracts + domain interfaces.
- Enforce architectural dependency rules in CI.

### 2.2 API Design
**Current state**
- 32 controllers with mixed routing patterns.
- Mixed versioning style (`api/v1/...` on some controllers, many unversioned paths).
- Response envelope is inconsistent (`{ success: true, ... }` in roughly half of controllers, raw payload in the rest).
- Pagination/filtering quality is strong in key email endpoints, not uniformly standardized across all domains.

**Risks**
- Client contract instability across teams/integrations.
- Higher API migration cost and weaker deprecation control.

**Recommendation**
- Enforce global API prefix + versioning strategy.
- Standardize response contract (`data`, `error`, `meta`, `requestId`).
- Introduce API contract tests and versioned OpenAPI artifacts.

### 2.3 Multi-Tenancy
**Current state**
- `tenantId` is pervasive in schema design and indexes.
- `TenantGuard` enforces active tenant and blocks cross-tenant access except `super-admin`.
- Service-level tenant filtering is broadly present.

**Risks**
- Isolation is mostly application-enforced, not DB policy-enforced.
- Future code paths can still introduce accidental tenant leakage.

**Recommendation**
- Add DB-level isolation controls (RLS or equivalent enforcement strategy).
- Add automated tenant-leak tests (negative security tests) in CI.
- Formalize tenant context propagation contracts (request, queue, event).

### 2.4 RBAC and Governance
**Current state**
- Roles model exists (`admin`, `super-admin`, etc.) with `RolesGuard`.
- Guard usage is **not uniform**; permission checks are concentrated on selected endpoints.
- Audit logging exists for HTTP data access and AI tool execution.

**Risks**
- Coarse-grained authorization for enterprise delegation models.
- Missing policy-level controls (object-level, action-level, field-level).

**Recommendation**
- Move to policy engine model (RBAC + ABAC).
- Create centralized authorization service with explicit permission taxonomy.
- Extend audit model with immutable decision logs (`who`, `what`, `why`, `policyVersion`).

### 2.5 AI Orchestration Layer
**Current state**
- AI chat pipeline includes rate limiting, circuit breaker, PII redaction, intent routing, tool orchestration, HITL action queue.
- Tool execution audit exists.
- Cost and quota controls exist via subscription + usage services.
- Token usage metadata is partially captured but cost reconciliation is not fully token-accurate end-to-end.

**Risks**
- Limited deterministic replay/auditability for enterprise regulated flows.
- AI run explainability and approval evidence are not fully normalized into a single run ledger.

**Recommendation**
- Introduce **AI Run Ledger** entity (run, tool calls, decisions, approvals, costs, prompts, model, latency).
- Add deterministic workflow mode for high-stakes automations.
- Add policy gates per tool/action with mandatory pre- and post-conditions.

### 2.6 Observability
**Current state**
- Structured logging (Pino), request ID middleware, throttling filter, response-time interceptor, health and Prometheus endpoints.
- Queue health instrumentation is present.
- Correlation interceptor exists but is not globally wired.

**Risks**
- Incomplete end-to-end trace correlation across API, queue, AI, and websocket paths.
- Incident triage still log-centric vs trace-centric.

**Recommendation**
- Adopt OpenTelemetry tracing (API -> queue -> worker -> AI tool call).
- Enforce correlation IDs across all async boundaries.
- Add error taxonomy and SLO-based alerting (not only health endpoints).

### 2.7 Performance and Scalability
**Current state**
- Strong queue model with BullMQ, priority queues, concurrency presets, and backpressure controls.
- Redis caching is present for hot paths and quota checks.
- Background processing patterns are mature for sync-heavy workloads.

**Risks**
- Monolithic service scaling limits for mixed workloads.
- Some endpoints still perform potentially expensive sync operations.
- Attachment proxy path buffers full content in API tier, increasing memory pressure under load.

**Recommendation**
- Separate API and worker process scaling profiles.
- Stream attachment proxy paths without full in-memory buffering.
- Add DB partition/archive strategy for high-volume entities (emails, audit logs, AI messages).

### 2.8 Security and Compliance
**Current state**
- JWT with session truth checks, CSRF middleware, throttling, helmet, consent/legal guards.
- Provider tokens encrypted; field encryption extension exists.
- GDPR-related export/deletion/compliance endpoints and scheduled retention cleanup exist.

**Risks**
- Browser token persistence strategy in frontend increases XSS blast radius.
- Encryption approach is not fully uniform (legacy CBC for some token paths vs GCM elsewhere).
- Compliance evidence model is not yet procurement-grade (control mapping, immutable audit package).

**Recommendation**
- Migrate browser auth to secure httpOnly cookie strategy.
- Standardize all encryption to authenticated mode (AES-GCM) with rotation policy.
- Produce compliance control matrix (SOC2/GDPR/ISO-aligned) and evidence pipeline.

---

## SECTION 3 - Frontend Architecture Audit

### 3.1 UI Architecture
**Current state**
- Pages-based architecture with clear domain entry points (`email`, `calendar`, `contacts`, `ai`, `settings`, `analytics`).
- Component organization is generally feature-oriented.

**Risks**
- Some large files aggregate multiple responsibilities (query fallback logic, transport logic, UI orchestration).
- No explicit enterprise shell/control-plane segregation.

**Recommendation**
- Introduce clear frontend domain packages: `crm`, `automation`, `admin`, `governance`, `operations`.
- Move cross-cutting concerns (permissions, feature flags, policy gates) into shared platform layer.

### 3.2 State Management
**Current state**
- TanStack Query for server state and Zustand for UI/auth state is appropriate.
- Cache key strategy and invalidation patterns are broadly consistent.

**Risks**
- Multiple query hooks silently fall back to alternate/mock-like paths on failures, which can hide contract drift.
- Authentication token persisted in localStorage-based Zustand state.

**Recommendation**
- Replace silent fallbacks with explicit degraded states + telemetry.
- Consolidate API error normalization and enforce typed error contracts.
- Remove localStorage token dependency.

### 3.3 Enterprise CRM UX Primitives
**Current state**
- Contacts and relationship intelligence widgets exist.
- Follow-up workflow and Kanban-like productivity patterns are present.
- Bulk actions exist in email/contact contexts.

**Missing for Salesforce-grade CRM**
- Canonical CRM object model UX: Accounts, Opportunities/Deals, Activities timeline across all objects.
- Saved views, advanced segment builder, bulk admin workflows across CRM objects.
- Workflow builder UX with auditable automation graph.

**Recommendation**
- Build unified CRM data model UI layer before adding advanced automation.
- Add object-centric timeline and global activity feed.
- Add saved views and enterprise-grade grid/table interactions.

### 3.4 Multi-Tenancy and RBAC UI
**Current state**
- Route guard enforces authentication for dashboard routes.
- Tenant identity is present in user state.

**Gaps**
- No workspace/org switcher UX.
- No route-level role matrix enforcement.
- No component-level permission guard framework.

**Recommendation**
- Add policy-aware route guards and component guards.
- Add tenant/workspace switcher with explicit context banner.
- Build admin permission matrix screens.

### 3.5 AI Layer UX
**Current state**
- Chat interface with tool UIs and HITL approvals is implemented.
- Conversation and action APIs are integrated.

**Gaps**
- No full agent execution trace timeline in UI.
- No undo/rollback model for completed automations.
- No per-run token/cost transparency surface.

**Recommendation**
- Add run timeline UI (intent, tool calls, approvals, outputs, failures).
- Add rollback-capable action cards where operations are reversible.
- Add per-run cost and token panel.

### 3.6 Observability UI
**Current state**
- Billing quota and cost status cards are available.

**Gaps**
- No operations console for AI/automation runs.
- No failure categorization dashboard.
- No latency/SLO visualizations by tenant/workflow.

**Recommendation**
- Build operations dashboard for support/ops/admin personas.
- Add failure classes, retry visibility, queue lag and SLA burn indicators.

### 3.7 Design System and White-Label
**Current state**
- Strong theme token system and MUI integration.
- Error boundaries and translation scaffolding (EN/IT) exist.

**Gaps**
- Branding is globally hardcoded, not tenant-overridable.
- i18n scope is limited for enterprise global rollout.

**Recommendation**
- Introduce tenant branding profile (logo, palette, typography, domain assets).
- Expand i18n framework to full locale pack strategy + formatting standards.
- Establish accessibility budget and CI gates (WCAG AA).

### 3.8 Performance
**Current state**
- Dynamic imports, lazy-loading, and error boundaries are present.
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
**Status:** Medium-Low
- Frontend clients include compatibility shims and fallback logic for missing/non-uniform backend contracts.

### 4.2 Error Model Consistency
**Status:** Low
- Backend error shape is not fully normalized; frontend must infer multiple patterns.

### 4.3 Authentication Flow Integrity
**Status:** Medium
- Backend auth/session checks are strong.
- Frontend token persistence strategy weakens overall security posture.

### 4.4 Tenant Context Propagation
**Status:** Medium
- Tenant context is carried in JWT and guards.
- Frontend lacks explicit multi-workspace UX and explicit tenant header management for delegated admin patterns.

### 4.5 End-to-End Observability Traceability
**Status:** Medium-Low
- Logging and queue metrics exist.
- Full request -> queue -> worker -> AI tool trace is incomplete.

### 4.6 Cost/Token Accounting Alignment
**Status:** Medium-Low
- Backend tracks usage/cost protection at plan level.
- Per-run token-cost transparency and reconciliation are not yet first-class across backend+frontend.

### 4.7 Logging Correlation Capability
**Status:** Medium
- Request IDs exist.
- Correlation context exists but global propagation is incomplete.

### 4.8 Event-Driven vs Request-Driven Coherence
**Status:** Medium
- Strong event-driven design in sync/realtime subsystems.
- AI orchestration and governance telemetry remain primarily request-centric and need event normalization.

---

## SECTION 5 - Enterprise Gap Analysis Matrix

| Domain | Current State | Required State (Enterprise CRM AI) | Gap Severity |
|---|---|---|---|
| Enterprise CRM platform | Contact-centric intelligence, no full account/opportunity/activity model | Canonical CRM domain model with extensible object graph and timeline | High |
| AI-powered automation layer | Working chat/tools/HITL, partial run observability | Policy-governed deterministic automation, full run ledger, replayability | High |
| Governance and compliance | Basic RBAC + audit logs + GDPR endpoints | Fine-grained authorization, immutable audit evidence, control mapping/reporting | High |
| Operational maturity | Health endpoints, queue metrics, structured logs | SLO-driven operations console, distributed tracing, incident-grade telemetry | High |
| Scalability to 10x users | Likely feasible with infra tuning | Proven horizontal scale playbooks and workload partitioning | Medium |
| Scalability to 100x data | Not currently viable without redesign | Partitioned data plane, archive strategy, event-driven analytics pipeline | High |

---

## SECTION 6 - Target Enterprise Architecture Proposal

### 6.1 Ideal Backend Architecture
Establish a **modular monolith moving to service-oriented boundaries** with strict domain ownership.

**Proposed bounded contexts**
- `Identity & Tenant Control Plane`
  - AuthN/AuthZ, tenant provisioning, org/workspace hierarchy, policy service.
- `Comms Data Plane`
  - Email/calendar/contacts ingestion and normalization, provider connectors.
- `CRM Core`
  - Accounts, Contacts, Deals, Activities, relationship graph, scoring.
- `AI Orchestration`
  - Planner, tool runtime, policy guardrails, HITL, run ledger, evaluation.
- `Billing & Entitlements`
  - Plans, quotas, cost guardrails, feature flags.
- `Observability & Governance`
  - Audit, tracing, compliance evidence, operational metrics APIs.

### 6.2 Ideal Frontend Architecture
- `App Shell + Control Plane` (tenant switch, policy-aware routing, admin console).
- `CRM Workspace` (object explorer, timeline, saved views, bulk actions).
- `Automation Workspace` (workflow designer, run history, approvals, rollback).
- `Ops Workspace` (queue health, run failures, SLO dashboards, budgets).
- Shared platform SDK for typed API contracts, error taxonomy, permission guards.

### 6.3 AI Orchestration Pattern
Implement a three-layer orchestrator:
1. **Intent + Plan Layer** (classify, plan, policy-check).
2. **Execution Layer** (typed tools, retries, idempotency keys).
3. **Governance Layer** (HITL gates, run ledger, cost and policy audit).

### 6.4 Event-Driven Opportunities
- Introduce outbox pattern for domain events.
- Emit and consume events for: email sync completion, contact updates, CRM score changes, AI action lifecycle, budget alerts.
- Use event contracts to decouple modules and reduce circular dependencies.

### 6.5 Plugin/Module System Strategy
- Define extension contracts (`capabilities`, `scopes`, `resource access policies`, `UI contribution points`).
- Require signed manifests and sandboxed execution for third-party actions.
- Provide compatibility versioning and marketplace validation pipeline.

### 6.6 Workflow Builder Feasibility
Feasible with current foundations if this sequence is followed:
1. Canonical action registry and typed input/output schemas.
2. Policy engine integration per node.
3. Durable workflow state machine with retries and compensation steps.
4. Visual builder + execution debugger.

### 6.7 Marketplace Extensibility Strategy
- Multi-tenant app install model with scoped permissions.
- Event subscription model for app triggers.
- Revenue and quota integration via entitlements service.
- Security review and app certification process.

---

## SECTION 7 - Transformation Roadmap

## Phase 1 - Stabilization and Debt Reduction (0-3 months)
**Milestones**
- Break top circular dependencies and formalize domain boundaries.
- Standardize API response/error contracts and version policy.
- Remove silent frontend API fallbacks that hide backend drift.
- Migrate frontend token handling off localStorage.

**Risk:** Medium  
**Impact:** High (stability and security baseline)  
**Complexity:** Medium

## Phase 2 - Enterprise Foundation (3-6 months)
**Milestones**
- Introduce policy-based authorization service (RBAC+ABAC).
- Implement workspace/org model and tenant switching UX.
- Deliver CRM canonical objects (Account, Deal, Activity) with timeline and saved views.
- Establish contract testing and schema governance pipeline.

**Risk:** High  
**Impact:** Very High (enterprise procurement readiness)  
**Complexity:** High

## Phase 3 - AI Governance and Observability (6-9 months)
**Milestones**
- Implement AI Run Ledger and run-level explainability APIs.
- Add distributed tracing and cross-layer correlation IDs.
- Ship operations dashboard (latency, failures, budget, queue health).
- Add deterministic mode + policy-gated workflow execution for high-risk automations.

**Risk:** Medium-High  
**Impact:** Very High (auditability and trust)  
**Complexity:** High

## Phase 4 - Marketplace and Advanced Automation (9-15 months)
**Milestones**
- Release workflow builder with reusable templates.
- Launch plugin/marketplace extension framework.
- Add certification and app governance pipeline.
- Expand white-label and global localization capabilities.

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
- Token accounting coverage: **100% of AI runs** have prompt/completion/total tokens persisted

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

## Immediate Executive Recommendations (Next 30 Days)
1. Standardize API versioning + response/error schema and enforce in CI.
2. Remove localStorage token dependency and shift to secure cookie/session model.
3. Launch circular dependency burn-down plan (target: reduce from 15 to <=5 in Phase 1).
4. Define enterprise authorization model (permission taxonomy and policy service contract).
5. Stand up AI run ledger schema and telemetry contract to unblock explainability and cost traceability.