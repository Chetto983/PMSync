# Phase 75: Organization E2E Fix - Research

**Researched:** 2026-03-13
**Domain:** better-auth organization plugin, Playwright E2E, Prisma schema
**Confidence:** HIGH

## Summary

The organization E2E tests (`organizations.spec.ts`) are fully skipped because `better-auth`'s organization.create API returns HTTP 500. After tracing the code from the E2E spec through the frontend auth client, NestJS backend, and Prisma schema, the most likely root cause is a **missing `metadata` column** on the `Tenant` model.

The better-auth organization plugin expects a `metadata` field on the organization table. The project's schema mapping in `better-auth.instance.ts` maps `organization -> Tenant`, `name -> name`, `slug -> slug`, `logo -> description`, but does NOT map `metadata`. The Tenant model in `schema.prisma` has no `metadata` column. When the plugin attempts to write `metadata` during org creation, Prisma throws because the column does not exist, causing a 500.

The secondary issue is that `auth.setup.member.ts` runs as a dependency for all 5 browser projects (chromium, firefox, webkit, mobile-chrome, mobile-safari), but the `member.json` storageState is only consumed by `organizations.spec.ts`. This adds unnecessary latency to every test run.

**Primary recommendation:** Add a `metadata` column to the Tenant model (or map it to an existing nullable field), fix the schema mapping, verify org creation works, then remove the `describe.skip` from `organizations.spec.ts` and scope `setup-member` dependency to only the projects that need it.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FE2E-01 | Organization flows tested end-to-end (create org, invite member, accept invitation, switch org) | Root cause of backend 500 identified (missing metadata column); fix path clear; spec already exists and is structurally correct |
</phase_requirements>

## Root Cause Analysis

### The 500 Error: Missing `metadata` Column

**Confidence: HIGH**

The better-auth organization plugin defines 6 fields for the organization table: `id`, `name`, `slug`, `logo`, `metadata`, `createdAt`. The project's schema mapping in `better-auth.instance.ts` (lines 377-389) maps:

```typescript
schema: {
  organization: {
    modelName: 'Tenant',
    fields: {
      name: 'name',
      slug: 'slug',
      logo: 'description', // Reuse description column for logo URL
    },
  },
},
```

The `metadata` field is NOT mapped, and the Tenant model has no `metadata` column:

```prisma
model Tenant {
  id          String    @id @default(cuid())
  name        String
  slug        String    @unique
  description String?   // mapped to 'logo'
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  // ... relations
  @@map("tenants")
}
```

When better-auth tries to create a Tenant record with `metadata: null` (or whatever default), Prisma rejects it because the column does not exist.

