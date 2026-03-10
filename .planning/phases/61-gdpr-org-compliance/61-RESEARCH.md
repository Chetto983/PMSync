# Phase 61: GDPR Organization Compliance - Research

**Researched:** 2026-03-10
**Domain:** GDPR data export/erasure for better-auth organization tables
**Confidence:** HIGH

## Summary

Phase 61 closes two requirements deferred from Phase 58: CLN-02 (GDPR data export includes org tables) and CLN-03 (right to erasure cascades into org tables). The scope is narrow and well-defined.

The existing `DataExportService.assembleUserData()` method queries 8 data categories but completely omits better-auth tables (Account, Session) and organization tables (Member, Invitation). The fix is additive: extend `ExportData` interface with new fields, add Prisma queries, and add new JSON files to the ZIP archive.

For erasure (CLN-03), the Prisma schema already has `onDelete: Cascade` on both `Member.user` and `Invitation.inviter`, so `prisma.user.delete()` in `AccountDeletionService.hardDeleteUser()` already cascades into these tables. The gap is orphaned organizations: when the last/sole member is deleted, the org (Tenant) remains in the database with zero members. The fix requires a post-deletion cleanup step to detect and handle orphaned orgs.

**Primary recommendation:** Two tasks -- (1) extend data export with org/auth tables, (2) add orphaned org cleanup after user hard-delete. No new dependencies needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLN-02 | GDPR data export includes better-auth organization membership, invitation, and role tables | Extend `DataExportService.assembleUserData()` with Member, Invitation, Account queries; add to ZIP archive |
| CLN-03 | Right to erasure cascades into organization membership and cleans up orphaned org references | Cascade already works via Prisma `onDelete: Cascade`; need orphaned org cleanup after sole-member deletion |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @prisma/client | (existing) | Database queries for export + deletion | Already used by both services |
| archiver | (existing) | ZIP generation for data export | Already used by DataExportService |

### Supporting
No new libraries needed. All work is extending existing services with additional Prisma queries.

### Alternatives Considered
None. The services already exist; this is purely additive.

## Architecture Patterns

### Pattern 1: Extending Data Export (CLN-02)

**What:** Add organization-related and better-auth data to the existing `assembleUserData()` method.

**Missing data categories to add:**

| Category | Prisma Model | Query Filter | Sensitive Fields to Exclude |
|----------|-------------|-------------|---------------------------|
| Organization memberships | `Member` | `{ userId }` | None (id, org, role, createdAt are all safe) |
| Sent invitations | `Invitation` | `{ inviterId: userId }` | None |
| Auth accounts | `Account` | `{ userId }` | `password`, `accessToken`, `refreshToken`, `idToken` (credentials) |
| Active sessions | `Session` | `{ userId }` | `token` (session secret) |

**Implementation approach:**

```typescript
// In ExportData interface, add:
interface ExportData {
  // ... existing 8 fields ...
  organizationMemberships: Record<string, unknown>[];
  sentInvitations: Record<string, unknown>[];
  authAccounts: Record<string, unknown>[];
  activeSessions: Record<string, unknown>[];
}

// In assembleUserData(), add to Promise.all:
// Organization memberships
this.prisma.member.findMany({
  where: { userId },
  select: {
    role: true,
    createdAt: true,
    organization: { select: { id: true, name: true } },
  },
}),

// Sent invitations
this.prisma.invitation.findMany({
  where: { inviterId: userId },
  select: {
    email: true,
    role: true,
    status: true,
    expiresAt: true,
    createdAt: true,
    organization: { select: { id: true, name: true } },
  },
}),

// Auth accounts (EXCLUDE credentials)
this.prisma.account.findMany({
  where: { userId },
  select: {
    providerId: true,
    accountId: true,
    scope: true,
    createdAt: true,
    updatedAt: true,
    // EXCLUDE: password, accessToken, refreshToken, idToken
  },
}),

// Active sessions (EXCLUDE token)
this.prisma.session.findMany({
  where: { userId },
  select: {
    ipAddress: true,
    userAgent: true,
    activeOrganizationId: true,
    createdAt: true,
    updatedAt: true,
    expiresAt: true,
    // EXCLUDE: token
  },
}),
```

**ZIP archive additions:**
- `organization-memberships.json`
- `sent-invitations.json`
- `auth-accounts.json`
- `active-sessions.json`
- Update `metadata.json` categories list

### Pattern 2: Orphaned Org Cleanup (CLN-03)

**What:** After `prisma.user.delete()` cascades Member records, detect organizations with zero remaining members and clean them up.

