# Phase 56: Organizations - Research

**Researched:** 2026-03-10
**Domain:** better-auth organization plugin + NestJS multi-tenancy
**Confidence:** HIGH

## Summary

Phase 56 adds multi-tenant organizations to PMSync using better-auth's built-in `organization` plugin. The project already has a `Tenant` model with full tenant-scoped Prisma middleware, so the critical architectural decision is how to map better-auth's `Organization` concept onto the existing `Tenant` infrastructure.

better-auth v1.5+ ships an `organization()` plugin that creates `organization`, `member`, and `invitation` tables, extends `session` with `activeOrganizationId`, and provides complete CRUD + invitation + role management APIs. The plugin supports custom schema mapping, so we can map its `organization` table to the existing `tenants` table using the `schema` option.

**Primary recommendation:** Use better-auth's `organization()` plugin with schema customization to map onto the existing `Tenant` model. Add `organizationClient()` to the frontend auth client. Create a thin NestJS controller for org management that delegates to better-auth's server API. Extend the existing `TenantGuard` to read `activeOrganizationId` from the session.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORG-01 | User can create an organization | better-auth `organization.create()` API; server hooks for workspace provisioning |
| ORG-02 | Organization owner can invite members by email | `organization.inviteMember()` + `sendInvitationEmail` config option |
| ORG-03 | Organization owner/admin can assign roles (owner/admin/member) | `organization.updateMemberRole()` + built-in role enforcement |
| ORG-04 | User can switch between organizations | `organization.setActive()` stores `activeOrganizationId` on session |
| ORG-05 | Organization permissions enforced on API endpoints | Extend `TenantGuard` to read `activeOrganizationId`; `RolesGuard` already works |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | ^1.5.4 | Organization plugin (server) | Already installed; org plugin is built-in, no extra package |
| better-auth/client | ^1.5.4 | Organization client plugin (frontend) | Provides `organizationClient()` with hooks like `useActiveOrganization` |
| @prisma/client | existing | Schema for org/member/invitation tables | Already the ORM; org plugin uses Prisma adapter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | existing | API calls from frontend to NestJS org endpoints | Existing `apiClient` for org management CRUD |
| @tanstack/react-query | ^5.90 | Cache org list, members, invitations | Existing pattern for all data fetching |
| MUI | existing | Org switcher UI, member management, invitation dialogs | Existing UI framework |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-auth org plugin | Custom Prisma org/member tables | Would lose invitation flow, role enforcement, session activeOrg -- massive hand-rolling |
| Schema mapping to Tenant | New separate Organization table | Would require migrating all 42 FK chains from Tenant; not worth it |

**Installation:**
```bash
# No new packages needed -- organization plugin is part of better-auth
# Just import { organization } from "better-auth/plugins"
# and { organizationClient } from "better-auth/client/plugins"
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── common/auth/
│   ├── better-auth.instance.ts  # ADD organization() plugin
│   ├── better-auth.guard.ts     # EXTEND to read activeOrganizationId
│   ├── tenant.guard.ts          # MODIFY to use activeOrganizationId from session
│   └── roles.guard.ts           # NO CHANGES (already reads request.user.role)
├── modules/organizations/
│   ├── organizations.controller.ts   # NestJS controller for org CRUD
│   ├── organizations.service.ts      # Thin wrapper around better-auth API
│   ├── organizations.module.ts       # NestJS module
│   └── dto/
│       ├── create-organization.dto.ts
│       ├── invite-member.dto.ts
│       └── update-member-role.dto.ts

frontend/
├── lib/
│   └── auth-client.ts           # ADD organizationClient() plugin
├── hooks/queries/
│   ├── organization-keys.ts     # Query key factory
│   └── use-organizations.ts     # TanStack Query hooks
├── components/organizations/
│   ├── OrgSwitcher.tsx           # Dropdown in header for switching orgs
│   ├── OrgSettingsPage.tsx       # Members list, invite, role management
│   ├── InviteMemberDialog.tsx    # MUI dialog for inviting
│   └── PendingInvitations.tsx    # User's received invitations
├── locales/
│   ├── en.ts                    # ADD organizations.* keys
│   └── it.ts                    # ADD organizations.* keys
```

