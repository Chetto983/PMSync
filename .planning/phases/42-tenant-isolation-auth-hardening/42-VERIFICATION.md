---
phase: 42-tenant-isolation-auth-hardening
verified: 2026-03-04T17:00:00Z
status: gaps_found
score: 11/15 must-haves verified
re_verification: false
gaps:
  - truth: "Non-admin user calling admin-only endpoint (e.g., UsersController) receives 403 Forbidden"
    status: failed
    reason: "UsersController has RolesGuard in the guard chain but zero @Roles decorators. Every authenticated user passes through all endpoints. This was an intentional deviation from the plan but it breaks TSEC-04 which explicitly names 'users controllers' as needing admin restriction."
    artifacts:
      - path: "backend/src/modules/users/controllers/users.controller.ts"
        issue: "Has @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard) at class level but NO @Roles decorator at class or method level — all endpoints are open to any authenticated role"
    missing:
      - "Add @Roles('admin') on admin-management methods within UsersController (e.g., listing all users, bulk ops), keeping /users/me as pass-through by omitting @Roles on self-service methods only"

  - truth: "All compliance controllers require admin role"
    status: partial
    reason: "Five compliance controllers are correctly guarded with @Roles('admin'): consent, data-export, data-deletion, legal, gdpr. However gdpr.controller.ts uses @Roles('admin', 'super-admin') rather than @Roles('admin') alone — this is acceptable as it is strictly more permissive for admins. Technically all compliance controllers do require admin or higher. Marking partial only because the split between plan scope and pre-existing state is unclear."
    artifacts:
      - path: "backend/src/modules/compliance/controllers/gdpr.controller.ts"
        issue: "Uses @Roles('admin', 'super-admin') — admin can still access, so this is functionally OK but deviates from uniform pattern"
    missing: []

  - truth: "Cross-tenant query returns zero records even if data exists for other tenants"
    status: partial
    reason: "Tests prove the WHERE clause is injected with tenantId (TSEC-01), but tests simulate the Prisma extension logic in a pure-function harness rather than using a real DB connection. No test verifies that an actual DB query with Tenant A context returns zero Tenant B records. The functional proof is inferred from injection correctness, not end-to-end."
    artifacts:
      - path: "backend/src/modules/auth/__tests__/tenant-isolation.spec.ts"
        issue: "Tests simulate extension behavior via a local function rather than running real Prisma queries against the database. Cross-tenant zero-record guarantee is not directly proven."
    missing:
      - "At minimum: document that the existing tenant-scoping.extension.spec.ts real-DB tests (if any exist) cover this, OR add one real-DB integration test that inserts Tenant A data and queries with Tenant B context, asserting empty results"

  - truth: "RolesGuard integration tests prove each role level (admin, manager, member, viewer) verified"
    status: partial
    reason: "TEST-02 requirement specifies 'each role level (admin, manager, member, viewer) verified against guarded endpoints'. The actual test file covers admin, manager, and 'user' role — but does NOT test 'member' or 'viewer' as named roles. These may not exist as role values in the system, but the requirement text names them."
    artifacts:
      - path: "backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts"
        issue: "Tests cover admin/manager/user/super-admin roles. 'member' and 'viewer' roles from TEST-02 requirement are absent."
    missing:
      - "Clarify whether 'member' and 'viewer' are actual role values in the system. If they exist, add tests for them. If 'user' is the equivalent of 'member/viewer', add a comment mapping this in the test."

  - truth: "Pre-existing tenant-scoped model count test passes"
    status: failed
    reason: "TENANT_SCOPED_MODELS now contains 48 entries but the existing test in tenant-scoping.extension.spec.ts asserts .size === 42. This test FAILS after phase 42 added 6 new models. Not caused by a plan defect but left as a broken CI state."
    artifacts:
      - path: "backend/src/prisma/tenant-scoping/__tests__/tenant-scoping.extension.spec.ts"
        issue: "Line 49: expects TENANT_SCOPED_MODELS.size to be 42, actual is 48. Phase 42 (plan 03) added RefreshToken and others without updating this assertion."
    missing:
      - "Update assertion on line 49 from toBe(42) to toBe(48)"
human_verification: []
---

# Phase 42: Tenant Isolation + Auth Hardening Verification Report

