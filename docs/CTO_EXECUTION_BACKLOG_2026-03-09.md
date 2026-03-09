# CTO Execution Backlog

Date: 2026-03-09
Source: `docs/CTO_PLATFORM_ENGINEERING_REPORT_2026-03-09.md`
Status: proposed execution backlog

## Purpose

This document converts the CTO architecture report into an implementation-oriented backlog.

It is ordered by risk reduction and platform leverage, not by organizational convenience.

## Execution Order

1. AI safety hardening
2. Auth consolidation
3. Authorization foundation
4. Operational exposure and contract hygiene
5. Follow-on architecture work after control-plane stabilization

## Workstream 1: AI Safety Hardening

Priority: critical
Target window: 1-4 weeks
Primary outcome: mutating AI actions become consistent, approval-aware, and auditable

Detailed implementation plan:

- `backend/docs/BACKEND_AI_SAFETY_HARDENING_IMPLEMENTATION_PLAN_2026-03-09.md`

### Why First

This is the highest-risk area in the platform because the current tool approval model is internally inconsistent:

- some mutating tools execute immediately
- HITL approval can succeed while actual execution cannot complete
- the prompt contract and runtime contract are not the same

### Tasks

1. Define a canonical tool trust model.
   Categories:
   - read-only
   - reversible write
   - persistent mutation
   - destructive or external side effect

2. Move approval policy into tool metadata, not scattered controller logic.

3. Make HITL execute the same runtime tool objects used by chat orchestration.

4. Register all mutating tools in one executable registry.

5. Require approval for all destructive and external-side-effect tools.

6. Decide which reversible writes are allowed to run immediately and document the rationale.

7. Record approval, rejection, blocked execution, and execution failure in the AI ledger.

8. Add regression tests for:
   - tool policy classification
   - approval-required execution
   - approved-action execution success
   - rejected-action non-execution
   - registry mismatch prevention

### Acceptance Criteria

- No mutating AI action can bypass declared policy.
- Approved actions execute through the same registry used at runtime.
- Tool approval state is visible in logs and ledger records.
- There is a test that fails if a new mutating tool is added without policy classification.

## Workstream 2: Auth Consolidation

Priority: high
Target window: 2-6 weeks
Primary outcome: one primary auth model, one security posture, one maintenance path

### Why Second

The platform currently carries both `better-auth` session auth and legacy JWT-oriented auth flows. That increases:

- attack surface
- migration confusion
- test complexity
- documentation drift

### Tasks

1. Inventory all active legacy auth routes, guards, DTOs, services, and frontend references.

2. Explicitly classify each legacy path as:
   - required compatibility path
   - migration-only path
   - removable path

3. Remove or isolate legacy JWT refresh behavior from current frontend assumptions.

4. Align websocket, CSRF, and auth middleware documentation with the current session model.

5. Eliminate fallback auth patterns that imply JWT is still the normal path.

6. Add migration-safe deprecation notices for any auth endpoint kept temporarily.

7. Re-run auth docs after code cleanup so the documentation matches the runtime again.

### Acceptance Criteria

- `better-auth` session cookies are the single documented and preferred browser auth model.
- Legacy JWT code is either removed or clearly fenced behind compatibility boundaries.
- Frontend auth flow, websocket auth, and backend guards all describe the same auth system.
- No new work depends on the legacy auth path.

## Workstream 3: Authorization Foundation

Priority: high
Target window: 4-10 weeks
Primary outcome: move from coarse role checks to enterprise-capable permission enforcement

### Why Third

The platform has strong tenant isolation but weak enterprise authorization semantics. That blocks:

- delegated administration
- object-level control
- support for more serious CRM workflows
- procurement-grade enterprise posture

### Tasks

1. Finalize a canonical permission taxonomy by resource and action.

2. Implement the runtime `PolicyService` rather than leaving only the interface contract.

3. Add permission-based decorators and guards.

4. Map current roles to permission bundles centrally.

5. Keep `TenantGuard` as the tenant boundary, but stop treating roles as the only policy layer.

6. Migrate representative controllers first:
   - AI observability
   - tenants
   - labels
   - email mutating endpoints
   - admin/compliance endpoints

7. Define the temporary coexistence rule between `@Roles(...)` and permission checks.

8. Design for future context-aware checks:
   - self-service
   - owner
   - assignee
   - support impersonation
   - super-admin support session

### Acceptance Criteria

- Permission checks exist as runtime code, not just interface design.
- New admin or mutating endpoints use permission checks by default.
- Role-to-permission mapping lives in one place.
- Cross-tenant support access has explicit governance instead of only raw `super-admin` privilege.

## Workstream 4: Operational Exposure and Contract Hygiene

Priority: medium-high
Target window: 2-6 weeks
Primary outcome: operational surfaces become private, measurable, and consistent

### Why Fourth

The platform has a good observability baseline, but the exposure model is too permissive and the monitoring contract is split between current and deprecated endpoints.

### Tasks

1. Move Prometheus scraping to `/metrics`.

2. Restrict detailed health and queue endpoints to:
   - internal network only
   - authenticated admin access
   - or both

3. Retire `/health/metrics` after scrape migration.

4. Harden OpenAPI CI so spec generation is required, not best-effort.

5. Ensure frontend generated API types are updated from the same canonical spec path.

6. Add explicit metrics or audit events for:
   - approval-required AI actions
   - blocked AI actions
   - queue failure spikes
   - support/admin cross-tenant access

### Acceptance Criteria

- `/metrics` is the only canonical Prometheus scrape endpoint.
- queue and operational detail endpoints are no longer broadly public.
- OpenAPI generation failures break CI.
- contract drift between backend and frontend becomes visible early.

## Follow-On Work After Control Plane Hardening

Priority: medium
Target window: 2-9 months

### Recommended Next Wave

1. Backend queue and worker architecture reference
2. AI observability architecture
3. security surface review and hardening map
4. CRM domain model expansion:
   - accounts
   - deals
   - activities
   - ownership and assignment
5. automation workflow engine with policy-aware execution

## 30/60/90 View

### First 30 Days

- finish AI safety hardening design and implementation
- close the HITL registry mismatch
- classify all AI tools by trust level
- restrict deprecated and public operational surfaces

### By 60 Days

- reduce auth dual-stack ambiguity materially
- implement initial permission runtime
- migrate the most sensitive admin and mutating endpoints to permissions
- harden contract and metrics pipelines

### By 90 Days

- establish platform-wide authorization conventions
- make AI telemetry and approval outcomes first-class operational signals
- define next bounded-context candidates based on real scale pressure, not guesswork

## Suggested Owners

| Workstream | Primary Owner | Supporting Owner |
| --- | --- | --- |
| AI safety hardening | backend + AI platform | frontend chat UX |
| Auth consolidation | platform/auth | frontend auth |
| Authorization foundation | platform/backend | compliance/admin |
| Operational exposure and contract hygiene | platform/devops | backend infrastructure |

## Sequencing Rule

Do not start service extraction or large topology changes before the first four workstreams are materially complete.

The main bottlenecks are governance and control-plane correctness, not lack of microservices.
