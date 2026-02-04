---
phase: 07
plan: 04
subsystem: backend-security
tags: [csrf, security, middleware, double-submit-cookie]
dependency_graph:
  requires: []
  provides:
    - csrf-protection-backend
    - csrf-token-endpoint
    - csrf-middleware-registration
  affects:
    - frontend-csrf-integration
tech-stack:
  added:
    - csrf-csrf
  patterns:
    - Double Submit Cookie pattern
    - HMAC-signed CSRF tokens
    - Session identifier fallback (JWT userId -> IP)
key-files:
  created: []
  modified:
    - backend/src/common/middleware/csrf.middleware.ts
    - backend/src/modules/auth/controllers/auth.controller.ts
    - backend/src/main.ts
    - backend/.env.example
decisions:
  - key: csrf-package
    choice: csrf-csrf
    rationale: Maintained package designed for SPAs, replaces deprecated csurf
  - key: session-identifier
    choice: JWT userId with IP fallback
    rationale: Authenticated requests use userId, anonymous/pre-auth use IP
  - key: cookie-name
    choice: __Host-csrf (prod) / csrf (dev)
    rationale: __Host- prefix provides additional security in production
  - key: excluded-routes
    choice: /health, /webhooks, /oauth
    rationale: Webhooks use signatures, OAuth callbacks pre-session
metrics:
  duration: ~10 minutes
  completed: 2026-02-04
---

# Phase 07 Plan 04: CSRF Protection Backend - Double Submit Cookie Pattern Summary

**One-liner:** Double Submit Cookie CSRF protection using csrf-csrf package with HMAC-signed tokens for all state-changing API requests.

## Deliverables

### 1. CSRF Middleware (Task 2 - Already Committed)
**Commit:** `c2ff7433`
**File:** `backend/src/common/middleware/csrf.middleware.ts`

- Double Submit Cookie pattern with HMAC-signed tokens
- Session identifier: JWT userId for authenticated, IP for anonymous
- Cookie: `__Host-csrf` (production) / `csrf` (development)
- HttpOnly, SameSite=Strict, Secure (production)
- 24-hour token expiration
- Excluded paths: /health, /webhooks, /oauth

### 2. CSRF Package Installation (Task 1 - Already Committed)
**Commit:** `3a4ca9c1`
**File:** `backend/package.json`

- Installed `csrf-csrf` package (maintained, SPA-focused)

### 3. CSRF Token Endpoint (Task 3 - Part of 27437573)
**Commit:** `27437573` (bundled with 07-01 log redaction)
**File:** `backend/src/modules/auth/controllers/auth.controller.ts`

- `GET /api/v1/auth/csrf-token` endpoint
- Returns `{ csrfToken: string }` for frontend consumption
- SkipThrottle decorator (don't rate limit token fetches)
- Swagger documented

### 4. Middleware Registration (Task 4)
**Commit:** `16beb60c`
**Files:**
- `backend/src/main.ts`
- `backend/.env.example`

- Import and register csrfMiddleware after cookieParser
- Add `X-CSRF-Token` to CORS allowedHeaders
- Add `CSRF_SECRET` to .env.example

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 3a4ca9c1 | chore | install csrf-csrf package |
| c2ff7433 | feat | create CSRF middleware with Double Submit Cookie pattern |
| 27437573 | feat | auth controller CSRF endpoint (bundled with 07-01) |
| 16beb60c | feat | register CSRF middleware in main.ts |

## Verification Results

```
1. Middleware OK - doubleCsrf in csrf.middleware.ts
2. Endpoint OK - csrf-token in auth.controller.ts
3. Registration OK - csrfMiddleware in main.ts
4. CORS OK - X-CSRF-Token in main.ts
5. .env.example OK - CSRF_SECRET documented
```

Backend type-check: PASSED

## Implementation Flow

```
Frontend Request Flow:
1. Frontend calls GET /api/v1/auth/csrf-token on page load
2. Backend generates HMAC-signed token
3. Backend sets httpOnly cookie: csrf=[hash]
4. Backend returns JSON: { csrfToken: [token] }
5. Frontend stores token in memory (NOT localStorage - XSS risk)

Mutation Request Flow:
1. Frontend sends POST/PUT/DELETE/PATCH request
2. Frontend includes X-CSRF-Token header with stored token
3. csrfMiddleware intercepts request
4. Middleware verifies: HMAC(cookie) matches header token
5. If valid: request proceeds
6. If invalid: 403 Forbidden
```

## Security Properties

| Property | Implementation |
|----------|----------------|
| Token Source | HMAC-signed from secret |
| Cookie Flags | HttpOnly, SameSite=Strict, Secure (prod) |
| Token Expiry | 24 hours |
| Protected Methods | POST, PUT, DELETE, PATCH |
| Safe Methods | GET, HEAD, OPTIONS (skipped) |
| Excluded Paths | /health, /webhooks, /oauth |

## Deviations from Plan

### Task 3 Commit Bundling
- **Issue:** Task 3 (CSRF endpoint) was committed as part of 07-01 log redaction changes
- **Impact:** Minor - work completed, just in different commit
- **Resolution:** Documented in summary

### Minor Middleware Cleanup
- **Issue:** Uncommitted changes to csrf.middleware.ts (removing unused http-errors import)
- **Impact:** None - cosmetic cleanup only
- **Resolution:** Left uncommitted as non-functional change

## Success Criteria Status

- [x] SEC-04: csrf-csrf package installed
- [x] SEC-04: CSRF middleware validates X-CSRF-Token on mutations
- [x] SEC-04: Token endpoint at `/api/v1/auth/csrf-token`
- [x] SEC-04: CORS allows X-CSRF-Token header
- [x] SEC-04: Webhooks and OAuth excluded from CSRF
- [x] Type check passes in backend

## Next Phase Readiness

### Frontend Integration Required (Plan 07-05)
- Frontend needs to call `/api/v1/auth/csrf-token` on app load
- Store token in memory (React state/context)
- Include `X-CSRF-Token` header on all mutations
- Handle 403 responses (token expired/invalid)

### Environment Setup
- Production: Set `CSRF_SECRET` env var (generate with `openssl rand -hex 32`)
- Development: Falls back to `JWT_SECRET` if not set
