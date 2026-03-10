# Phase 57: Admin Panel - Research

**Researched:** 2026-03-10
**Domain:** better-auth admin plugin + MUI admin UI
**Confidence:** HIGH

## Summary

Phase 57 implements an admin panel for user management, banning, impersonation, and session revocation. The entire backend is handled by better-auth's built-in `admin` plugin, which provides REST endpoints for all four requirements (ADM-01 through ADM-04) out of the box. No custom NestJS controllers are needed -- the admin plugin routes flow through the existing auth proxy.

The implementation requires: (1) adding the `admin` server plugin to `better-auth.instance.ts`, (2) adding `adminClient` to the frontend auth client, (3) adding three new columns to the User model and one to Session, (4) building MUI-based admin pages under `/dashboard/admin/`.

**Primary recommendation:** Use better-auth's `admin` plugin exclusively. Do NOT hand-roll any user management API -- the plugin provides listUsers, banUser, unbanUser, impersonateUser, stopImpersonating, revokeUserSessions, and listUserSessions with built-in permission checks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADM-01 | Admin can list and search all users | `admin` plugin provides `listUsers` with filtering (eq, contains, starts_with, ends_with), pagination (offset/limit), and returns total count. Supports searching by any user field. |
| ADM-02 | Admin can ban/unban users with reason and expiry | `admin` plugin provides `banUser({ userId, banReason, banExpiresIn })` and `unbanUser({ userId })`. Adds `banned`, `banReason`, `banExpires` fields to User. Banning auto-revokes all sessions. |
| ADM-03 | Admin can impersonate users for support | `admin` plugin provides `impersonateUser({ userId })` and `stopImpersonating()`. Adds `impersonatedBy` to Session for audit trail. Default 1-hour duration configurable. |
| ADM-04 | Admin can revoke user sessions | `admin` plugin provides `revokeUserSessions({ userId })` and `revokeUserSession({ sessionToken })`. Also `listUserSessions({ userId })` to display active sessions. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | 1.5.4 | Admin plugin (server + client) | Already installed; admin plugin is built-in, not a separate package |
| @mui/material | (installed) | Admin UI components (DataGrid, Dialog) | Project standard per CLAUDE.md |
| @mui/x-data-grid | (installed or add) | User list table with sorting/filtering | MUI ecosystem standard for data tables |
| @tanstack/react-query | (installed) | Data fetching for admin queries | Project standard per CLAUDE.md |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mui/icons-material | (installed) | Admin panel icons | Icons for ban, impersonate, session actions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-auth admin plugin | Custom NestJS CRUD | Vastly more code, must handle permissions manually, no impersonation audit trail. No reason to hand-roll. |
| MUI DataGrid | MUI Table | DataGrid gives sorting, filtering, pagination for free. Table requires manual implementation. |

## Architecture Patterns

### Recommended Project Structure
```
backend/
  src/common/auth/
    better-auth.instance.ts   # ADD admin() plugin here
    audit-hooks.ts            # ADD admin event types (ban, impersonate)
  prisma/
    schema.prisma             # ADD banned, banReason, banExpires to User; impersonatedBy to Session

frontend/
  lib/
    auth-client.ts            # ADD adminClient() plugin
  pages/dashboard/admin/
    organizations.tsx         # EXISTING
    users.tsx                 # NEW - user list + management
  components/admin/
    UserListTable.tsx          # NEW - DataGrid with search/filter
    BanUserDialog.tsx          # NEW - ban reason + expiry form
    UserSessionsDialog.tsx     # NEW - list + revoke sessions
    ImpersonationBanner.tsx    # NEW - shown when impersonating
  hooks/queries/
    use-admin.ts              # NEW - TanStack Query wrappers for admin endpoints
```

### Pattern 1: Admin Plugin Wiring (Server)
**What:** Add the `admin` plugin to the existing better-auth instance
**When to use:** Server-side setup
**Example:**
```typescript
// Source: https://better-auth.com/docs/plugins/admin
import { admin } from 'better-auth/plugins';

// In createBetterAuthInstance(), add to plugins array:
plugins: [
  twoFactor({ ... }),
  passkey({ ... }),
  organization({ ... }),
  admin({
    defaultRole: 'member',           // Match existing user.role default
    adminRoles: ['super-admin'],     // Only super-admin gets admin panel access
    impersonationSessionDuration: 60 * 60, // 1 hour
    defaultBanReason: 'Account suspended by administrator',
  }),
]
```

### Pattern 2: Admin Plugin Wiring (Client)
**What:** Add `adminClient` to the frontend auth client
**When to use:** Client-side setup
**Example:**
```typescript
// Source: https://better-auth.com/docs/plugins/admin
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ ... }),
    twoFactorClient({ ... }),
    passkeyClient(),
    organizationClient(),
    adminClient(),   // NEW
  ],
});
```