### Pattern 1: Organization Plugin with Schema Mapping to Existing Tenant
**What:** Map better-auth's `organization` table to the existing `tenants` table using the `schema` config option, avoiding a second org table and 42 FK migrations.
**When to use:** Always -- this is the only viable approach given the existing schema.
**Example:**
```typescript
// Source: https://better-auth.com/docs/plugins/organization
import { organization } from 'better-auth/plugins';

organization({
  schema: {
    organization: {
      modelName: 'Tenant',       // Maps to existing tenants table
      fields: {
        // Map better-auth fields to existing Tenant columns
        name: 'name',
        slug: 'slug',
        logo: 'description',     // Reuse description for logo URL or add a column
        // metadata and createdAt map automatically
      },
    },
  },
  creatorRole: 'owner',
  membershipLimit: 100,
  invitationExpiresIn: 48 * 60 * 60, // 48 hours
  sendInvitationEmail: async (data) => {
    // Use existing EmailService to send invitation
  },
  allowUserToCreateOrganization: async (user) => {
    return true; // All users can create orgs
  },
})
```

### Pattern 2: Active Organization via Session
**What:** better-auth stores `activeOrganizationId` on the session record. The guard reads this instead of the user's `tenantId` field.
**When to use:** For org switching -- no need to update user.tenantId on every switch.
**Example:**
```typescript
// Frontend: switch active org
await authClient.organization.setActive({ organizationId: 'org-123' });

// Backend guard reads activeOrganizationId from session
const session = await this.auth.api.getSession({ headers });
const activeOrgId = session.session.activeOrganizationId;
// Use activeOrgId as the tenant context
```

### Pattern 3: Member-Based Role per Organization
**What:** better-auth's `member` table stores role per org, not on the user. A user can be `owner` in org A and `member` in org B. The guard must read the member role for the active org, not `user.role`.
**When to use:** Always for org-level permissions.
**Example:**
```typescript
// In BetterAuthGuard, after getting session:
request.user = {
  id: user.id,
  userId: user.id,
  tenantId: session.activeOrganizationId,
  email: user.email,
  role: session.activeMemberRole, // From member table, not user table
  // ...
};
```

### Anti-Patterns to Avoid
- **Storing active org on the user record:** Use session.activeOrganizationId instead; modifying user.tenantId on every switch is a race condition with multiple tabs.
- **Creating a separate Organization model alongside Tenant:** Would require migrating 42 FK chains or maintaining two parallel concepts.
- **Hand-rolling invitation flow:** better-auth handles invitation create/accept/reject/expire with email hooks -- use it.
- **Putting org CRUD only on NestJS endpoints:** better-auth's `/api/auth/organization/*` routes handle CRUD with proper session validation. NestJS endpoints are for custom logic only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invitation flow | Custom invitation table + email + expiry + accept/reject | `organization.inviteMember()` + `sendInvitationEmail` hook | Token expiry, race conditions, email retry -- all handled |
| Role enforcement per org | Custom member-role lookup middleware | better-auth's built-in role check via `organization.hasPermission()` | Handles owner/admin/member hierarchy with permission matrix |
| Active org on session | Custom session extension or user field mutation | `organization.setActive()` | Writes `activeOrganizationId` to session row atomically |
| Org slug uniqueness | Custom slug generation + collision check | `organization.checkSlug()` + built-in unique constraint | Handles concurrent creation safely |
| Member listing with roles | Custom JOIN query | `organization.listMembers()` + `getFullOrganization()` | Includes role, joinedAt, pagination |

**Key insight:** The better-auth organization plugin handles 90% of the org lifecycle. The only custom code needed is: (1) schema mapping to Tenant, (2) extending NestJS guards to read activeOrganizationId, (3) frontend UI components, and (4) wiring the invitation email to the existing EmailService.

