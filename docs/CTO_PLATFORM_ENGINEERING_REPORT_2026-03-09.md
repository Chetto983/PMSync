# CTO Platform Engineering Report

Date: 2026-03-09
Scope: Full platform static architecture review
System: PMSync enterprise AI SaaS platform
Method: Repository and configuration analysis only
Confidence: High for code- and config-level findings, lower for runtime behavior not executed in this pass

## Executive Summary

PMSync is a credible growth-stage enterprise AI SaaS platform built as a modular NestJS monolith with a Next.js frontend, PostgreSQL shared-database multi-tenancy, Redis-backed queues and realtime infrastructure, and a custom Mistral-based AI layer with pgvector retrieval.

The platform is stronger than a typical startup codebase in three areas:

- tenant-aware backend architecture
- async processing and operational foundations
- practical AI product integration across email, contacts, calendar, and briefing workflows

The main platform risks are concentrated in control-plane maturity rather than core product capability:

- auth remains dual-stack in code
- authorization is still coarse RBAC rather than enterprise policy enforcement
- AI mutating-tool approval and human-in-the-loop execution are inconsistent
- operational telemetry is decent but exposed too broadly
- documentation and contract governance are ahead of some runtime cleanup, but not fully converged

Strategic conclusion:

Do not split this into microservices yet. The correct next move is governance hardening:

1. fix the AI safety and approval model
2. consolidate auth
3. establish a real authorization foundation
4. tighten observability and API contract hygiene
5. only then revisit service extraction

## 1. Architecture Overview

### Platform Shape

```text
Next.js 16 frontend
  -> better-auth session client
  -> Axios + TanStack Query API consumption
  -> assistant-ui chat runtime
  -> WebSocket client for realtime invalidation

NestJS 11 backend
  -> global guards, filters, interceptors
  -> modular domain controllers/services
  -> BetterAuthGuard + TenantGuard
  -> BullMQ background jobs
  -> Redis-backed Socket.IO adapter
  -> Mistral-based AI services + ai-chat module

PostgreSQL + Prisma
  -> shared database, tenant-aware schema
  -> pgvector embeddings

Redis
  -> queues
  -> cache
  -> websocket fan-out
```

### Backend

- Framework: NestJS 11
- Architecture style: modular monolith
- API style: versioned REST under `/api/v1`
- Background processing: BullMQ with Redis
- Realtime: Socket.IO with Redis adapter
- Data layer: Prisma 7 + PostgreSQL
- Metrics: Prometheus endpoint plus application metrics

### Frontend

- Framework: Next.js 16 + React 19
- Server state: TanStack Query v5
- UI state: Zustand
- API client: Axios wrapper with cookie auth, CSRF, envelope unwrapping, 401 handling
- Auth flow: `better-auth` session cookies
- AI UX: assistant-ui + SSE chat streaming + tool UIs

### AI Layer

- LLM provider: Mistral
- Runtime style: custom orchestration, not a current active VoltAgent runtime
- RAG: pgvector embeddings + semantic retrieval
- AI surfaces:
  - chat
  - daily briefing
  - follow-up detection
  - drafting/composition
  - email analysis
- Agent/tool model: bounded tool invocation rather than unconstrained code execution

## 2. Architecture Quality Assessment

### Strengths

- Domain modules are reasonably separated across email, auth, providers, AI, contacts, calendar, compliance, subscription, and realtime.
- The backend has clear infrastructure seams for auth, metrics, tenant scoping, queues, and realtime.
- The frontend uses a modern split between server state and UI state instead of overloading one store.
- The platform already reflects SaaS-aware design rather than retrofitted tenancy.

### Weaknesses

- Auth is in transition, so the codebase carries both the current session path and legacy JWT-era residue.
- Authorization is spread across tenant guards, roles, self-service route patterns, and governance guards without a central policy model.
- AI governance is split between prompt rules, tool flags, HITL storage, and a registry that does not fully align with execution.
- Some documentation and artifacts still describe historical architecture as current unless explicitly marked.

