---
phase: 69-backend-integration-tests
plan: "02"
subsystem: backend/auth
tags: [integration-test, auth-guard, better-auth, tenant-guard, roles-guard, nestjs]
dependency_graph:
  requires: []
  provides: [BINT-02]
  affects: [backend/test/integration]
tech_stack:
  added: []
  patterns:
    - "APP_GUARD + BetterAuthGuard mock pattern for integration tests"
    - "Real DB rows (tenant/user/session) for guard pipeline testing"
    - "Targeted afterAll cleanup: session -> user -> tenant in FK order"
key_files:
  created:
    - backend/test/integration/auth-guard-chain.spec.ts
  modified: []
decisions:
  - "Target TenantsController.getAllTenants (GET /api/v1/tenants) as guard pipeline probe — requires TenantGuard + RolesGuard at class level and @Roles('super-admin') at method level"
  - "Tenant model is NOT in TENANT_SCOPED_MODELS — getAllTenants() works without withoutTenantScopingAsync in the service"
  - "Use createdTenantIds array collected across all tests for single afterAll cleanup pass"
metrics:
  duration: 8min
  completed_date: "2026-03-11"
  tasks_completed: 1
  files_changed: 1
---

# Phase 69 Plan 02: Auth Guard Chain Integration Tests Summary

**One-liner:** Full BetterAuthGuard -> TenantGuard -> RolesGuard pipeline proven via real DB rows and supertest HTTP requests, covering 401 unauthenticated, 403 cross-tenant, 403 wrong role, and 200 super-admin scenarios.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write auth guard chain integration spec | 429e7f25 | backend/test/integration/auth-guard-chain.spec.ts |

## What Was Built

Bootstrapped a minimal NestJS test application containing the full authentication guard pipeline:

- `BetterAuthGuard` registered as `APP_GUARD` (global) — validates sessions via mocked `auth.api.getSession`
- `TenantGuard` registered as class-level guard on `TenantsController` — looks up tenant from `X-Tenant-Id` header, enforces cross-tenant restriction
- `RolesGuard` registered as class-level guard — enforces `@Roles('super-admin')` on `getAllTenants()`

The test module includes `PrismaModule` (provides real `PrismaService`) and `EventEmitterModule.forRoot()` (satisfies `EventEmitter2` injection in `TenantService`).

### 4 Scenarios

| Scenario | Guard rejecting | Expected |
|----------|----------------|----------|
| No session (mockAuth returns null) | BetterAuthGuard | 401 |
| Member user with X-Tenant-Id pointing to another tenant | TenantGuard | 403 |
| Member user with correct tenant header | RolesGuard | 403 |
| Super-admin user with correct tenant header | (all pass) | 200 |

## Deviations from Plan

None — plan executed exactly as written. Verified that `Tenant` model is excluded from `TENANT_SCOPED_MODELS` (documented in source as "root entity"), so `TenantService.getAllTenants()` runs without needing `withoutTenantScopingAsync`.

## Test Results

```
PASS test/integration/auth-guard-chain.spec.ts (19.338 s)
  Auth Guard Chain (Integration)
    ✓ unauthenticated request returns 401 (226 ms)
    ✓ valid session but wrong-tenant header returns 403 (1720 ms)
    ✓ valid session, valid tenant, insufficient role returns 403 (303 ms)
    ✓ valid session with super-admin role returns 200 (336 ms)

Tests: 4 passed, 4 total
```

## Self-Check: PASSED

- FOUND: backend/test/integration/auth-guard-chain.spec.ts
- FOUND: commit 429e7f25