## Common Pitfalls

### Pitfall 1: Schema Mapping Mismatch with Existing Tenant Table
**What goes wrong:** The `npx auth generate` command may create a new `organization` table instead of mapping to `tenants`, or generate relations that conflict with existing FK chains.
**Why it happens:** Schema generation doesn't always respect `schema.organization.modelName` perfectly, especially with Prisma adapter.
**How to avoid:** Do NOT run `npx auth generate` for the org plugin. Manually add the `member` and `invitation` Prisma models, and manually add `activeOrganizationId` to the Session model. Use `prisma db push` (consistent with Phase 55 decision).
**Warning signs:** Duplicate table errors, missing relations, schema drift.

### Pitfall 2: User.role vs Member.role Confusion
**What goes wrong:** The existing `user.role` field (set to `'admin'` during workspace provisioning) conflicts with the per-org member role. Guards may read the wrong role.
**Why it happens:** The user.role field is a global concept; the member.role is per-organization.
**How to avoid:** After org plugin is active, `BetterAuthGuard` must map `request.user.role` from the member record for the active organization, not from the user table. The user.role field becomes a global/system role only (e.g., `super-admin`).
**Warning signs:** Admin in one org can perform admin actions in another org.

### Pitfall 3: Workspace Provisioning Hook Conflict
**What goes wrong:** The existing `databaseHooks.user.create.after` hook in `better-auth.instance.ts` provisions a Tenant on signup. With the org plugin, org creation should go through `organization.create()` instead.
**How to avoid:** Modify the provisioning hook to use `auth.api.organization.create()` instead of direct Prisma `tenant.create()`. This ensures the user gets a proper `member` record with `owner` role.
**Warning signs:** User creates a tenant but has no member record, so org plugin doesn't recognize them as a member.

### Pitfall 4: activeOrganizationId Not Set on Login
**What goes wrong:** User logs in but `session.activeOrganizationId` is null, so TenantGuard rejects all requests.
**Why it happens:** better-auth doesn't auto-set activeOrganizationId on login. It must be set explicitly.
**How to avoid:** Use a `databaseHooks.session.create.before` hook to auto-set the user's first/default org as active. Or handle it client-side immediately after login.
**Warning signs:** 400 "Tenant ID not found in request" after login.

### Pitfall 5: Cookie Cache and Active Org Staleness
**What goes wrong:** After `setActive()`, the cookie cache (5-minute TTL) still has the old activeOrganizationId, so NestJS reads stale data.
**Why it happens:** `cookieCache` is enabled with `maxAge: 300` in `better-auth.instance.ts`. The cached session doesn't reflect the activeOrganizationId change.
**How to avoid:** The `BetterAuthGuard` already uses `disableCookieCache: true` for session validation, which bypasses the cache. Verify this remains the case. Alternatively, `setActive()` may invalidate the cache automatically -- verify with testing.
**Warning signs:** Org switch appears to work on frontend but NestJS still uses old tenant.

### Pitfall 6: Frontend API Client Missing Tenant Header
**What goes wrong:** The existing `apiClient` (axios) does not send `x-tenant-id` header. The TenantGuard reads tenant from `user.tenantId` (from session) or `x-tenant-id` header.
**Why it happens:** Currently, the user always has exactly one tenant, so `user.tenantId` suffices. With multi-org, the active org comes from the session's `activeOrganizationId`.
**How to avoid:** After org plugin integration, `BetterAuthGuard` should set `request.user.tenantId` from `session.activeOrganizationId`. The TenantGuard already reads `user.tenantId` so no header change needed.
**Warning signs:** Cross-tenant data leaks when switching orgs.

## Code Examples