### Architectural Anti-Patterns

- Dual control planes for auth increase maintenance and audit cost.
- Coarse string-role authorization encourages local exceptions instead of a policy layer.
- Public operational endpoints expose more detail than they should.
- AI approval logic is not yet single-source-of-truth.

## 3. API Design Review

### Current State

- REST-only, versioned under `/api/v1`
- global validation pipe
- unified exception filter
- response envelope interceptor
- correlation IDs and request IDs
- Swagger/OpenAPI generation

### What Is Good

- versioning exists and is explicit
- error normalization is centralized
- removed endpoints fail loudly with deprecation behavior
- pagination and filtering exist on major list endpoints

### What Needs Improvement

- pagination and filtering patterns are not fully standardized across modules
- some controller-level query parsing is still manual
- OpenAPI generation in CI is conditional and therefore weaker than it should be
- browser-first cookie auth is correct for the web app, but external API strategy is still underdefined

### Enterprise API Recommendations

1. Standardize query DTOs for pagination, filtering, sorting, and cursor semantics.
2. Make OpenAPI artifact generation non-optional in CI.
3. Define an explicit external integration posture for service accounts, partner APIs, or org-admin automation.
4. Publish deprecation policy rules for endpoint migrations.

## 4. Security Review

### Current Strengths

- active browser auth uses `better-auth` session cookies
- CSRF protection exists and the frontend keeps the CSRF token in memory
- tenant-aware guards and Prisma tenant scoping materially reduce cross-tenant risk
- rate limiting exists globally and on some sensitive endpoints
- provider OAuth flows use state/PKCE patterns
- PII tokenization exists before some model exposure

### Current Risks

- legacy auth code still coexists with the new session model
- authorization is not enterprise-grade policy enforcement
- public health and queue endpoints expose internal state
- monitoring still scrapes the deprecated `/health/metrics` path instead of canonical `/metrics`
- `super-admin` cross-tenant access is special-cased without stronger support-session governance

### OWASP API Top 10 Perspective

- `API1/BOLA`: mitigated better than average by tenant scoping, but still dependent on correct bypass usage and resource-level checks
- `API2/Broken Auth`: elevated by auth dual-stack complexity
- `API3/BOPLA`: moderate risk because authorization is route/role-centric, not permission-centric
- `API4/Resource Consumption`: partly mitigated with throttling and quotas, but AI routes remain heavy
- `API5/Function-Level Auth`: moderate risk where controllers rely on role conventions rather than centralized permissions
- `API8/Security Misconfiguration`: health/metrics exposure is the clearest example

### OWASP LLM Top 10 Perspective

- prompt injection risk is partially addressed through bounded tools and prompt guardrails, but still real
- sensitive data leakage is reduced by PII tokenization and embeddings that avoid raw-source duplication, but approval and retrieval policies need tightening
- excessive autonomy risk is present because not all mutating tools are consistently approval-gated
- insecure tool usage risk is elevated by the broken HITL registry/execution alignment

### Security Priorities

1. unify auth to one primary runtime path
2. harden AI tool approval and execution governance
3. restrict health, queue, and metrics exposure
4. add a real permission layer beyond raw roles

## 5. AI Architecture Review

### Current Model

The AI system is practical and product-oriented:

- custom Mistral orchestration
- tool-augmented chat
- structured non-chat AI endpoints
- RAG over tenant-scoped embeddings
- assistant-ui frontend with tool-specific rendering

### Strengths

- AI is integrated into real workflows, not isolated as a demo feature
- the system uses bounded tools instead of arbitrary execution
- the platform already records AI usage and cost
- RAG is tenant-aware at the data model level

### AI Risks

- HITL approval can succeed while execution cannot complete
- some mutating tools bypass approval entirely
- AI telemetry is incomplete for some tool-call paths
- current observability does not fully capture blocked/approved/rejected tool flows