**Current state:** `AccountDeletionService.hardDeleteUser()` does `prisma.user.delete({ where: { id: userId } })`. Prisma cascade handles:
- `Member` records: deleted (onDelete: Cascade on `user` relation)
- `Invitation` records: deleted (onDelete: Cascade on `inviter` relation)
- `Account` records: deleted (onDelete: Cascade)
- `Session` records: deleted (onDelete: Cascade)

**Gap:** Organizations (Tenant records acting as orgs) where the deleted user was the sole member become orphaned -- they exist with zero members.

**Implementation approach:**

```typescript
// After prisma.user.delete() in hardDeleteUser():
// 1. Find orgs where deleted user had memberships (query BEFORE delete)
// 2. After delete, check which orgs now have zero members
// 3. Delete orphaned orgs or flag them

// Option A: Query before delete, cleanup after
async hardDeleteUser(userId: string, tenantId: string): Promise<boolean> {
  // Get user's org memberships BEFORE deletion
  const userOrgs = await this.prisma.member.findMany({
    where: { userId },
    select: { organizationId: true },
  });

  // Delete user (cascades memberships)
  await this.prisma.user.delete({ where: { id: userId } });

  // Check for orphaned orgs
  if (userOrgs.length > 0) {
    const orgIds = userOrgs.map(m => m.organizationId);
    for (const orgId of orgIds) {
      const remainingMembers = await this.prisma.member.count({
        where: { organizationId: orgId },
      });
      if (remainingMembers === 0) {
        // Org is orphaned -- soft-delete or hard-delete
        await this.prisma.tenant.delete({ where: { id: orgId } });
      }
    }
  }
  return true;
}
```