### 1. Adding Organization Plugin to Server Auth Instance
```typescript
// backend/src/common/auth/better-auth.instance.ts
import { organization } from 'better-auth/plugins';

// In the plugins array of createBetterAuthInstance:
plugins: [
  twoFactor({ /* existing */ }),
  passkey({ /* existing */ }),
  organization({
    creatorRole: 'owner',
    membershipLimit: 100,
    invitationExpiresIn: 48 * 60 * 60,
    sendInvitationEmail: async (data) => {
      await emailService.sendInvitationEmail(
        data.email,
        data.organization.name,
        `${process.env.FRONTEND_URL}/invitations/accept/${data.id}`,
      );
    },
    allowUserToCreateOrganization: async (_user) => true,
  }),
],
```

### 2. Adding Organization Client Plugin
```typescript
// frontend/lib/auth-client.ts
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // existing config...
  plugins: [
    inferAdditionalFields({ /* existing */ }),
    twoFactorClient({ /* existing */ }),
    passkeyClient(),
    organizationClient(),  // ADD THIS
  ],
});
```

### 3. Prisma Schema Additions
```prisma
// Add to schema.prisma

model Member {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           String   @default("member")
  createdAt      DateTime @default(now())

  organization   Tenant   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("member")
}

model Invitation {
  id             String   @id @default(cuid())
  organizationId String
  email          String
  role           String   @default("member")
  status         String   @default("pending")
  inviterId      String
  expiresAt      DateTime
  createdAt      DateTime @default(now())

  organization   Tenant   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  inviter        User     @relation(fields: [inviterId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([email])
  @@map("invitation")
}

// Extend Session model with:
model Session {
  // ... existing fields ...
  activeOrganizationId String?  // ADD THIS
}
```

### 4. BetterAuthGuard Extension for Active Org
```typescript
// In BetterAuthGuard.canActivate():
const result = await withoutTenantScopingAsync(() =>
  this.auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
    query: { disableCookieCache: true },
  }),
);

// Map request.user with activeOrganizationId as tenantId
request.user = {
  id: user.id,
  userId: user.id,
  tenantId: result.session.activeOrganizationId || user.tenantId,
  email: user.email,
  role: user.role ?? 'member', // Will need member role lookup
  sessionId: session.id,
};
```

