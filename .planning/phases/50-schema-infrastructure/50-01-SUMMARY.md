---
phase: 50-schema-infrastructure
plan: 01
subsystem: auth
tags: [better-auth, prisma, hibp, session, cookie, next.js]

requires:
  - phase: none
    provides: first phase of v5.0 migration

provides:
  - Prisma schema with Account and Verification models for better-auth
  - better-auth server instance in Next.js with HIBP hook
  - Pages Router catch-all at /api/auth/*
  - HIBP k-anonymity password check utility
  - Frontend Prisma client via copied schema

affects: [50-02, 51-core-auth, 52-nestjs-session, 53-frontend-auth]

tech-stack:
  added: [better-auth, "@thallesp/nestjs-better-auth", "@prisma/client (frontend)"]
  patterns: [singleton PrismaClient in Next.js, toNodeHandler catch-all, fail-open HIBP check]

key-files:
  created:
    - frontend/lib/auth.ts
    - frontend/lib/hibp.ts
    - frontend/lib/__tests__/hibp.test.ts
    - frontend/pages/api/auth/[...all].ts
    - frontend/prisma/schema.prisma
  modified:
    - backend/prisma/schema.prisma
    - frontend/package.json
    - backend/package.json
    - frontend/.env.example

key-decisions:
  - "Keep passwordHash, isMfaEnabled, lastActivityAt as deprecated optional fields for backward compat (removed in Phase 58)"
  - "Keep compound unique @@unique([tenantId, email]) on User alongside @unique on email for legacy code compat"
  - "Session.tenantId kept as optional deprecated field to avoid breaking NestJS auth services"
  - "Use non-null assertions in legacy auth services for nullable tenantId (cleanup in Phase 58)"

patterns-established:
  - "Singleton PrismaClient in Next.js via globalThis pattern"
  - "better-auth hooks.before with createAuthMiddleware for pre-signup checks"
  - "HIBP fail-open pattern: on any error, allow password (best-effort security)"

requirements-completed: [CORE-06, CORE-07]

duration: 15min
completed: 2026-03-06
---

# Phase 50 Plan 01: Schema & Infrastructure Summary

**Prisma schema reshaped for better-auth (Account, Verification, User.emailVerified) with HIBP password check and Next.js better-auth instance mounted at /api/auth/*.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-06T19:57:01Z
- **Completed:** 2026-03-06T20:12:01Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Prisma schema has Account and Verification models, User has name/emailVerified/image fields, Session has updatedAt/activeOrganizationId
- better-auth server instance configured in Next.js with email/password auth, session cookie cache, HIBP hook, and user additionalFields
- HIBP k-anonymity password check utility with 5 passing tests (breached, clean, timeout, error, non-200)
- Pages Router catch-all route at /api/auth/[...all] with bodyParser disabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Reshape Prisma schema + install packages + create HIBP utility** - `3aa6ee66` (feat)
2. **Task 2: Mount better-auth instance in Next.js Pages Router** - `1334b777` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Account, Verification models; User/Session reshaped for better-auth
- `frontend/lib/auth.ts` - better-auth server instance with Prisma adapter, HIBP hook, session config
- `frontend/lib/hibp.ts` - HIBP k-anonymity password check (fail-open)
- `frontend/lib/__tests__/hibp.test.ts` - 5 unit tests for HIBP utility
- `frontend/pages/api/auth/[...all].ts` - Pages Router catch-all for better-auth
- `frontend/prisma/schema.prisma` - Copy of backend schema for frontend Prisma client
- `frontend/.env.example` - BETTER_AUTH_URL, BETTER_AUTH_SECRET, DATABASE_URL added

## Decisions Made
- Kept passwordHash, isMfaEnabled, lastActivityAt as deprecated optional fields to avoid breaking 40+ references in legacy auth services. These will be deleted in Phase 58.
- Added compound unique @@unique([tenantId, email]) back alongside @unique on email so legacy code using tenantId_email lookups still compiles.
- Session.tenantId kept as optional (not removed) because NestJS auth services still reference it.
- Used non-null assertions (!) in legacy services for tenantId access rather than rewriting them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept deprecated fields for backward compatibility**
- **Found during:** Task 1 (Schema reshape)
- **Issue:** Plan said to remove passwordHash, isMfaEnabled from User and tenantId from Session, but also said "Do NOT break existing code." Removing these broke 40+ type errors in legacy auth services.
- **Fix:** Kept as deprecated optional fields with doc comments marking them for Phase 58 removal. Added non-null assertions to legacy code accessing nullable tenantId.
- **Files modified:** backend/prisma/schema.prisma, 8 legacy service files
- **Verification:** `npx prisma validate` passes, `npm run type-check` passes
- **Committed in:** 3aa6ee66

---

**Total deviations:** 1 auto-fixed (1 bug/compatibility)
**Impact on plan:** Necessary to maintain backward compatibility. Schema still has all better-auth fields. Deprecated fields marked for Phase 58 cleanup.

## Issues Encountered
- Jest in frontend uses `--testPathPatterns` (plural) instead of `--testPathPattern` (newer Jest version).

## User Setup Required

Users need to set these environment variables in `frontend/.env.local`:
- `BETTER_AUTH_URL=http://localhost:3001`
- `BETTER_AUTH_SECRET=<random 32+ char string>` (generate with `openssl rand -base64 32`)
- `DATABASE_URL=<postgresql connection string>`

## Next Phase Readiness
- better-auth instance is configured and ready; Phase 50-02 can create the NestJS consumer instance
- Schema has all required models for downstream phases (51-58)
- Legacy auth code compiles but is not wired to better-auth yet (Phase 52+)

---
*Phase: 50-schema-infrastructure*
*Completed: 2026-03-06*