**Design decision needed:** Should orphaned orgs be hard-deleted immediately or soft-deleted? Given this is a GDPR erasure context, hard-delete is appropriate (the user requested erasure, and an empty org has no other user's data).

**IMPORTANT:** The `Tenant` model is dual-purpose -- it serves as both workspace tenant AND organization. An org-Tenant has Members; a workspace-Tenant is the user's `tenantId`. The cleanup must NOT delete the user's workspace tenant (which is `user.tenantId`), only org-Tenants where the user was the sole member AND the org is different from `user.tenantId`.

### Anti-Patterns to Avoid
- **Querying org memberships AFTER user.delete():** The cascade already deleted Member records, so you cannot find which orgs the user belonged to. Must query BEFORE delete.
- **Excluding Account/Session from export:** GDPR Article 20 requires all personal data. Auth accounts (provider IDs, scopes) and session metadata (IPs, user agents) are personal data.
- **Including credentials in export:** Passwords, access tokens, refresh tokens, session tokens must NEVER appear in data export.
- **Deleting the user's workspace Tenant:** The user's `tenantId` references their workspace. Only delete org-Tenants where the user was sole member AND it differs from `user.tenantId`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cascade deletion of Member/Invitation | Manual deleteMany for each table | Prisma `onDelete: Cascade` | Already configured in schema, tested by Phase 56 |
| ZIP generation | Custom archive code | Existing `generateExportZip()` | Already handles multi-file ZIP with metadata |

## Common Pitfalls

### Pitfall 1: Querying memberships after cascade delete
**What goes wrong:** Trying to find orphaned orgs after `prisma.user.delete()` returns zero results because Member records are already cascaded.
**Why it happens:** Prisma `onDelete: Cascade` executes in the same transaction as the delete.
**How to avoid:** Query `prisma.member.findMany({ where: { userId } })` BEFORE calling `prisma.user.delete()`.
**Warning signs:** Orphaned orgs accumulate in the database with zero members.

### Pitfall 2: Leaking credentials in data export
**What goes wrong:** Account passwords, tokens, or session tokens appear in the export ZIP.
**Why it happens:** Using `findMany()` without explicit `select` returns all fields.
**How to avoid:** Always use Prisma `select` to whitelist safe fields. Never use `include` or omit `select`.
**Warning signs:** Plaintext tokens in exported JSON files.

### Pitfall 3: Deleting workspace tenant instead of org
**What goes wrong:** Deleting a Tenant that is the user's workspace (`user.tenantId`) cascades all emails, contacts, calendar data.
**Why it happens:** Tenant model is dual-purpose (workspace + organization).
**How to avoid:** Only delete org-Tenants where `orgId !== user.tenantId` AND member count is zero.
**Warning signs:** Entire tenant data disappears during erasure.

### Pitfall 4: ExportData interface not updated
**What goes wrong:** TypeScript compilation passes but new data categories are not typed.
**Why it happens:** Adding queries to `Promise.all` without updating the `ExportData` interface.
**How to avoid:** Update the interface FIRST, then add queries and ZIP entries.

## Code Examples

### Data Export Extension
```typescript
// Source: existing DataExportService pattern in data-export.service.ts

// 1. Extend ExportData interface
interface ExportData {
  profile: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  emails: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  aiHistory: Record<string, unknown>[];
  consentHistory: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  // NEW: better-auth + org tables
  organizationMemberships: Record<string, unknown>[];
  sentInvitations: Record<string, unknown>[];
  authAccounts: Record<string, unknown>[];
  activeSessions: Record<string, unknown>[];
}

// 2. Add to Promise.all in assembleUserData()
// 3. Add archive.append() calls in generateExportZip()
// 4. Update metadata.json categories array
```

### Orphaned Org Cleanup
```typescript
// Source: existing AccountDeletionService.hardDeleteUser() pattern

async cleanupOrphanedOrgs(orgIds: string[], excludeTenantId: string | null): Promise<number> {
  let cleaned = 0;
  for (const orgId of orgIds) {
    // Skip user's own workspace tenant
    if (orgId === excludeTenantId) continue;

    const remaining = await this.prisma.member.count({
      where: { organizationId: orgId },
    });

    if (remaining === 0) {
      this.logger.warn(`Deleting orphaned organization ${orgId} (zero members after erasure)`);
      await this.prisma.tenant.delete({ where: { id: orgId } });
      cleaned++;
    }
  }
  return cleaned;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Export only core tables (profile, emails, contacts) | Must include auth + org tables | Phase 61 | GDPR Article 20 completeness |
| User.delete cascades all data | Must also handle orphaned orgs | Phase 61 | Clean database after erasure |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + ts-jest 29.4.6 |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npx jest --testPathPattern="compliance" --forceExit` |
| Full suite command | `cd backend && npx jest --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLN-02 | Data export includes org memberships, invitations, accounts, sessions | unit | `cd backend && npx jest --testPathPattern="data-export" --forceExit` | No -- Wave 0 |
| CLN-03 | User deletion cascades memberships + cleans orphaned orgs | unit | `cd backend && npx jest --testPathPattern="account-deletion" --forceExit` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npm run type-check`
- **Per wave merge:** `cd backend && npx jest --testPathPattern="compliance" --forceExit`
- **Phase gate:** Full suite green + type-check clean

### Wave 0 Gaps
- [ ] `backend/src/modules/compliance/__tests__/data-export.service.spec.ts` -- covers CLN-02
- [ ] `backend/src/modules/compliance/__tests__/account-deletion.service.spec.ts` -- covers CLN-03
- [ ] No new framework install needed

## Open Questions

1. **Orphaned org deletion vs soft-delete**
   - What we know: GDPR erasure is a hard-delete context; empty orgs have no user data
   - What's unclear: Whether org metadata (name, slug) should be preserved for any reason
   - Recommendation: Hard-delete orphaned orgs. They contain no personal data of other users (since member count is zero), and keeping them creates data bloat.

2. **User's own workspace tenant**
   - What we know: `user.tenantId` references their workspace Tenant. The user may also be a Member of that same Tenant (if it was set up as an organization via Phase 56).
   - What's unclear: Whether `user.tenantId` org should also be cleaned up on erasure
   - Recommendation: The workspace Tenant IS the user's data scope -- all emails, contacts, etc. belong to it. When `user.delete()` cascades, the Tenant itself is NOT deleted (User has `onDelete: Cascade` FROM Tenant TO User, not the reverse). The workspace Tenant will become an orphan with no users pointing to it. Include workspace Tenant cleanup as part of orphan cleanup (check for Tenants with zero Users after erasure).

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/compliance/services/data-export.service.ts` -- verified current export omits org/auth tables
- `backend/src/modules/compliance/services/account-deletion.service.ts` -- verified hardDeleteUser relies on cascade
- `backend/prisma/schema.prisma` -- verified Member/Invitation have `onDelete: Cascade` on user FK; Tenant-User relation is `onDelete: Cascade` (User deleted when Tenant deleted, NOT vice versa)
- `backend/src/modules/compliance/services/gdpr.service.ts` -- verified purgeExternalTenantData exists for external cleanup

### Secondary (MEDIUM confidence)
- Orphaned org detection pattern -- based on schema analysis, needs runtime validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, purely extending existing services
- Architecture: HIGH -- additive changes to well-understood services (DataExportService, AccountDeletionService)
- Pitfalls: HIGH -- verified via Prisma schema cascade analysis and ExportData interface review
- Orphaned org cleanup: MEDIUM -- logic is sound but edge cases (workspace tenant vs org tenant) need careful handling

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- no framework changes expected)
