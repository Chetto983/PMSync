---
phase: 69-backend-integration-tests
plan: "03"
subsystem: backend/contract-tests
tags: [contract, openapi, api-shape, integration-tests]
dependency_graph:
  requires:
    - backend/test/contract/contract-helpers.ts
  provides:
    - backend/test/contract/calendar.contract.spec.ts
    - backend/test/contract/labels.contract.spec.ts
    - backend/test/contract/providers.contract.spec.ts
    - backend/test/contract/subscription.contract.spec.ts
    - backend/test/contract/orgs.contract.spec.ts
    - backend/test/contract/admin.contract.spec.ts
  affects:
    - frontend/lib/api/calendar.ts (referenced for field expectations)
    - frontend/lib/api/labels.ts (referenced for field expectations)
    - frontend/lib/api/providers.ts (referenced for field expectations)
    - frontend/lib/api/billing.ts (referenced for field expectations)
tech_stack:
  added: []
  patterns:
    - Contract spec pattern: loadSpec() + graceful-skip + multi-path variants for better-auth routes
    - Error envelope assertion: { error, meta } top-level keys (no statusCode in body)
key_files:
  created:
    - backend/test/contract/calendar.contract.spec.ts
    - backend/test/contract/labels.contract.spec.ts
    - backend/test/contract/providers.contract.spec.ts
    - backend/test/contract/subscription.contract.spec.ts
    - backend/test/contract/orgs.contract.spec.ts
    - backend/test/contract/admin.contract.spec.ts
  modified: []
decisions:
  - key: soft-assertions-for-better-auth-routes
    summary: >
      Orgs and admin contract specs use multi-path variants with soft assertions at every level
      because better-auth plugin routes (/api/auth/organization/*, /api/auth/admin/*) may not
      appear in the NestJS-generated OpenAPI spec. All path, 200-schema, and error-schema
      assertions gracefully skip if paths are absent.
  - key: error-envelope-no-statuscode
    summary: >
      All error envelope assertions check for top-level 'error' and 'meta' keys only.
      ApiExceptionFilter does NOT include statusCode in the response body. Asserting statusCode
      would be wrong. All envelope assertions are soft-guarded (if !schema return) since
      some specs do not document 401/403 response schemas.
metrics:
  duration: 15min
  completed: "2026-03-11"
  tasks_completed: 2
  files_created: 6
  files_modified: 0
---

# Phase 69 Plan 03: Contract Tests for Calendar, Labels, Providers, Subscription, Orgs, and Admin Summary

**One-liner:** 6 OpenAPI contract specs validating success shapes and ApiExceptionFilter error envelopes for calendar, labels, providers, subscription, orgs, and admin endpoint groups — all gracefully skipping when spec is absent.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write calendar, labels, and providers contract specs | 29887d0a | calendar.contract.spec.ts, labels.contract.spec.ts, providers.contract.spec.ts |
| 2 | Write subscription, orgs, and admin contract specs | 9848b0ec | subscription.contract.spec.ts, orgs.contract.spec.ts, admin.contract.spec.ts |

## What Was Built

### 6 Contract Spec Files

All 6 specs follow the established pattern from `contract-helpers.ts` and `contacts-list.contract.spec.ts`:

**calendar.contract.spec.ts** (6 tests):
- GET /api/v1/calendar/events path exists
- Events list has `events` and `total` fields
- 401 error uses ApiExceptionFilter envelope (`error` + `meta` top-level keys)
- GET /api/v1/calendar/events/{id} path exists (multi-path variant)
- Single event has `id` and `title` fields
- POST /api/v1/calendar/events/sync path exists (soft)

**labels.contract.spec.ts** (5 tests):
- GET /api/v1/labels path exists
- Labels list item has `id`, `name`, `slug` fields (handles array and `{ labels: [] }` shapes)
- 401 error uses ApiExceptionFilter envelope (soft)
- POST /api/v1/labels path exists
- POST 201/200 response has label fields

**providers.contract.spec.ts** (6 tests):
- GET /api/v1/providers path exists
- Providers list item has `providerType` and `email` fields
- 401 error uses ApiExceptionFilter envelope (soft)
- GET /api/v1/providers/{id} path exists (multi-path variant)
- Single provider has `id`, `providerType`, `isActive` fields
- DELETE /api/v1/providers/{id} path exists (multi-path variant)

**subscription.contract.spec.ts** (5 tests):
- GET /api/v1/subscription path exists
- Subscription response has `plan` and `status` (direct or wrapped in `{ subscription }`)
- 401 error uses ApiExceptionFilter envelope (soft)
- GET /api/v1/subscription/usage path exists (soft, multi-path variant)
- Usage response is defined (accepts any schema)

**orgs.contract.spec.ts** (3 tests):
- Organization list path exists (soft, 3 path variants including better-auth)
- Organization list response has `id` and `name` fields (all-soft)
- 401 error uses ApiExceptionFilter envelope (all-soft)

**admin.contract.spec.ts** (4 tests):
- Admin user list path exists (soft, 3 path variants including better-auth)
- Admin user list response has `users` or `data` array (soft)
- Admin user list response has `total` or `count` field (soft)
- 403 error uses ApiExceptionFilter envelope (soft)

### Full Contract Suite Results

```
Test Suites: 11 passed, 11 total
Tests:       67 passed, 67 total
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

**Task 2 files committed in prior plan execution:** The subscription, orgs, and admin spec files were written during this execution but committed alongside `tenant-isolation.spec.ts` in commit `9848b0ec` (from plan 69-01 execution running in parallel). The files match the plan specification exactly. All 6 files are present and all tests pass.

## Verification

- All 11 contract suites pass (67 tests)
- All 6 new spec files exist in `backend/test/contract/`
- Each spec loads spec via `loadSpec()` and gracefully skips if null
- Each spec has at least one error envelope assertion checking `error` and `meta` (NOT `statusCode`)
- All error envelope assertions are soft-guarded
- Orgs and admin specs use multi-path variant checks with soft assertions at every level
- TypeScript type-check passes (`npx tsc --noEmit` exits 0)

## Self-Check: PASSED

All 6 spec files confirmed present on disk. Both commits (29887d0a, 9848b0ec) confirmed in git log.