**Fix:** Either add `metadata String?` to the Tenant model, or add a field mapping in the organization plugin schema config: `metadata: 'description'` (if description isn't already used for logo) or a new nullable column.

Since `description` is already mapped to `logo`, a new nullable column `metadata` is needed. Alternatively, add a dedicated `logo` column and free up `description` for `metadata` -- but adding `metadata Json?` is simpler and more correct.

### Tenant-Scoping is NOT the Cause

The better-auth handler in `main.ts` (lines 462-496) is wrapped in `withoutTenantScopingAsync`, so all Prisma operations during auth requests bypass tenant scoping. This eliminates `TenantContextRequiredError` as a potential cause.

### ORG-05 Guard is NOT the Cause

The `before` middleware hook in `better-auth.instance.ts` (lines 548-568) checks for `super-admin` role on org management paths. The seed data confirms `admin@pmsync.local` has `role: 'super-admin'`, and the `allowUserToCreateOrganization` callback also checks for `super-admin`. These checks would return 403, not 500, if they failed.

## Architecture: Member Auth Setup Scoping

### Current State

In `playwright.config.ts`, ALL 5 browser projects depend on both `setup` and `setup-member`:

```typescript
dependencies: ['setup', 'setup-member'],
```

The `setup-member` project runs `auth.setup.member.ts`, which authenticates `member@pmsync.local` and saves storageState to `playwright/.auth/member.json`.

### Problem

Only `organizations.spec.ts` consumes `member.json` (in the "accept invitation as member" test at line 132). All other specs use `user.json`. Running member setup for firefox, webkit, mobile-chrome, and mobile-safari is wasted effort.

### Fix Options

**Option A (Recommended):** Make only `chromium` depend on `setup-member`. Organizations E2E is a functional test -- running it on one browser is sufficient. Other browsers keep just `['setup']` as dependency.

**Option B:** Create a separate Playwright project specifically for organization tests with `setup-member` dependency. This is overkill for 4 tests.

**Option C:** Use `testMatch` filtering in a dedicated project. Also overkill.

Option A is simplest and aligns with Playwright best practices (functional tests on one browser, cross-browser for rendering concerns).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema field mapping | Custom Prisma middleware | better-auth `schema.fields` config | Plugin handles all CRUD operations through this mapping |
| Session org tracking | Custom session middleware | better-auth `activeOrganizationId` on Session | Already wired via databaseHooks |
| Invitation email flow | Custom email queue | better-auth `sendInvitationEmail` callback | Already configured in plugin options |

## Common Pitfalls

### Pitfall 1: Running Migrations on Production/Railway Without Testing Locally
**What goes wrong:** Schema change breaks deployed backend.
**How to avoid:** Test the migration locally first with `npx prisma migrate dev`. Verify org creation works locally before deploying.

### Pitfall 2: Prisma `@updatedAt` Auto-Fill Conflict with better-auth
**What goes wrong:** better-auth only sets `createdAt` when creating organizations. Prisma's `@updatedAt` auto-fills `updatedAt`, which is fine. But if better-auth tries to set `updatedAt` explicitly, it could conflict.
**How to avoid:** Verify that the Tenant model's `updatedAt @updatedAt` field is handled by Prisma automatically without explicit input from better-auth.

### Pitfall 3: E2E Spec Assumes Specific Button Accessible Names
**What goes wrong:** The spec uses `getByRole('button', { name: 'Invite Member' })` which depends on the MUI Tooltip providing the accessible name.
**How to avoid:** Verify the Tooltip's `title` renders as the button's accessible name. The current code passes the translation `t.organizations.inviteMember` to the Tooltip, which should work as accessible name for the child IconButton.

### Pitfall 4: `describe.skip` Must Be Changed to `describe`
**What goes wrong:** Fixing the backend but forgetting to remove `test.describe.skip`.
**How to avoid:** After verifying the fix, change `test.describe.skip` to `test.describe` in `organizations.spec.ts`.

### Pitfall 5: E2E Uses `organization/list` Not `organization/list-organizations`
**What goes wrong:** The spec (line 86) calls `GET /api/auth/organization/list` to extract org ID. Some better-auth versions have different endpoint names.
**How to avoid:** Verify the endpoint works. The hook `use-organizations.ts` also uses `/organization/list`, confirming this is correct.

## Key Files

| File | Role | Action Needed |
|------|------|---------------|
| `backend/prisma/schema.prisma` | Tenant model definition | Add `metadata` column |
| `backend/src/common/auth/better-auth.instance.ts` | Organization plugin config | Add `metadata` field mapping |
| `frontend/e2e/organizations.spec.ts` | E2E test spec | Remove `describe.skip`, change to `describe` |
| `frontend/playwright.config.ts` | Playwright config | Scope `setup-member` dependency to chromium only |
| `backend/prisma/migrations/` | Migration files | New migration for metadata column |

## Code Examples

### Fix 1: Add metadata to Tenant Model

```prisma
model Tenant {
  id          String    @id @default(cuid())
  name        String
  slug        String    @unique
  description String?
  metadata    String?   // Required by better-auth organization plugin
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  // ... relations unchanged
  @@map("tenants")
}
```

### Fix 2: Update Schema Mapping

```typescript
organization({
  schema: {
    organization: {
      modelName: 'Tenant',
      fields: {
        name: 'name',
        slug: 'slug',
        logo: 'description',
        metadata: 'metadata',  // Add this mapping
      },
    },
  },
  // ... rest unchanged
}),
```

### Fix 3: Scope setup-member Dependency

```typescript
// playwright.config.ts
{
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'playwright/.auth/user.json',
  },
  dependencies: ['setup', 'setup-member'], // Keeps both
},
{
  name: 'firefox',
  use: {
    ...devices['Desktop Firefox'],
    storageState: 'playwright/.auth/user.json',
  },
  dependencies: ['setup'], // Remove setup-member
},
// Same for webkit, mobile-chrome, mobile-safari
```

### Fix 4: Remove describe.skip

```typescript
// organizations.spec.ts -- change line 20
test.describe('Organization flows', () => {
  // Remove the .skip and the associated SKIP comment block (lines 16-19)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.x |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `cd frontend && npx playwright test e2e/organizations.spec.ts --project=chromium` |
| Full suite command | `cd frontend && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FE2E-01 | Create org, invite, accept, switch | E2E | `cd frontend && npx playwright test e2e/organizations.spec.ts --project=chromium` | Yes (currently skipped) |

### Sampling Rate
- **Per task commit:** `cd frontend && npx playwright test e2e/organizations.spec.ts --project=chromium`
- **Per wave merge:** `cd frontend && npx playwright test --project=chromium`
- **Phase gate:** All 4 org tests pass with 0 failures

### Wave 0 Gaps
- [ ] Prisma migration for `metadata` column -- must run before any test can pass
- [ ] `describe.skip` must be changed to `describe` before test execution

## Open Questions

1. **Is `metadata` truly the only missing field?**
   - What we know: The organization plugin schema has 6 fields; the mapping covers 3 (name, slug, logo->description). `id` and `createdAt` match by convention. `metadata` is unmapped and has no column.
   - What's unclear: Whether better-auth silently omits unmapped optional fields or always includes them in the INSERT.
   - Recommendation: Add the column and mapping. If the 500 persists, check backend logs for the exact Prisma error. The debug approach should be: run the org creation locally with `DEBUG=*` or check Railway logs for the stack trace.

2. **Does `updatedAt` cause issues?**
   - What we know: Tenant has `updatedAt @updatedAt` (auto-managed by Prisma). The org plugin doesn't include `updatedAt` in its schema. Prisma auto-fills it on create/update.
   - What's unclear: Whether better-auth tries to explicitly set `updatedAt` or lets Prisma handle it.
   - Recommendation: Likely not an issue since Prisma handles `@updatedAt` automatically. Monitor after applying the metadata fix.

3. **Will org creation work on Railway after fix?**
   - What we know: The backend runs on Railway with Neon DB. Migration must be applied there.
   - What's unclear: Whether the Railway deployment auto-applies migrations or requires manual intervention.
   - Recommendation: Verify migration strategy. If manual, apply `npx prisma migrate deploy` on Railway after pushing the migration.

## Sources

### Primary (HIGH confidence)
- `backend/src/common/auth/better-auth.instance.ts` -- organization plugin config with schema mapping
- `backend/prisma/schema.prisma` -- Tenant model definition (no metadata column)
- `backend/src/main.ts` -- better-auth handler wrapped in withoutTenantScopingAsync (lines 462-496)
- `frontend/e2e/organizations.spec.ts` -- E2E spec with describe.skip
- `frontend/playwright.config.ts` -- project dependencies showing universal setup-member

### Secondary (MEDIUM confidence)
- [better-auth organization plugin docs](https://better-auth.com/docs/plugins/organization) -- confirms metadata field in organization table schema
- [better-auth schema mismatch issue #1414](https://github.com/better-auth/better-auth/issues/1414) -- confirms schema mapping issues were a known problem (fixed in PR #3021)

## Metadata

**Confidence breakdown:**
- Root cause (metadata column): HIGH -- code trace from plugin config to Prisma schema shows clear field mismatch
- Fix approach: HIGH -- standard Prisma migration + schema mapping update
- E2E spec correctness: HIGH -- spec was verified against local backend per skip comment
- Member auth scoping: HIGH -- straightforward config change

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- Prisma schema and better-auth config unlikely to change)
