# Phase 99: Tech Debt Closure - Research

**Researched:** 2026-03-23
**Domain:** Database SQL functions, RBAC verification, React component splitting
**Confidence:** HIGH

## Summary

Phase 99 closes three tech debt items identified by the v7.0 milestone audit. All three are well-scoped, low-risk tasks with clear success criteria.

1. **Hybrid search SQL function deployment:** The `hybrid_email_search` and `hybrid_contact_search` SQL functions exist as Prisma migrations but have not been applied to the production database. The `HybridSearchService` already calls these functions and gracefully falls back to empty results when they are missing. The fix is deploying the migrations, not changing application code.

2. **Super-admin RBAC verification:** The `verify-rbac.ts` script only tests member-role denial. It needs a second test path that authenticates as a super-admin user and verifies access to admin-only endpoints succeeds (200/non-403). The RolesGuard unit tests already cover this logic, but the live verification script does not.

3. **OrgAdminPage.tsx splitting:** At 516 lines, it exceeds the 500-line CLAUDE.md limit by 16 lines. The file has four clearly delineated sections (CreateOrgDialog, DeleteOrgDialog, OrgMembersSection, OrgAdminPage) that can be extracted into separate files.

**Primary recommendation:** Execute Prisma migrations on production, add super-admin test path to verify-rbac.ts, extract dialogs from OrgAdminPage.tsx.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-15 (partial) | hybrid_email_search SQL function exists in DB; HybridSearchService uses full hybrid search | Migrations exist at `20260320190000` and `20260320200000`; service code already calls the functions; gap is deployment only |
| SEC-05 (partial) | verify-rbac.ts exercises super-admin RBAC bypass path | verify-rbac.ts needs super-admin auth + admin endpoint access test; RolesGuard bypass logic is at line 60-62 of roles.guard.ts |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase uses existing tooling only.

### Core
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Prisma CLI | (existing) | Run database migrations | `npx prisma migrate deploy` |
| tsx | (existing) | Run TypeScript scripts | `npx tsx scripts/verify-rbac.ts` |
| Vitest | (existing) | Run hybrid search tests | `npx vitest run hybrid-search` |
| Jest | (existing) | Run RBAC guard tests | `npx jest better-auth-flows` |

## Architecture Patterns

### Task 1: Deploy Hybrid Search SQL Functions

**Current state:** Two Prisma migrations exist but are not applied to the Railway database:
- `20260320190000_add_hybrid_search_functions/migration.sql` -- creates `hybrid_email_search` and `hybrid_contact_search` functions
- `20260320200000_fix_hybrid_search_rrf_type/migration.sql` -- fixes DOUBLE PRECISION cast for PostgreSQL 18 compatibility

**Application code is ready.** `HybridSearchService.searchEmails()` (line 150-154) already calls `hybrid_email_search` via `$queryRaw`. It catches errors and returns empty arrays as a fallback (line 166-172). Once the SQL function exists in the database, the fallback path is no longer taken.

**Deployment approach:**
```bash
cd backend
npx prisma migrate deploy
```

This applies all pending migrations. Since the migrations use `CREATE OR REPLACE FUNCTION`, they are idempotent and safe to re-run.

**Verification:** After deployment, call the knowledge base search endpoint and confirm results include RRF-scored hybrid results (not empty fallback).

### Task 2: Add Super-Admin Path to verify-rbac.ts

**Current state:** `verify-rbac.ts` (173 lines) authenticates a member user and tests:
- 4 admin endpoints return 403 (admin-deny)
- 2 member endpoints return non-403 (member-allow)

**Missing:** A super-admin user authentication + test that admin endpoints return non-403 for super-admin.

**Pattern to follow:** The script already has the `authenticate()` and `req()` helper functions. Add a new section after the member tests:

1. Add env vars: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (or reuse existing `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` from `run-security-verify.js` since `admin@pmsync.local` IS the super-admin)
2. Authenticate super-admin
3. Test the same admin endpoints and verify non-403

**RolesGuard bypass logic** (roles.guard.ts line 60-62):
```typescript
const hasRole =
  user.role === RolesGuard.SUPER_ADMIN_ROLE ||
  requiredRoles.includes(user.role);
```

The super-admin role bypasses ALL role checks. This is the path to verify.

**Important:** `run-security-verify.js` already sets `TEST_USER_EMAIL: 'admin@pmsync.local'` and `TEST_USER_PASSWORD: 'TestPassword123!'` -- this IS a super-admin user. The verify-rbac.ts script should use these credentials for the super-admin test path.

### Task 3: Split OrgAdminPage.tsx

**Current state:** 516 lines, 4 clear sections:
- Lines 67-165: `CreateOrgDialog` (~99 lines)
- Lines 171-255: `DeleteOrgDialog` (~85 lines)
- Lines 261-341: `OrgMembersSection` (~81 lines)
- Lines 347-516: `OrgAdminPage` main component (~170 lines)

**Extraction plan:** Move the two dialogs out. The main component + OrgMembersSection together are ~251 lines, well under 500.

**Target structure:**
```
frontend/components/organizations/
  OrgAdminPage.tsx           # Main component + OrgMembersSection (~340 lines)
  CreateOrgDialog.tsx         # ~99 lines
  DeleteOrgDialog.tsx         # ~85 lines
  InviteMemberDialog.tsx      # Already exists as separate file
```

**Shared types** (`OrganizationListItem`, `OrganizationMemberRow`) stay in `OrgAdminPage.tsx` and get exported, or move to a types file. Since OrgMembersSection is only used inline by OrgAdminPage, it can stay in the same file.

