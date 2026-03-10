---
phase: 57-admin-panel
plan: 02
subsystem: ui
tags: [better-auth, admin, react, mui, tanstack-query, i18n]

requires:
  - phase: 57-01
    provides: "Backend admin plugin, admin roles, admin routes"
provides:
  - "Admin users page with search and pagination"
  - "Ban/unban user dialogs with reason and expiry"
  - "User session viewing and revocation"
  - "Impersonation with global banner"
  - "Admin TanStack Query hooks"
  - "English and Italian translations for admin UI"
affects: [admin-panel, user-management]

tech-stack:
  added: [adminClient plugin from better-auth/client/plugins]
  patterns: [admin query hooks via authClient.admin, impersonation banner in Layout]

key-files:
  created:
    - frontend/hooks/queries/admin-keys.ts
    - frontend/hooks/queries/use-admin.ts
    - frontend/components/admin/UserListTable.tsx
    - frontend/components/admin/BanUserDialog.tsx
    - frontend/components/admin/UserSessionsDialog.tsx
    - frontend/components/admin/ImpersonationBanner.tsx
    - frontend/pages/dashboard/admin/users.tsx
  modified:
    - frontend/lib/auth-client.ts
    - frontend/hooks/queries/index.ts
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/components/layout/Layout.tsx

key-decisions:
  - "as-any casts for authClient.admin methods since adminClient types not fully inferred across client/server boundary"
  - "MUI Table (not DataGrid) to avoid adding @mui/x-data-grid dependency"
  - "ImpersonationBanner checks session.impersonatedBy via any cast (better-auth types may not expose it)"

patterns-established:
  - "Admin hooks pattern: cast authClient.admin as any for admin operations"
  - "Impersonation detection: check session.session.impersonatedBy field"

requirements-completed: [ADM-01, ADM-02, ADM-03, ADM-04]

duration: 6min
completed: 2026-03-10
---

# Phase 57 Plan 02: Admin Panel Frontend Summary

**Admin user management UI with search/pagination table, ban/unban dialogs, session revocation, and global impersonation banner**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-10T10:50:10Z
- **Completed:** 2026-03-10T10:56:06Z
- **Tasks:** 2 (1 auto + 1 auto-approved checkpoint)
- **Files modified:** 13

## Accomplishments
- Admin users page at /dashboard/admin/users with super-admin role gate
- Paginated user table with email search, ban/unban, impersonate, and session actions
- Ban dialog with reason text and expiry duration in days
- Session dialog showing active sessions with revoke-all capability
- Global impersonation banner in Layout visible on all pages during impersonation
- Full i18n support (English + Italian) for all admin strings

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth client plugin + query hooks + translations + admin page + all components** - `b819de75` (feat)
2. **Task 2: Verify admin panel functionality** - auto-approved (checkpoint)

## Files Created/Modified
- `frontend/lib/auth-client.ts` - Added adminClient plugin, banned/banReason fields, admin re-export
- `frontend/hooks/queries/admin-keys.ts` - Query key factory for admin operations
- `frontend/hooks/queries/use-admin.ts` - 7 TanStack Query hooks for admin CRUD
- `frontend/hooks/queries/index.ts` - Re-export admin hooks
- `frontend/components/admin/UserListTable.tsx` - MUI Table with search, pagination, actions
- `frontend/components/admin/BanUserDialog.tsx` - Ban dialog with reason and expiry
- `frontend/components/admin/UserSessionsDialog.tsx` - Session list with revoke all
- `frontend/components/admin/ImpersonationBanner.tsx` - Global impersonation warning banner
- `frontend/pages/dashboard/admin/users.tsx` - Admin users page with role gate
- `frontend/locales/en.ts` - English admin translations
- `frontend/locales/it.ts` - Italian admin translations
- `frontend/locales/index.ts` - Admin type definitions in AppTranslations
- `frontend/components/layout/Layout.tsx` - ImpersonationBanner integration

## Decisions Made
- Used `as any` casts for `authClient.admin.*` methods because adminClient plugin types are not fully inferred across the client/server boundary (consistent with organizationClient pattern)
- Used MUI Table instead of DataGrid to avoid adding @mui/x-data-grid dependency
- Impersonation detection via `session.session.impersonatedBy` field with any cast

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unban button calling wrong handler**
- **Found during:** Task 1 (UserListTable implementation)
- **Issue:** Unban IconButton onClick was clearing banTarget instead of calling unbanUser mutation
- **Fix:** Added useUnbanUser hook import and wired onClick to unbanUser.mutate(user.id)
- **Files modified:** frontend/components/admin/UserListTable.tsx
- **Verification:** Type check passes, unban button correctly calls mutation
- **Committed in:** b819de75 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct unban functionality. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin panel frontend complete with all ADM-01 through ADM-04 capabilities
- Ready for additional admin features (audit logs, system settings) if planned

---
*Phase: 57-admin-panel*
*Completed: 2026-03-10*