### AI Recommendations

1. Make tool execution policy single-source-of-truth.
2. Route all mutating tools through a unified approval contract.
3. Track tool-call counts, approval outcomes, blocked actions, and execution failures in the AI ledger.
4. Add retrieval and output redaction policies for more sensitive enterprise use cases.

## 6. SaaS Architecture Review

### Current State

- shared PostgreSQL database
- tenant-aware schema
- tenant-scoping Prisma extension
- `TenantGuard` with explicit tenant resolution
- super-admin cross-tenant exception

### Assessment

This is a strong shared-db SaaS design for the current platform stage.

The main risk is not missing tenancy, but bypass paths:

- `withoutTenantScopingAsync(...)`
- raw SQL
- future models not added to the tenant-scoped model list

### Recommendation

Keep the shared-db model for now. Add optional isolation tiers later only for regulated or very large tenants:

- default: shared DB
- premium/regulatory tier: dedicated schema or DB
- high-control AI tier: isolated AI workers and retrieval stores

## 7. Performance Review

### Main Risks

- AI requests are still heavy and synchronous from the user’s perspective
- the frontend sets a 90s API timeout, which indicates dependence on long-running request paths
- some operational endpoints and queue paths may become expensive under scale
- contract drift and lack of uniform pagination can create uneven endpoint performance

### Strong Points

- background work is already offloaded to BullMQ in many areas
- Redis exists for hot-path coordination
- tenant-prefixed indexes are present on core models
- realtime invalidation complements query caching on the frontend

### Performance Recommendations

1. Push more AI workflows to async or staged UX where practical.
2. Add endpoint-level latency budgets for the heaviest AI and dashboard paths.
3. Standardize pagination ceilings and defend against oversized list requests consistently.
4. Expand query instrumentation for email, contact, and AI-heavy services.

## 8. Scalability Review

### Strengths

- stateless HTTP API
- Redis-backed queue architecture
- websocket scaling via Redis adapter
- modular monolith boundaries are already present

### Constraints

- shared DB remains the main scale boundary
- AI latency and cost scale faster than core CRUD
- some observability and governance layers are not mature enough for large-tenant operational support

### Scalability Recommendation

Do not split services yet. First stabilize the platform seams:

- auth
- authorization
- AI control plane
- observability

Then, if scale demands it, extract only the highest-pressure bounded contexts:

- identity/compliance
- provider sync
- AI orchestration
- search/RAG

## 9. Database Architecture Review

### Strengths

- tenant-aware schema design
- composite tenant keys on core entities
- extensive tenant-prefixed indexing
- pgvector integration for embeddings

### Risks

- shared-db design will eventually need data lifecycle and partition strategy for very large tenants
- object-level authorization is thinner than the schema quality
- some legacy schema residue remains from older AI/runtime iterations

### Database Recommendations

1. Define archival strategy for AI and sync-heavy tables.
2. Review the tenant-scoped model list as part of schema-change discipline.
3. Add regular index review and query-plan checks for the heaviest list/search endpoints.
4. Clean obsolete schema residue once legacy architecture is fully retired.

## 10. Code Quality Review

### Strong Areas

- meaningful modular decomposition
- modern TypeScript stack
- tests exist across key backend and frontend slices
- shared infrastructure patterns are visible and reusable

### Debt Areas

- historical architecture residue in docs and code naming
- coarse role model
- mixed auth paths
- AI control logic not yet fully unified

### Fragile Areas

- auth migration boundary
- AI approval flow
- any code that bypasses tenant scoping
- monitoring config that still references deprecated endpoints

## 11. AI Agent Architecture Review

### Current Model

The platform does not expose unconstrained autonomous agents. It exposes tool-augmented AI behaviors with varying degrees of approval and UI mediation.

### Strengths

- tools are explicit
- tool UIs exist in the frontend
- some actions require approval
- data access is still constrained by the rest of the SaaS stack

### Risks