### 5. Frontend Org Switcher Hook
```typescript
// frontend/hooks/queries/use-organizations.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';

export const orgKeys = {
  all: ['organizations'] as const,
  list: () => [...orgKeys.all, 'list'] as const,
  active: () => [...orgKeys.all, 'active'] as const,
  members: (orgId: string) => [...orgKeys.all, 'members', orgId] as const,
};

export function useOrganizations() {
  return useQuery({
    queryKey: orgKeys.list(),
    queryFn: () => authClient.organization.list(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveOrganization() {
  return authClient.useActiveOrganization();
}

export function useSetActiveOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) =>
      authClient.organization.setActive({ organizationId: orgId }),
    onSuccess: () => {
      queryClient.invalidateQueries(); // Refresh all queries for new org context
    },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single tenant per user (user.tenantId) | Multi-org via organization plugin (session.activeOrganizationId) | better-auth v1.2+ | Users can belong to multiple orgs |
| Global user.role | Per-org member.role | With organization plugin | Same user can be owner in org A, member in org B |
| Custom invitation tables | better-auth invitation model | Built-in | Handles expiry, acceptance, rejection, email hooks |

**Deprecated/outdated:**
- `organizationCreation` hooks config (use `organizationHooks` instead -- renamed in better-auth v1.3+)

## Open Questions

1. **Schema mapping `organization` -> `Tenant` exact compatibility**
   - What we know: better-auth supports `schema.organization.modelName` for custom table mapping
   - What's unclear: Whether all 42 FK relations on Tenant survive when better-auth writes to the same table. Need to verify that better-auth only touches its own columns (name, slug, logo, metadata) and doesn't conflict with PMSync's Tenant relations.
   - Recommendation: Test with `prisma db push` after adding the plugin. If conflicts arise, add a `logo` and `metadata` column to Tenant rather than fighting the mapping.

2. **Member role vs User.role migration**
   - What we know: Currently `user.role` is set to `'admin'` during workspace provisioning. After org plugin, the member table holds per-org roles.
   - What's unclear: Whether existing users need a migration to create member records. The org plugin expects member records to exist for role enforcement.
   - Recommendation: Write a data migration that creates a `member` record (role='owner') for each existing user-tenant pair.

3. **Auth proxy route coverage**
   - What we know: Frontend proxies `/api/auth/*` to the backend via `pages/api/auth/[...all].ts`. The org plugin adds routes like `/api/auth/organization/create`.
   - What's unclear: Whether the catch-all proxy handles all org plugin routes correctly.
   - Recommendation: Verify the catch-all route forwards all HTTP methods (GET, POST, DELETE) for org plugin endpoints.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPatterns=organizations --forceExit` |
| Full suite command | `cd backend && npm test -- --forceExit` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-01 | Create organization via better-auth API | integration | `cd backend && npx jest src/modules/organizations/__tests__/create-org.spec.ts -x` | Wave 0 |
| ORG-02 | Invite member, accept invitation | integration | `cd backend && npx jest src/modules/organizations/__tests__/invite-member.spec.ts -x` | Wave 0 |
| ORG-03 | Update member role (owner/admin only) | unit | `cd backend && npx jest src/modules/organizations/__tests__/update-role.spec.ts -x` | Wave 0 |
| ORG-04 | Set active org on session | unit | `cd backend && npx jest src/common/auth/__tests__/active-org.spec.ts -x` | Wave 0 |
| ORG-05 | Guard enforces org permissions | unit | `cd backend && npx jest src/common/auth/__tests__/org-permissions.spec.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPatterns=organizations --forceExit`
- **Per wave merge:** `cd backend && npm test -- --forceExit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/organizations/__tests__/create-org.spec.ts` -- covers ORG-01
- [ ] `backend/src/modules/organizations/__tests__/invite-member.spec.ts` -- covers ORG-02
- [ ] `backend/src/modules/organizations/__tests__/update-role.spec.ts` -- covers ORG-03
- [ ] `backend/src/common/auth/__tests__/active-org.spec.ts` -- covers ORG-04
- [ ] `backend/src/common/auth/__tests__/org-permissions.spec.ts` -- covers ORG-05

## Sources

### Primary (HIGH confidence)
- [better-auth official docs - organization plugin](https://better-auth.com/docs/plugins/organization) - Complete API reference, config options, schema
- Existing codebase: `backend/src/common/auth/better-auth.instance.ts` - Current auth setup, plugin registration pattern
- Existing codebase: `backend/src/common/auth/tenant.guard.ts` - Current tenant resolution logic
- Existing codebase: `backend/prisma/schema.prisma` - Current Tenant model with 42 FK chains
- Existing codebase: `frontend/lib/auth-client.ts` - Current auth client plugin registration

### Secondary (MEDIUM confidence)
- [GitHub issue #1414](https://github.com/better-auth/better-auth/issues/1414) - Schema mapping fix confirmed in PR #3021
- [DeepWiki - Members, Roles & Invitations](https://deepwiki.com/better-auth/better-auth/5.2-organization-plugin) - Member/invitation schema details
- [better-auth-ui Organizations](https://better-auth-ui.com/advanced/organizations) - Frontend integration patterns

### Tertiary (LOW confidence)
- Schema mapping exact column behavior with Prisma adapter -- needs validation via `prisma db push` testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - better-auth organization plugin is the obvious choice; already installed
- Architecture: HIGH - Schema mapping to Tenant is well-supported; guard extension pattern is clear from existing code
- Pitfalls: HIGH - Identified from codebase analysis (user.role vs member.role, provisioning hook conflict, cookie cache)
- Schema mapping details: MEDIUM - GitHub issue confirms fix but exact behavior with 42 FK chains needs testing

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- better-auth org plugin is mature)
