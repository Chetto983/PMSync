# Backend Authorization Architecture

Date: 2026-03-09
Scope: Current backend authorization and adjacent access-control model
Status: Current reference

## Summary

The backend does not currently have a unified enterprise authorization engine.

What exists today is a layered access-control stack:

- session authentication through `better-auth`
- tenant boundary enforcement through `TenantGuard`
- coarse role checks through `RolesGuard`
- self-service endpoint constraints by route shape and `request.user`
- governance guards for legal acceptance, consent, quota, and feature flags

This is workable for a growth-stage SaaS, but it is not yet an enterprise-grade authorization model for CRM-style object permissions, delegated administration, or ABAC.

## Current Control Stack

### Request Flow

For protected HTTP routes, the effective control chain is:

```text
ThrottlerGuard
  -> BetterAuthGuard
  -> LegalAcceptanceGuard
  -> ConsentGuard (global instance; only active when metadata exists)
  -> controller-level guards such as TenantGuard, RolesGuard, QuotaGuard, FeatureFlagGuard
  -> service-level tenant-scoped Prisma access
```

Key files:

- `backend/src/common/auth/better-auth.guard.ts`
- `backend/src/modules/auth/guards/tenant.guard.ts`
- `backend/src/modules/auth/guards/roles.guard.ts`
- `backend/src/modules/compliance/guards/legal-acceptance.guard.ts`
- `backend/src/modules/compliance/guards/consent.guard.ts`
- `backend/src/modules/subscription/guards/quota.guard.ts`
- `backend/src/common/guards/feature-flag.guard.ts`

### What Counts as Authorization vs Governance

In the current backend:

- `TenantGuard` is a tenant-isolation and access-boundary control
- `RolesGuard` is the primary authorization mechanism
- self-service route patterns are a secondary authorization pattern
- legal acceptance, consent, quota, and feature flags are governance or commercial controls, not full authorization

## Current Role Model

The user role is stored as a string on `User.role`.

Observed role values in active code paths:

- `member` - default
- `manager`
- `admin`
- `super-admin`

Current behavior:

- `BetterAuthGuard` maps session user data to `request.user.role`
- `RolesGuard` performs exact string matching against `@Roles(...)`
- there is no role hierarchy or derived-permission layer in the guard itself

Key files:

- `backend/prisma/schema.prisma`
- `backend/src/modules/auth/decorators/roles.decorator.ts`
- `backend/src/modules/auth/guards/roles.guard.ts`

## Current Enforcement Patterns

### 1. Tenant Boundary First

`TenantGuard` is the first meaningful authorization boundary after authentication for most protected controllers.

It:

- resolves tenant from `x-tenant-id` or `request.user.tenantId`
- validates tenant existence and active status
- blocks cross-tenant access unless `request.user.role === 'super-admin'`
- rewrites `request.user.tenantId` to the resolved active tenant

This is the strongest part of the current backend authorization posture.

### 2. Coarse RBAC on Selected Controllers

`RolesGuard` only enforces access when `@Roles(...)` metadata exists.

Representative patterns:

- admin-only AI observability endpoints use `@UseGuards(TenantGuard, RolesGuard)` and `@Roles('admin')`
- labels, templates, signatures, many email mutations, and tenant admin endpoints use `@Roles('admin', 'manager')` or `@Roles('super-admin')`
- endpoints with `RolesGuard` but no `@Roles(...)` are effectively pass-through from the role perspective

This means controller coverage matters. `RolesGuard` is not a global policy engine.

### 3. Self-Service Authorization by Route Shape

Some controllers intentionally avoid `@Roles(...)` and rely on route shape plus `request.user`.

Representative example:

- `UsersController` only exposes `/users/me/*` operations and always acts on `request.user.userId`

This is a valid pattern for self-service endpoints, but it does not scale to broader enterprise object permissions.

### 4. Governance Guards on AI and Paid Features

Some sensitive paths are protected by business/governance constraints instead of role constraints.

Representative examples:

- `AiController` uses `TenantGuard`, `QuotaGuard`, and `ConsentGuard`
- `LabelsController` adds `FeatureFlagGuard`
- legal acceptance is enforced globally unless explicitly skipped

These controls are useful, but they are not substitutes for a full permission system.

## Current Architecture Limits

### No Active Policy Engine

There is a defined permission taxonomy and `IPolicyService` contract, but no active backend-wide implementation was found in the current request path.

This means:

- resource-action permissions exist as design intent
- the runtime still enforces mostly role strings and route conventions

### Roles Are Raw Strings

The current role model is string-based and decentralized.

Implications:

- no formal inheritance
- no deny rules
- no contextual checks such as owner, assignee, department, or record sensitivity
- no consistent mapping from role to permission set

### Authorization Coverage Is Inconsistent by Domain

Representative examples from current code:

- `CalendarController` is tenant-guarded but not role-guarded
- `AiController` is tenant, quota, and consent guarded but not role-guarded
- `UsersController` has `RolesGuard` in the chain but no `@Roles(...)`, relying on self-service route constraints

Some of these are intentional. The issue is not that every endpoint must use roles, but that the overall model is not centrally expressed.

### Resource-Level Authorization Is Minimal

The backend strongly enforces tenant scoping, but object-level authorization is limited.

Examples of what is largely absent today:

- per-record sharing rules
- delegated access
- team-based visibility scopes
- manager-over-subordinate rules
- field-level security
- action-specific entitlements beyond coarse roles

### Super-Admin Cross-Tenant Access Is Special-Cased

`TenantGuard` explicitly permits cross-tenant access for `super-admin` users.

That is operationally useful, but it should eventually be backed by stronger governance:

- explicit impersonation or support-session workflows
- audit visibility
- narrower action scopes than unrestricted tenant switching

## Practical Guidance for Contributors

Until a real policy layer exists:

1. Keep `TenantGuard` on protected tenant-scoped controllers.
2. Use `RolesGuard` with explicit `@Roles(...)` on admin or mutating endpoints unless the endpoint is strictly self-service.
3. For self-service endpoints, bind operations to `request.user.userId` or `request.user.tenantId` directly instead of trusting request parameters.
4. Do not treat consent, quota, or feature flags as authorization substitutes.
5. Prefer adding a centralized permission check instead of expanding ad hoc role strings further.

## Recommended Direction

The next backend step should be a real authorization foundation:

1. Define canonical permissions for each resource and action.
2. Map roles to permission bundles in one place.
3. Add a runtime policy service and guard/decorator pair for permission checks.
4. Support contextual evaluation inputs such as tenant, owner, record, and actor relationship.
5. Reserve `super-admin` cross-tenant access for explicit support workflows and stronger auditability.

## Current Assessment

Authorization maturity: moderate for tenant isolation, weak for enterprise-grade policy enforcement.

The backend is strongest at tenant boundary enforcement and weakest at centralized, contextual authorization.