**Phase Goal:** Enforce row-level tenant scoping in every DB query, add RolesGuard coverage to >=50% of controllers, implement refresh-token rotation with theft detection, and prove it all with negative security tests.
**Verified:** 2026-03-04T17:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Non-admin user calling admin-only endpoint (UsersController) receives 403 | FAILED | UsersController has RolesGuard but zero `@Roles` decorators — all roles pass through |
| 2 | Regular member can still read contacts and emails (GET endpoints pass without @Roles) | VERIFIED | Contacts/emails controllers have class-level RolesGuard but only method-level @Roles on write methods |
| 3 | Write operations on contacts/emails require admin or manager role | VERIFIED | 15+ write methods in emails.controller.ts, contacts.controller.ts guarded with `@Roles('admin', 'manager')` |
| 4 | All compliance controllers require admin role | PARTIAL | 4 compliance controllers have `@Roles('admin')`, gdpr.controller.ts has `@Roles('admin','super-admin')` — admin access preserved |
| 5 | Attempting a write operation on guarded controllers as viewer/member returns 403 | VERIFIED | RolesGuard.canActivate throws ForbiddenException when role not in required list — proven by unit tests |
| 6 | Access token expires after 15 minutes and cookie maxAge matches | VERIFIED | `AUTH_COOKIE_OPTIONS.maxAge = 15 * 60 * 1000` in cookie.helper.ts |
| 7 | POST /auth/refresh issues new access+refresh token pair using consumed refresh token | VERIFIED | `rotateRefreshToken()` in auth.service.ts creates new pair, marks old as used; endpoint at line 282 in auth.controller.ts |
| 8 | Reusing a consumed refresh token fails and invalidates entire token family | VERIFIED | `deleteMany({ where: { familyId } })` called on theft detection; grace period implemented |
| 9 | Frontend auto-refreshes on 401 without user interaction or redirect | VERIFIED | `isRefreshing`/`failedQueue` pattern in api-client.ts lines 169-215 |
| 10 | Password change deletes all refresh tokens for the user across all devices | VERIFIED | `deleteAllRefreshTokens(user.id, user.tenantId)` called from `resetPassword()` at line 1137 |
| 11 | Concurrent 401s are queued and retried after a single refresh | VERIFIED | `failedQueue.push(...)` pattern in api-client.ts; proven by interceptor tests |
| 12 | Logout deletes all refresh tokens from the database for the user+tenant | VERIFIED | `deleteAllRefreshTokens(req.user.userId, req.user.tenantId)` at auth.controller.ts line 268 |
| 13 | Cross-tenant query returns zero records even if data exists for other tenants | PARTIAL | WHERE clause injection proven via simulation; no real-DB cross-tenant isolation test |
| 14 | Query executed without tenant context throws TenantContextRequiredError | VERIFIED | AUDIT_MODE=false confirmed; simulation tests prove throw on all 4 ops (findMany, create, update, delete) |
| 15 | RolesGuard coverage >=50% of controllers | VERIFIED | 17/32 controller files = 53.1% (SUMMARY claimed 15/33=45% but was undercounting pre-existing guarded controllers) |

