# PMSync Backend Architecture Audit

Date: 2026-03-09
Scope: `backend/` current-state architecture, security, AI control plane, auth, tenancy, API, and operations
Status: Current backend audit
Related: [`/AUDIT.md`](../../AUDIT.md), historical snapshot [`PRD_ARCHITECTURE_AUDIT_2026-03-02.md`](./PRD_ARCHITECTURE_AUDIT_2026-03-02.md)

## Purpose

This document is the backend-specific follow-up to the repository-wide audit. It is intended to answer two questions:

1. What is the current backend architecture state?
2. What should the backend team do first?

This is a static code audit. It does not include live penetration testing, real-provider validation, or production telemetry review.

## Current Backend Snapshot

### Architecture Shape

The backend is a NestJS modular monolith, not a microservice system.

Current characteristics:

- REST API under `/api/v1`
- Prisma + PostgreSQL shared-database multi-tenancy
- BullMQ + Redis for async processing
- Socket.IO + Redis adapter for realtime fan-out
- `better-auth` session validation as the global auth gate
- Mistral-based AI orchestration with pgvector-backed retrieval

This is the right topology for the current stage. The platform does not need microservice extraction yet. It needs backend governance hardening.

### Strong Areas

- tenant scoping at the ORM layer is materially strong
- global request pipeline is organized and defensive
- provider OAuth flows use state + PKCE
- queue-backed sync/send paths are already in place
- backend indexing on core entities is above average for a SaaS monolith

### Weak Areas

- AI action execution and approval boundaries are inconsistent
- auth is still in a transition state
- authorization is still mostly coarse RBAC
- operational exposure is broader than it should be
- some backend docs still describe older auth and AI architecture

## What Changed Since the 2026-03-02 Audit

The earlier backend audit remains useful as a historical snapshot, but it is no longer the best source of truth for the current backend.

Important differences from that document:

- active auth now centers on `better-auth`, not only legacy JWT
- Prisma tenant scoping is stronger and enforced centrally
- the active AI stack is custom orchestration, not an active VoltAgent runtime
- some earlier AI and data-integrity defects appear to have been addressed
- the biggest current blocker is no longer generic backend fragility; it is the AI control plane and auth/authorization convergence

## Confirmed Backend Findings

### Critical

#### 1. HITL approval execution is broken at the registry boundary

The approval controller maps actions back to tool names like `send_email`, `reply_email`, `forward_email`, `delete_email`, and `delete_event`, but the central tool registry only contains the self-registered read/search tools from domain modules.

Impact:

- approved actions can fail after the user approves them
- AI action safety is not trustworthy
- auditability is misleading because the control path exists but is not actually complete

Backend references:

- `backend/src/modules/ai-chat/controllers/hitl.controller.ts`
- `backend/src/common/modules/tool-registry/tool-registry.service.ts`
- `backend/src/modules/email/email.module.ts`
- `backend/src/modules/calendar/calendar.module.ts`
- `backend/src/modules/contacts/contacts.module.ts`
- `backend/src/modules/ai/ai.module.ts`

#### 2. Several AI mutating tools bypass approval entirely

The backend currently allows multiple mutating tools to execute immediately even though the product posture implies confirmation or approval for high-impact actions.

Examples:

- `archive_email`
- `move_email`
- `create_event`
- `update_event`
- `create_contact`
- `update_contact`
- `create_folder`

Impact:

- backend AI actions are not consistently policy-controlled
- a future frontend approval UX would still not guarantee backend safety
- this is the main backend AI governance gap

Backend references:

