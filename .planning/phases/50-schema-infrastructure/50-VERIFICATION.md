---
phase: 50-schema-infrastructure
verified: 2026-03-06T21:45:00Z
status: gaps_found
score: 6/7 must-haves verified
re_verification: false
gaps:
  - truth: "Sessions are DB-backed httpOnly cookies with no JWT in the new auth path"
    status: partial
    reason: "cookieCache.strategy config diverges between frontend (missing) and backend ('compact'). The backend code itself warns: 'If they diverge, cookieCache validation will fail silently and every request will hit the DB.'"
    artifacts:
      - path: "frontend/lib/auth.ts"
        issue: "cookieCache config missing 'strategy: compact' -- backend has it, frontend does not"
    missing:
      - "Add strategy: 'compact' to frontend/lib/auth.ts session.cookieCache config to match backend"
---

# Phase 50: Schema & Infrastructure Verification Report

**Phase Goal:** Establish the better-auth foundation -- reshape Prisma schema for better-auth compatibility, install packages, create HIBP utility, mount better-auth in Next.js Pages Router, and wire NestJS session consumer.
**Verified:** 2026-03-06T21:45:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Prisma schema validates with better-auth tables (User reshaped, Session reshaped, Account new, Verification new) | VERIFIED | Account model at line 266, Verification at 285, User has name/emailVerified/image, Session has updatedAt/activeOrganizationId. Deprecated fields kept with doc comments for Phase 58. |
| 2 | better-auth instance initializes in Next.js and responds to /api/auth/* routes | VERIFIED | `frontend/lib/auth.ts` exports configured betterAuth instance. `frontend/pages/api/auth/[...all].ts` uses toNodeHandler with bodyParser disabled. |
| 3 | HIBP check function rejects known-breached passwords | VERIFIED | `frontend/lib/hibp.ts` implements k-anonymity SHA-1 check with fail-open. 5 unit tests cover breached, clean, timeout, error, non-200 scenarios. |
| 4 | Sessions are DB-backed httpOnly cookies with no JWT in the new auth path | PARTIAL | No JWT references in auth.ts (0 matches). better-auth uses DB-backed sessions by default. However, cookieCache.strategy diverges between frontend and backend (see gaps). |
| 5 | NestJS better-auth consumer instance initializes and can validate sessions from shared DB | VERIFIED | `better-auth.instance.ts` creates consumer-only instance with prismaAdapter pointing to same DB. No emailAndPassword or hooks -- read-only for session validation. |
| 6 | NestJS BetterAuthModule loads and provides BETTER_AUTH injection token | VERIFIED | `better-auth.module.ts` provides BETTER_AUTH token via factory injecting PrismaService. Exported for DI. |
| 7 | Session validation reads cookies/headers only (no body parsing changes needed) | VERIFIED | No bodyParser changes in main.ts. BetterAuthModule imported in AppModule at line 83 alongside legacy AuthModule. |

**Score:** 6/7 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | User, Session, Account, Verification models | VERIFIED | Account at L266, Verification at L285, User reshaped with name/emailVerified/image, deprecated fields marked |
| `frontend/lib/auth.ts` | better-auth server instance with HIBP hook | VERIFIED (minor gap) | Exports `auth`, has prismaAdapter, emailAndPassword, HIBP hook. Missing `strategy: 'compact'` in cookieCache. |
| `frontend/lib/hibp.ts` | HIBP k-anonymity password check | VERIFIED | 64 lines, exports `checkHIBP`, SHA-1 + k-anonymity + fail-open |
| `frontend/pages/api/auth/[...all].ts` | Pages Router catch-all | VERIFIED | 5 lines, toNodeHandler(auth.handler), bodyParser: false |
| `frontend/prisma/schema.prisma` | Copy of backend schema | VERIFIED | File exists, postinstall prisma generate in package.json |
| `backend/src/common/auth/better-auth.instance.ts` | NestJS-side better-auth instance factory | VERIFIED | Exports createBetterAuthInstance, consumer-only, matching config |
| `backend/src/common/auth/better-auth.module.ts` | NestJS module with BETTER_AUTH DI token | VERIFIED | Exports BetterAuthModule, factory provider with PrismaService |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/pages/api/auth/[...all].ts` | `frontend/lib/auth.ts` | imports auth, passes auth.handler to toNodeHandler | WIRED | Line 2: `import { auth } from "@/lib/auth"`, Line 5: `toNodeHandler(auth.handler)` |
| `frontend/lib/auth.ts` | `frontend/lib/hibp.ts` | hooks.before calls checkHIBP | WIRED | Line 5: `import { checkHIBP }`, Line 47: `const { breached } = await checkHIBP(password)` |
| `frontend/lib/auth.ts` | `backend/prisma/schema.prisma` | prismaAdapter reads tables | WIRED | Line 13: `prismaAdapter(prisma, { provider: "postgresql" })` |
| `backend/src/common/auth/better-auth.instance.ts` | `backend/prisma/schema.prisma` | prismaAdapter connects to same DB | WIRED | Line 18: `prismaAdapter(prisma, { provider: 'postgresql' })` |
| `backend/src/common/auth/better-auth.module.ts` | `backend/src/app.module.ts` | BetterAuthModule imported in AppModule | WIRED | app.module.ts L42: import, L83: in imports array |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CORE-06 | 50-01, 50-02 | User session persists via httpOnly cookie (DB-backed, no JWT) | SATISFIED | better-auth uses DB-backed sessions with httpOnly cookies by default. No JWT in auth.ts. Session model in schema. |
| CORE-07 | 50-01 | Compromised passwords blocked via HIBP check on signup/change | SATISFIED | checkHIBP called in hooks.before on /sign-up/email. Throws APIError if breached. 5 tests pass. |

No orphaned requirements found for Phase 50.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/lib/auth.ts` | 25-28 | cookieCache missing `strategy: 'compact'` -- diverges from backend instance | Warning | Silent performance degradation: every NestJS request may hit DB instead of using cached cookie. The backend code explicitly warns about this. |

### Human Verification Required

### 1. Auth Routes Respond

**Test:** Start frontend dev server (`cd frontend && npm run dev`), then GET `http://localhost:3001/api/auth/ok` or POST to `/api/auth/sign-up/email`.
**Expected:** Should get a structured response (not 404). Confirms catch-all route works.
**Why human:** Requires running dev server and making HTTP requests.

### 2. NestJS Starts with BetterAuthModule

**Test:** Start backend dev server (`cd backend && npm run start:dev`), check logs.
**Expected:** Server starts without errors. BetterAuthModule loads.
**Why human:** Requires running the server and inspecting startup behavior.

### 3. Schema Applies to DB

**Test:** Run `cd backend && npx prisma db push --accept-data-loss` on a dev database.
**Expected:** Schema applies successfully, Account and Verification tables created.
**Why human:** Requires a running PostgreSQL instance.

### Gaps Summary

One gap found: **cookieCache strategy config mismatch** between the frontend `auth.ts` and backend `better-auth.instance.ts`. The frontend is missing `strategy: "compact"` in its `session.cookieCache` config. The backend explicitly has it and warns that divergence "will fail silently and every request will hit the DB." This is a one-line fix but the divergence is real and could cause silent performance issues when both services are running.

Everything else is solid: schema has all 4 required models, HIBP is fully tested, auth routes are properly wired, NestJS module is correctly set up with factory DI, and no JWT is used anywhere in the new auth path.

---

_Verified: 2026-03-06T21:45:00Z_
_Verifier: Claude (gsd-verifier)_