- approval policy is inconsistent across mutating tools
- the registry/execution path is not fully aligned
- the system prompt and actual enforcement are not yet equivalent

### Recommendation

Treat the AI tool layer like a privileged internal API surface:

- permissioned
- auditable
- approval-aware
- tenant-aware
- failure-visible

## 12. Product Evolution Opportunities

### High Impact

1. Workflow automation engine with approval policies and audit trail.
2. Enterprise permission model for teams, delegated access, and object-level rules.
3. Safer AI assistant that can act across email, calendar, contacts, and CRM workflows with reliable approval.

### Medium Impact

1. CRM object expansion: accounts, deals, activities, pipeline views.
2. Tenant-level AI governance controls: model policy, feature toggles, retention controls.
3. Cross-channel enterprise integrations beyond email/calendar/contacts.

### Lower Immediate Priority

1. Microservice extraction.
2. Deep infrastructure redesign before policy and control-plane hardening.
3. Large-scale aesthetic frontend rewrites without backend governance improvements.

## 13. Technical Debt Map

| Area | Risk | Impact | Strategy |
| --- | --- | --- | --- |
| Auth dual-stack | High | Security and maintenance drag | finish migration, isolate or remove legacy path |
| Authorization model | High | Enterprise deals and admin controls blocked | introduce permission service and policy checks |
| AI approval/HITL inconsistency | Critical | Unsafe or broken AI actions | unify tool policy and execution path |
| Public operational exposure | Medium | Information leakage and attack surface | restrict health/queue/metrics endpoints |
| OpenAPI/contract drift | Medium | frontend/backend mismatch risk | make spec generation mandatory in CI |
| Historical architecture residue | Medium | confusion, onboarding drag | remove or archive stale code/docs once migration settles |

## 14. Platform Score

| Category | Score |
| --- | --- |
| Architecture | 7/10 |
| Security | 6/10 |
| Scalability | 7/10 |
| Performance | 6/10 |
| AI Architecture | 6/10 |
| Maintainability | 6/10 |

Overall platform maturity: **6.3/10**

Interpretation:

This is a strong growth-stage platform with real enterprise potential, but it is not yet operating with an enterprise control plane.

## 15. Strategic Roadmap

### Short Term (1-3 months)

- fix AI mutating-tool approval consistency
- align HITL approval with actual executable tool registry
- choose one auth runtime path and downgrade the other to migration-only status
- lock down health, queue, and metrics exposure
- make OpenAPI generation and type sync mandatory in CI

### Medium Term (3-9 months)

- implement centralized permission architecture
- formalize tenant support/admin access workflows
- improve AI observability for tool usage and approval outcomes
- standardize pagination, filtering, and query DTO patterns
- define data retention and archival rules for heavy operational tables

### Long Term (9-24 months)

- expand CRM domain model
- introduce workflow/automation engine with policy controls
- support higher-isolation tenant tiers where commercially justified
- extract select bounded contexts only after governance layers are stable

## 16. Final Deliverables

This report provides:

1. Full technical architecture audit
2. Security audit summary
3. AI architecture review
4. Performance and scalability analysis
5. Technical debt map
6. Strategic platform roadmap

## Appendix: Key Reference Set

Current supporting references in this repository:

- `AUDIT.md`
- `technical_overview.md`
- `backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md`
- `backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md`
- `backend/docs/BACKEND_AUTHORIZATION_ARCHITECTURE_2026-03-09.md`
- `backend/docs/BACKEND_MULTI_TENANCY_ARCHITECTURE_2026-03-09.md`
- `backend/docs/BACKEND_API_ARCHITECTURE_2026-03-09.md`
- `backend/docs/BACKEND_OBSERVABILITY_ARCHITECTURE_2026-03-09.md`
- `backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md`

## Limitations

- This was a static analysis pass.
- I did not run full backend/frontend test suites in this deliverable.
- I did not execute provider integrations, AI live calls, or production infrastructure checks.
