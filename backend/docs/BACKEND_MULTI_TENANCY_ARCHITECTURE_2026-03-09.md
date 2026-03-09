# Backend Multi-Tenancy Architecture

Date: 2026-03-09
Scope: Current backend tenant-isolation model
Status: Current reference

## Summary

The backend uses a shared-database multi-tenant model with application-enforced tenant isolation.

The current isolation stack is:

- authenticated session carries `tenantId`
- `TenantGuard` resolves and validates the active tenant
- Prisma tenant-scoping auto-injects `tenantId` into tenant-scoped model queries
- core entities use tenant-aware keys, relations, and indexes

This is materially stronger than controller-only tenant filtering, but it still depends on application correctness for bypass paths, raw SQL, and system-level operations.

## Isolation Model

Current tenancy strategy:

- one shared PostgreSQL database
- shared schema
- `tenantId` on tenant-scoped records
- composite keys on many high-value entities

Representative tenant-scoped entities include:

- `Email`
- `Folder`
- `Embedding`
- `CalendarEvent`
- `Contact`
- AI conversation and action records
- user-linked preference, consent, and provider records

Representative schema characteristics:

- `@@id([id, tenantId])` on several core models
- `@@unique([tenantId, ...])` on tenant-bound uniqueness rules
- tenant-prefixed indexes on read-heavy models

## Request-Time Tenant Resolution

`TenantGuard` is the main request-time tenant boundary.

It:

- requires authenticated `request.user`
- accepts tenant context from `x-tenant-id` or `request.user.tenantId`
- resolves tenant by ID or slug
- blocks inactive tenants
- blocks cross-tenant access unless the user role is `super-admin`
- rewrites `request.user.tenantId` to the resolved active tenant
- attaches `request.tenant` and `request.activeTenantId`

This makes tenant switching explicit and gives downstream code a normalized tenant context.

## Prisma Tenant Scoping

The strongest backend isolation control is the Prisma tenant-scoping extension.

Current behavior:

- tenant-scoped models are enumerated centrally
- tenant ID is read from AsyncLocalStorage context
- read operations inject `tenantId` into `where`
- where-based writes inject `tenantId` into `where`
- create operations inject `tenantId` into `data`
- unique lookups upgrade to composite tenant-aware keys where needed
- unscoped tenant queries throw when tenant context is missing

Important detail:

- `AUDIT_MODE` is currently `false`, so the extension is in enforce mode rather than warn-only mode

This is the main reason the current backend tenancy posture is stronger than a typical SaaS codebase.

## How Tenant Context Reaches Prisma

The intended flow is:

```text
BetterAuthGuard
  -> TenantGuard
  -> CorrelationInterceptor
  -> AsyncLocalStorage correlation/tenant context
  -> Prisma tenant-scoping extension
```

Practical result:

- services do not need to remember `tenantId` in every query path
- the ORM layer adds tenant enforcement for listed tenant-scoped models

## System-Level Bypass

The backend deliberately supports system-level operations that must cross tenant boundaries.

This is done through `withoutTenantScopingAsync(...)`.

Observed use cases include:

- auth/session validation
- tenant lookup during guard execution
- startup/bootstrap tasks
- scheduled or maintenance workflows

This bypass is necessary, but it is also the main escape hatch that can create cross-tenant risk if overused or used casually.

## Strong Points

### Tenant-First Schema Design

The schema is not pretending to be single-tenant. Tenant awareness is built into relations, keys, and indexes.

### Composite-Key Safety

Several high-value entities use composite `[id, tenantId]` identity or tenant-aware relations, which reduces accidental cross-tenant joins and lookups.

### ORM-Level Enforcement

Tenant scoping is centralized in Prisma instead of left entirely to controllers and service authors.

### Explicit Cross-Tenant Gate

`TenantGuard` makes cross-tenant access a special case for `super-admin`, rather than silently allowing tenant context drift.

## Residual Risks

### Bypass Misuse

`withoutTenantScopingAsync(...)` is the main control that can defeat the isolation model.

It should remain limited to:

- bootstrap
- auth/session internals
- explicit system maintenance
- carefully reviewed admin workflows

### Raw SQL and Manual Query Paths

Any raw SQL path or direct query logic that bypasses the tenant-scoping extension must be reviewed manually for tenant filters.

### Super-Admin Cross-Tenant Access

The current model allows `super-admin` users to cross tenant boundaries through `TenantGuard`.

That is operationally useful, but it should eventually be wrapped in stronger support-session or impersonation governance.

### Non-Tenant-Scoped Models

The safety of the model depends on the correctness of the tenant-scoped model list. A newly added domain model can become a gap if it is not added to tenant-scoping rules.

## Guidance for Contributors

1. Always keep `TenantGuard` on tenant-scoped controllers.
2. Prefer normal Prisma access over bypass helpers.
3. Use `withoutTenantScopingAsync(...)` only for true system-level operations.
4. When adding new tenant-owned models, wire them into tenant-scoping immediately.
5. When writing raw SQL, include tenant boundaries explicitly and review them as a security-sensitive change.

## Current Assessment

Multi-tenancy maturity: strong for a shared-database SaaS.

The main remaining risk is not absence of tenant controls, but accidental escape from otherwise solid tenant controls.