**Score: 11/15 truths verified (4 partial/failed)**

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/src/modules/users/controllers/users.controller.ts` | STUB | Has guard chain but NO @Roles decorator — not admin-only as required |
| `backend/src/modules/contacts/controllers/contacts.controller.ts` | VERIFIED | Class-level RolesGuard + method-level @Roles('admin','manager') on writes |
| `backend/src/modules/compliance/controllers/consent.controller.ts` | VERIFIED | `@Roles('admin')` class-level |
| `backend/src/modules/compliance/controllers/data-export.controller.ts` | VERIFIED | `@Roles('admin')` class-level |
| `backend/src/modules/compliance/controllers/data-deletion.controller.ts` | VERIFIED | `@Roles('admin')` class-level |
| `backend/src/modules/compliance/controllers/legal.controller.ts` | VERIFIED | `@Roles('admin')` class-level |
| `backend/src/modules/subscription/controllers/subscription.controller.ts` | VERIFIED | `@Roles('admin')` class-level |
| `backend/src/modules/ai/controllers/ai-observability.controller.ts` | VERIFIED | `@Roles('admin')` class-level |
| `backend/src/modules/email/controllers/emails.controller.ts` | VERIFIED | Class-level RolesGuard + 14+ @Roles('admin','manager') on write methods |
| `backend/src/modules/auth/__tests__/roles-guard.integration.spec.ts` | VERIFIED | 12 tests; covers admin/manager/user/super-admin — missing member/viewer |
| `backend/prisma/schema.prisma` | VERIFIED | `model RefreshToken` at line 256 with familyId, tokenHash, isUsed, replacedBy |
| `backend/src/modules/auth/helpers/cookie.helper.ts` | VERIFIED | `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_OPTIONS` (7d, path-scoped), access 15m |
| `backend/src/modules/auth/controllers/auth.controller.ts` | VERIFIED | `@Post('refresh')` at line 282, no JwtAuthGuard, Throttle applied |
| `frontend/lib/api-client.ts` | VERIFIED | `isRefreshing` flag + `failedQueue`, `/auth/refresh` call on 401 |
| `backend/src/modules/auth/__tests__/refresh-token.spec.ts` | VERIFIED | 6 tests: rotation, theft detection, expiry, grace period, non-existent, deleteMany |
| `frontend/__tests__/api-client-interceptor.spec.ts` | VERIFIED | 4 tests: refresh on 401, concurrent queueing, no loop, non-401 passthrough |
| `backend/src/modules/auth/__tests__/tenant-isolation.spec.ts` | PARTIAL | 12 tests; simulates extension logic (not real DB); proves injection but not actual zero-record |
| `backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts` | VERIFIED | 6 tests (4 resetPassword + 2 deleteAllRefreshTokens standalone) |
| `backend/src/prisma/tenant-scoping/tenant-scoped-models.ts` | VERIFIED | RefreshToken added at line 43 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `controllers with @Roles` | `roles.guard.ts` | `JwtAuthGuard -> TenantGuard -> RolesGuard` guard chain | VERIFIED | All 17 guarded controllers use `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)` |
| `frontend/lib/api-client.ts` | `/api/v1/auth/refresh` | axios interceptor on 401 | VERIFIED | `apiClient.post('/auth/refresh')` at line 203 with `_retry` guard |
| `auth.controller.ts refresh` | `auth.service.ts rotateRefreshToken` | method call | VERIFIED | `this.authService.rotateRefreshToken(refreshToken)` at controller line 296 |
| `auth.service.ts rotateRefreshToken` | `prisma.refreshToken` | DB operations | VERIFIED | `findUnique`, `update` (markUsed), `create`, `deleteMany` all present |
| `auth.controller.ts logout` | `prisma.refreshToken.deleteMany` | `deleteAllRefreshTokens(userId, tenantId)` | VERIFIED | Line 268 in auth.controller.ts |
| `tenant-isolation.spec.ts` | `tenant-scoping.extension.ts` | Simulated `$allOperations` handler logic | PARTIAL | Imports and re-implements logic locally; does not call real extension |
| `password-change-invalidation.spec.ts` | `auth.service.ts` | NestJS TestingModule with mocked PrismaService | VERIFIED | Real AuthService wired, prisma.refreshToken.deleteMany mocked and asserted |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TSEC-01 | 42-04 | Prisma extension auto-injects tenantId from AsyncLocalStorage | PARTIAL | Injection proven via simulation tests; no real-DB cross-tenant zero-record test |
| TSEC-02 | 42-04 | Queries without tenant context throw TenantContextRequired | VERIFIED | AUDIT_MODE=false in extension; 4 operation types throw in simulation tests |
| TSEC-03 | 42-02 | RolesGuard applied to >=50% of controller methods | VERIFIED | 17/32 controller files = 53.1% — passes threshold |
| TSEC-04 | 42-02 | Admin-only endpoints guarded with @Roles('admin') — tenants, users controllers | PARTIAL | TenantsController guarded (pre-existing). UsersController has RolesGuard but NO @Roles — TSEC-04 explicitly names "users controllers" |
| TSEC-05 | 42-02 | Write operations guarded with @Roles('admin', 'manager') — contacts, emails | VERIFIED | Both controllers have method-level @Roles on all POST/PUT/PATCH/DELETE |
| TSEC-06 | 42-02 | Compliance/audit endpoints guarded | VERIFIED | consent, data-export, data-deletion, legal, gdpr all guarded; subscription and ai-observability also guarded |
| TSEC-07 | 42-02 | Integration test: non-admin calling admin endpoint returns 403 | VERIFIED | Test proves ForbiddenException thrown for 'user' role on admin-only endpoint |
| AUTH-01 | 42-03 | Access token lifetime reduced to 15 minutes | VERIFIED | `maxAge: 15 * 60 * 1000` in cookie.helper.ts line 35 |
| AUTH-02 | 42-03 | Refresh token rotation with one-time-use tokens | VERIFIED | isUsed flag, familyId theft detection, rotateRefreshToken logic complete |
| AUTH-03 | 42-03 | /auth/refresh endpoint for token renewal | VERIFIED | `@Post('refresh')` with `@Throttle({limit:10,ttl:60000})`, no JwtAuthGuard |
| AUTH-04 | 42-03 | Frontend auto-refresh via axios interceptor on 401 | VERIFIED | isRefreshing + failedQueue pattern; 4 tests passing |
| AUTH-05 | 42-03/04 | All refresh tokens invalidated on password change | VERIFIED | `deleteAllRefreshTokens` called from both resetPassword and logout |
| TEST-01 | 42-04 | Tenant-scoping negative tests — cross-tenant returns zero, missing context throws | PARTIAL | Throws proven; zero-record from wrong-tenant context simulated not DB-proven |
| TEST-02 | 42-02 | RolesGuard integration tests — each role level verified | PARTIAL | admin/manager/user tested; 'member' and 'viewer' roles absent from tests |
| TEST-03 | 42-03 | Refresh token rotation tests — reuse fails, chain works, password-change invalidation | VERIFIED | 6 backend tests cover all scenarios; deleteAllRefreshTokens mocked and asserted |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/prisma/tenant-scoping/__tests__/tenant-scoping.extension.spec.ts` | 49 | `expect(TENANT_SCOPED_MODELS.size).toBe(42)` — actual is 48 | BLOCKER | This test FAILS in CI after phase 42 added models to the scoped set. Breaks full test suite run. |
| `backend/src/modules/auth/__tests__/password-change-invalidation.spec.ts` | 160-230 | `resetPassword` tests do NOT assert `refreshToken.deleteMany` was called | WARNING | The resetPassword tests verify session deletion and cache invalidation but the prisma.refreshToken.deleteMany mock is never asserted from the resetPassword path — only from the standalone deleteAllRefreshTokens tests |
| `backend/src/modules/auth/__tests__/tenant-isolation.spec.ts` | 43-96 | `simulateExtensionQuery` re-implements extension logic locally | INFO | Simulation is a valid approach for unit tests but provides weaker guarantees than real Prisma client tests |