**Alternative:** Extract `OrgMembersSection` too, making OrgAdminPage ~170 lines. But the section is tightly coupled (only used as child of OrgAdminPage table rows), so keeping it together is cleaner.

### Anti-Patterns to Avoid
- **Do not change HybridSearchService code.** The service is already correct. The gap is purely database-side.
- **Do not create new test files for RBAC.** Extend the existing `verify-rbac.ts` script.
- **Do not restructure the organizations directory.** Only extract the dialogs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL function deployment | Manual SQL execution | `prisma migrate deploy` | Tracked, idempotent, auditable |
| Component extraction | New architecture | Simple file moves + re-exports | 16-line overage, not a redesign |

## Common Pitfalls

### Pitfall 1: Prisma Migration on Railway
**What goes wrong:** `prisma migrate deploy` may fail if the Railway database connection is not accessible from the local machine (Railway uses TCP proxy, not public domain).
**Why it happens:** Railway Postgres has no public domain by default; access is via TCP proxy only.
**How to avoid:** Use the Railway TCP proxy URL or deploy via Railway's build pipeline (which runs migrations automatically). Reference: `memory/reference_railway_postgres.md`.
**Warning signs:** Connection timeout or "could not connect to server" errors.

### Pitfall 2: Super-Admin User Doesn't Exist
**What goes wrong:** The `admin@pmsync.local` user may not exist on the Railway instance, or may have a different password.
**Why it happens:** Seed data may not have been applied.
**How to avoid:** The `run-security-verify.js` runner already uses these credentials and passed all 6/6 RBAC tests on 2026-03-22. The user exists.
**Warning signs:** Authentication returns non-200 or no set-cookie header.

### Pitfall 3: OrgAdminPage Import Breakage
**What goes wrong:** Other files import from `OrgAdminPage.tsx` and break after extraction.
**Why it happens:** The dialogs or types were imported elsewhere.
**How to avoid:** Check all imports of `OrgAdminPage` before splitting. The main export `OrgAdminPage` stays in the same file, so page-level imports are unaffected. The dialogs are only used internally.
**Warning signs:** TypeScript compilation errors after split.

## Code Examples

### verify-rbac.ts Super-Admin Section Pattern
```typescript
// After member tests, add super-admin verification:
const SUPER_ADMIN_EMAIL = process.env.TEST_USER_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;

if (SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD) {
  console.log('\nTesting super-admin bypass (expect non-403):\n');
  const saAuth = await authenticate(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

  for (const [method, path, body] of adminEndpoints) {
    const r = await req(method, path, saAuth.cookie, saAuth.tenantId, body);
    const pass = r.status !== 403;
    // ... log and record result
  }
}
```

### CreateOrgDialog Extraction Pattern
```typescript
// frontend/components/organizations/CreateOrgDialog.tsx
import React, { useState } from 'react';
import { /* MUI imports */ } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateOrg } from '@/hooks/queries';

export function CreateOrgDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // ... existing code from lines 67-165
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`.test.ts`) + Jest (`.spec.ts`) |
| Config file | `backend/vitest.config.ts` + `backend/jest.config.ts` |
| Quick run command | `cd backend && npx vitest run hybrid-search` |
| Full suite command | `cd backend && npx vitest run && npx jest --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAPI-15 | Hybrid search returns RRF-scored results | unit | `cd backend && npx vitest run hybrid-search` | Yes |
| SEC-05 | Super-admin bypasses RBAC | unit + script | `cd backend && npx jest better-auth-flows --forceExit` | Yes (unit), script needs update |
| N/A | OrgAdminPage under 500 lines | type-check | `cd frontend && npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc --noEmit`
- **Per wave merge:** Full type-check both packages
- **Phase gate:** All type-checks green + verify-rbac.ts passes

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements.

## Open Questions

1. **Railway migration deployment method**
   - What we know: Prisma migrations exist, Railway has TCP proxy access
   - What's unclear: Whether migrations run automatically on Railway deploy or need manual execution
   - Recommendation: Check Railway build command in `Procfile` or `railway.toml`. If it includes `prisma migrate deploy`, redeploying the backend is sufficient.

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/ai-chat/services/hybrid-search.service.ts` -- current implementation, fallback behavior confirmed
- `backend/prisma/migrations/20260320190000_add_hybrid_search_functions/migration.sql` -- SQL function definitions
- `backend/prisma/migrations/20260320200000_fix_hybrid_search_rrf_type/migration.sql` -- type cast fix
- `backend/src/common/auth/roles.guard.ts` -- super-admin bypass logic at line 60-62
- `backend/scripts/verify-rbac.ts` -- current RBAC verification script (member-only)
- `backend/scripts/run-security-verify.js` -- runner with credentials
- `frontend/components/organizations/OrgAdminPage.tsx` -- 516 lines, clear section boundaries
- `.planning/v7.0-MILESTONE-AUDIT.md` -- gap definitions

### Secondary (MEDIUM confidence)
- `backend/src/common/auth/__tests__/better-auth-flows.spec.ts` -- existing RolesGuard unit tests (lines 176-228)
- `backend/src/modules/ai-chat/__tests__/hybrid-search.test.ts` -- existing hybrid search unit tests

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing tooling
- Architecture: HIGH -- all three tasks are mechanical (deploy migration, extend script, extract components)
- Pitfalls: HIGH -- Railway deployment is the only non-trivial concern, well-documented in project memory

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- no moving targets)
