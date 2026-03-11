---
phase: 69-backend-integration-tests
plan: "01"
subsystem: backend/test/integration
tags: [integration-test, tenant-isolation, prisma, als, bint-01]
dependency_graph:
  requires: []
  provides: [BINT-01]
  affects: [tenant-scoping-extension, correlation-context]
tech_stack:
  added: []
  patterns:
    - "Promise.resolve(PrismaPromise) inside ALS run() forces lazy thenable execution within correct scope"
    - "Targeted afterAll deletes (by tenantId) instead of TRUNCATE CASCADE for parallel Jest safety"
    - "queryAs<T>() helper encapsulates CorrelationContext.run + Promise.resolve pattern"
key_files:
  created:
    - backend/test/integration/tenant-isolation.spec.ts
  modified: []
decisions:
  - "Promise.resolve() wrapping PrismaPromise inside CorrelationContext.run() is required — PrismaPromise is lazy and defers .then() subscription until await, which is outside the ALS scope without this wrapping"
  - "Subscription domain uses dedicated tenantC/tenantD because Subscription has a unique constraint on tenantId"
  - "queryAs<T>() helper extracted for readability — avoids repeating the Promise.resolve + CorrelationContext.run pattern 12 times"
metrics:
  duration: 12min
  completed: "2026-03-11T19:28:16Z"
  tasks_completed: 1
  files_created: 1
---

# Phase 69 Plan 01: Cross-Tenant Isolation (BINT-01) Summary

**One-liner:** Tenant-scoping Prisma extension isolation proof via CorrelationContext ALS + Promise.resolve PrismaPromise forcing across email, labels, calendar, contacts, providers, and subscription domains.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Write cross-tenant isolation spec | 9848b0ec | backend/test/integration/tenant-isolation.spec.ts |

## Verification

- `npx jest test/integration/tenant-isolation --no-coverage` exits 0
- 12/12 tests pass across all 6 domains
- No `cleanupTestData()` TRUNCATE in afterAll
- Zero cross-tenant rows in any scoped query result

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PrismaPromise lazy thenable requires Promise.resolve() within ALS scope**

- **Found during:** Task 1 — first test run
- **Issue:** `CorrelationContext.run()` is synchronous. Prisma returns a `PrismaPromise` which is a lazy thenable: `.then()` is only called when the outer `await` resolves, which is AFTER the ALS context scope ends. The extension reads `tenantId` from ALS inside `.then()`, so it found no context and threw `TenantContextRequiredError` on every query.
- **Fix:** Wrapped every `scopedClient` call with `Promise.resolve()` inside the `CorrelationContext.run()` callback. `Promise.resolve(thenable)` calls `.then()` synchronously within the ALS scope, triggering PrismaPromise execution before the context ends. Extracted into a `queryAs<T>()` helper.
- **Files modified:** `backend/test/integration/tenant-isolation.spec.ts`
- **Commit:** 9848b0ec

## Self-Check: PASSED

- `backend/test/integration/tenant-isolation.spec.ts` — FOUND
- commit `9848b0ec` — FOUND