- `backend/src/modules/ai-chat/tools/email-tools.service.ts`
- `backend/src/modules/ai-chat/tools/calendar-tools.service.ts`
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts`
- `backend/src/modules/ai-chat/tools/folder-tools.service.ts`

### High

#### 3. Backend auth is dual-stack

The backend globally validates `better-auth` sessions, but still ships legacy auth controller flows for login, refresh, MFA, and JWT cookie handling.

Impact:

- broader attack surface
- duplicated lifecycle logic
- harder backend testing and operational reasoning
- slower path to enterprise identity integration

Backend references:

- `backend/src/app.module.ts`
- `backend/src/common/auth/better-auth.guard.ts`
- `backend/src/modules/auth/controllers/auth.controller.ts`

#### 4. Backend authorization is still coarse RBAC

The backend primarily relies on `@Roles(...)` and `RolesGuard`. That is workable for admin/member access control, but not enough for enterprise CRM-style object, team, tenant, workflow, or action-level policy enforcement.

Impact:

- limits enterprise role modeling
- makes future permission growth controller-centric instead of policy-centric
- increases risk of inconsistent enforcement as new backend modules are added

Backend references:

- `backend/src/modules/auth/guards/roles.guard.ts`
- `backend/src/common/interfaces/policy-service.interface.ts`

### Medium

#### 5. AI backend telemetry is incomplete

Two notable gaps remain:

- chat ledger writes `toolCallCount: 0` even when tools were used
- bulk embeddings do not use the same stronger telemetry/cost path as single embeddings

Backend references:

- `backend/src/modules/ai-chat/services/ai-chat.service.ts`
- `backend/src/modules/ai/services/mistral-embedding.service.ts`

#### 6. Operational endpoints are too broadly exposed

The backend health controller is public, including queue and metrics-related surfaces, and local monitoring still scrapes the deprecated `/health/metrics` path instead of the dedicated `/metrics` endpoint.

Backend references:

- `backend/src/modules/health/controllers/health.controller.ts`
- `backend/src/common/metrics/metrics.module.ts`
- `monitoring/prometheus.yml`

#### 7. OpenAPI contract workflow is not fully healthy

The backend CI expects generated OpenAPI output, but the artifact is not present in the working tree and contract generation is conditional.

Backend references:

- `.github/workflows/ci.yml`
- `backend/openapi-spec.json` is currently absent

## Backend Start Here

If the backend team does only one sequence of work next, it should be this order.

### Workstream 1: AI Safety Hardening

This is the first backend priority.

Deliverables:

- unify tool approval policy for all mutating AI tools
- make HITL execute the same runtime tools used by chat orchestration
- replace ad hoc action mapping with explicit action types
- add backend tests that prove approved actions execute and rejected actions do not
- add accurate AI ledger accounting for tool usage

Definition of done:

- every mutating tool is classified as `allow`, `confirm`, or `approve`
- no approved action fails because a registry entry is missing
- backend approval execution is test-covered

### Workstream 2: Auth Consolidation

This is the second backend priority.

Deliverables:

- decide whether `better-auth` is now the only platform auth system
- decommission or isolate legacy JWT refresh/login endpoints
- document one canonical backend session model
- align compliance, websocket auth, CSRF, and session handling on that model

Definition of done:

- one canonical auth path for browser clients
- no duplicated backend auth flows without an explicit migration reason

### Workstream 3: Authorization Foundation

This is the third backend priority.

Deliverables:

- define backend permissions beyond role names
- introduce a policy evaluation service for resource/action checks
- keep roles as inputs, not as the final enforcement primitive
- add a backend permission model for future CRM entities

Definition of done:

- backend services can ask “can this actor do this action on this resource in this tenant?”
- controller logic stops accumulating one-off role checks

### Workstream 4: Operational Exposure and Contract Hygiene

This is the fourth backend priority.

Deliverables:

- restrict queue and metric detail endpoints to internal/admin-only access
- standardize on `/metrics` for Prometheus
- restore reliable OpenAPI generation and drift checks
- remove stale backend docs that still describe older architecture as current

Definition of done:

- operational surfaces are private by default
- API docs and generated contracts match actual backend behavior

## Target Backend Architecture

The target backend should remain a modular monolith, but with tighter governance.

### Desired Properties

- one auth system
- one permission system
- one AI action policy model
- internal-only operational telemetry
- explicit backend contracts for tools, queues, and API schemas

### What Not To Do Yet

Avoid doing these before the four workstreams above are complete:

- premature microservice extraction
- database-per-tenant rollout for all customers
- generalized autonomous agent expansion
- large backend domain rewrites that ignore current control-plane risk

## Recommended Backend Scorecard

| Category | Score |
| --- | --- |
| Backend Architecture | 7/10 |
| Backend Scalability | 7/10 |
| Backend Security | 6/10 |
| Backend API Design | 7/10 |
| Backend AI Governance | 5/10 |
| Backend Maintainability | 6/10 |

## Backend Documentation Follow-Ups

These backend docs should be updated next:

1. `technical_overview.md`
   It still describes older VoltAgent and JWT-centric architecture as current.

2. backend auth architecture note
   A short backend doc should define the canonical session model and migration status.

3. backend AI tool governance note
   A short backend doc should define trust classes and approval requirements for each AI tool.

4. backend observability note
   A short backend doc should define which endpoints are public, internal, or admin-only.

## Final Backend Recommendation

The backend should not start with service extraction. It should start with:

1. AI action safety
2. auth convergence
3. authorization depth
4. operational exposure control

Once those are stable, the backend will be in a much stronger position to decide whether any module deserves service extraction or higher-isolation tenancy tiers.