### Pattern 3: TanStack Query Wrappers
**What:** Wrap admin client methods in TanStack Query hooks
**When to use:** All admin data fetching in components
**Example:**
```typescript
// hooks/queries/use-admin.ts
import { authClient } from '@/lib/auth-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const adminKeys = {
  users: (params?: object) => ['admin', 'users', params] as const,
  userSessions: (userId: string) => ['admin', 'sessions', userId] as const,
};

export function useAdminUsers(params: { limit?: number; offset?: number; searchField?: string; searchValue?: string }) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: async () => {
      const res = await authClient.admin.listUsers({
        query: {
          limit: params.limit ?? 25,
          offset: params.offset ?? 0,
          ...(params.searchField && params.searchValue
            ? { searchField: params.searchField, searchOperator: 'contains', searchValue: params.searchValue }
            : {}),
        },
      });
      return res.data;
    },
    staleTime: 30_000,
  });
}
```

### Pattern 4: Impersonation Banner
**What:** Persistent banner when admin is impersonating a user
**When to use:** Global layout, visible on all pages during impersonation
**Example:**
```typescript
// Detect impersonation via session metadata
// better-auth sets impersonatedBy on the session
// Client can check this to show/hide the banner
```

### Anti-Patterns to Avoid
- **Custom NestJS admin endpoints:** The admin plugin handles everything through the auth proxy. Do NOT create /api/admin/* routes in NestJS.
- **Direct Prisma queries for user listing:** Use the admin plugin's listUsers, which respects permissions and provides pagination.
- **Storing ban state in a separate table:** The admin plugin adds columns to the User model directly.
- **Manual role checks in admin components:** The plugin's permission system handles authorization. Frontend just needs to check user.role === 'super-admin' for UI visibility.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User listing with search | Custom NestJS controller + Prisma queries | `authClient.admin.listUsers()` | Plugin handles pagination, filtering, search with proper permission checks |
| User banning | Custom ban table/fields + session cleanup | `authClient.admin.banUser()` | Plugin auto-revokes sessions, manages ban expiry, blocks sign-in |
| Impersonation | Custom session creation + tracking | `authClient.admin.impersonateUser()` | Plugin creates audited session with `impersonatedBy`, handles duration, cleanup |
| Session revocation | Custom session deletion logic | `authClient.admin.revokeUserSessions()` | Plugin handles all session cleanup correctly |
| Permission checks | Manual role checks in NestJS | Plugin built-in `adminRoles` config | Plugin validates admin role on every admin endpoint automatically |

**Key insight:** The better-auth admin plugin provides the exact four capabilities needed (list, ban, impersonate, revoke sessions) with built-in security. Any custom implementation would be worse, slower to build, and miss edge cases like ban expiry handling and impersonation audit trails.

## Common Pitfalls

### Pitfall 1: Schema Columns Must Exist Before Plugin Activation
**What goes wrong:** Adding the admin plugin without migrating the database causes runtime errors.
**Why it happens:** The plugin expects `banned`, `banReason`, `banExpires` on User and `impersonatedBy` on Session.
**How to avoid:** Run `prisma db push` (project uses push, not migrate) BEFORE wiring the plugin.
**Warning signs:** "Column does not exist" errors on any admin endpoint call.

### Pitfall 2: Role Mismatch Between Plugin Default and Project
**What goes wrong:** Plugin defaults to `admin` role for admin access, but project uses `super-admin`.
**Why it happens:** Plugin's `adminRoles` defaults to `['admin']`, but PMSync's admin role is `super-admin`. Every regular user gets `admin` via workspace provisioning (Phase 56 flat role model).
**How to avoid:** Set `adminRoles: ['super-admin']` explicitly. This is CRITICAL -- without it, every workspace owner has admin panel access.
**Warning signs:** Regular users can access admin endpoints.

### Pitfall 3: Banned Field Conflicts with isActive
**What goes wrong:** Confusion between `isActive` (existing) and `banned` (new from plugin).
**Why it happens:** Project already has `isActive` on User, which was previously used as a soft-disable.
**How to avoid:** Keep both. `banned` is managed by the admin plugin for sign-in blocking. `isActive` is a legacy field. Document the distinction.
**Warning signs:** Users who should be banned can still sign in.

### Pitfall 4: Cookie Cache Hides Ban Status
**What goes wrong:** A banned user continues to use the app because their cookie cache hasn't expired.
**Why it happens:** Phase 55 enabled `cookieCache` with 300s maxAge. If a user is banned, their cached session may remain valid for up to 5 minutes.
**How to avoid:** The admin plugin's `banUser` already revokes all sessions. The cookie cache only matters if a banned user keeps an old tab open. Not a real issue -- session is gone server-side.
**Warning signs:** Banned user appears active for a few minutes after ban.

### Pitfall 5: Impersonation Without Visual Indicator
**What goes wrong:** Admin forgets they are impersonating and takes destructive actions.
**Why it happens:** No UI indicator that the current session is impersonated.
**How to avoid:** Add an `ImpersonationBanner` in the Layout that checks `session.impersonatedBy` and shows a persistent warning + "Stop Impersonating" button.
**Warning signs:** Admin modifies user data without realizing they are in impersonation mode.

### Pitfall 6: Admin Plugin Role vs Organization Role
**What goes wrong:** Confusion between the admin plugin's `role` field on User and the `Member.role` in the organization plugin.
**Why it happens:** Both use a `role` field, but they serve different purposes.
**How to avoid:** The admin plugin uses `user.role` (the top-level role: member/admin/super-admin). Organization uses `member.role` (org-level: admin). Keep them separate. The admin panel operates on `user.role`.
**Warning signs:** Promoting a user to "admin" in the admin panel makes them an org admin, not a super-admin.

## Code Examples

### Schema Migration (Prisma)
```prisma
// Add to User model:
banned          Boolean   @default(false)
banReason       String?
banExpires      DateTime?

// Add to Session model:
impersonatedBy  String?
```

### Admin Plugin Server Configuration
```typescript
// Source: https://better-auth.com/docs/plugins/admin
import { admin } from 'better-auth/plugins';

admin({
  defaultRole: 'member',
  adminRoles: ['super-admin'],
  impersonationSessionDuration: 60 * 60,
  defaultBanReason: 'Account suspended by administrator',
})
```

### Ban User with Expiry
```typescript
// Source: https://better-auth.com/docs/plugins/admin
await authClient.admin.banUser({
  userId: targetUserId,
  banReason: 'Policy violation',
  banExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
});
```

### List Users with Search
```typescript
// Source: https://better-auth.com/docs/plugins/admin
const { data } = await authClient.admin.listUsers({
  query: {
    limit: 25,
    offset: 0,
    searchField: 'email',
    searchOperator: 'contains',
    searchValue: 'example.com',
  },
});
// data.users: User[], data.total: number
```

### Impersonate User
```typescript
// Source: https://better-auth.com/docs/plugins/admin
await authClient.admin.impersonateUser({
  userId: targetUserId,
});
// Admin's session is replaced with target user's session
// impersonatedBy is set on the new session

// To stop:
await authClient.admin.stopImpersonating();
```

### Revoke All Sessions
```typescript
// Source: https://better-auth.com/docs/plugins/admin
await authClient.admin.revokeUserSessions({
  userId: targetUserId,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom admin CRUD in NestJS | better-auth admin plugin | better-auth 1.x | Zero backend code needed |
| Manual session tracking | Plugin-managed impersonation | better-auth 1.x | Audit trail built-in |
| Separate ban table | User model columns via plugin | better-auth 1.x | Single source of truth |

**Deprecated/outdated:**
- `allowImpersonatingAdmins` option is deprecated -- use `impersonate-admins` permission instead

## Open Questions

1. **MUI X DataGrid licensing**
   - What we know: MUI X DataGrid has MIT and commercial versions. Basic DataGrid is MIT.
   - What's unclear: Whether the project already has @mui/x-data-grid installed.
   - Recommendation: Check if installed; if not, use the MIT `@mui/x-data-grid` (free tier covers sorting, filtering, pagination).

2. **Impersonation detection on client**
   - What we know: Plugin adds `impersonatedBy` to Session model.
   - What's unclear: Whether `useSession()` returns `impersonatedBy` in the session object automatically.
   - Recommendation: Test during implementation. If not in session, query it separately or add to additionalFields on session.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.ts` (existing, uses `ts-jest` preset) |
| Quick run command | `cd backend && npx jest --testPathPattern admin --forceExit` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADM-01 | Admin can list users with search/filter | unit | `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts -t "listUsers" --forceExit` | No - Wave 0 |
| ADM-02 | Admin can ban/unban user, banned user blocked | unit | `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts -t "ban" --forceExit` | No - Wave 0 |
| ADM-03 | Admin can impersonate user with audit trail | unit | `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts -t "impersonate" --forceExit` | No - Wave 0 |
| ADM-04 | Admin can revoke user sessions | unit | `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts -t "revoke" --forceExit` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest src/common/auth/__tests__/admin-plugin.spec.ts --forceExit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/common/auth/__tests__/admin-plugin.spec.ts` -- covers ADM-01 through ADM-04 (admin plugin config, role restrictions)
- [ ] Frontend: type-check + lint validation (`cd frontend && npm run type-check && npm run lint`)

## Sources

### Primary (HIGH confidence)
- [better-auth admin plugin docs](https://better-auth.com/docs/plugins/admin) - Full API reference for admin plugin endpoints, schema, configuration
- Project codebase: `backend/src/common/auth/better-auth.instance.ts` - Current plugin setup
- Project codebase: `frontend/lib/auth-client.ts` - Current client plugin setup
- Project codebase: `backend/prisma/schema.prisma` - Current User/Session models

### Secondary (MEDIUM confidence)
- [better-auth DeepWiki](https://deepwiki.com/better-auth/better-auth/5.4-admin-and-access-control) - Admin plugin architecture overview
- [better-auth GitHub issues](https://github.com/better-auth/better-auth/issues/6448) - Impersonation restrictions discussion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - better-auth admin plugin is the official solution, already on v1.5.4
- Architecture: HIGH - plugin handles backend; frontend follows established MUI + TanStack Query patterns
- Pitfalls: HIGH - role mismatch (Pitfall 2) is the most critical risk, well understood

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- better-auth admin plugin is mature)