---

## Human Verification Required

None — all critical paths are verifiable programmatically.

---

## Gaps Summary

**4 gaps blocking full goal achievement:**

**Gap 1 (BLOCKER): UsersController not admin-gated (TSEC-04)**
The plan deviated from making UsersController admin-only, correctly noting that `/users/me` is self-service. However the fix was too broad — adding RolesGuard with NO @Roles anywhere makes the guard a no-op for all UsersController endpoints. The correct fix: keep GET /users/me as pass-through (no @Roles), but add `@Roles('admin')` on any actual admin management methods. If UsersController is purely self-service with no admin-only methods, document this explicitly and update TSEC-04 scope accordingly.

**Gap 2 (BLOCKER): Pre-existing model count test broken (infrastructure)**
`tenant-scoping.extension.spec.ts` line 49 asserts `size === 42` but actual is 48. This is a one-line fix but it means `npm test` currently has a failing test in the core tenant-scoping module — a security-critical component. This MUST be fixed before claiming the phase passes CI.

**Gap 3 (WARNING): Cross-tenant zero-record isolation not DB-proven (TSEC-01, TEST-01)**
The simulation tests prove the WHERE injection logic is correct. But TSEC-01 says "auto-injects tenantId from AsyncLocalStorage on all operations" — the real extension is the thing being tested. The simulation cannot detect if the real Prisma extension has been accidentally bypassed or misconfigured. Consider adding one real integration test using `withTenantContext('tenant-a', ...)` to insert a record and `withTenantContext('tenant-b', ...)` to query it, asserting empty results.

**Gap 4 (INFO): TEST-02 missing member/viewer role tests**
REQUIREMENTS.md TEST-02 says "each role level (admin, manager, member, viewer) verified". The test covers 'user' as a generic non-privileged role but never references 'member' or 'viewer'. If these are actual role values in the system, add tests. If 'user' subsumes these, add a clarifying comment.

---

*Verified: 2026-03-04T17:00:00Z*
*Verifier: Claude (gsd-verifier)*
