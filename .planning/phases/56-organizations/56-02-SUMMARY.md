---
phase: 56-organizations
plan: 02
subsystem: frontend
tags: [organizations, mui, i18n, tanstack-query, admin-ui, org-switcher]

# Dependency graph
requires:
  - phase: 56-organizations
    plan: 01
    provides: organizationClient, Member/Invitation models, auth guard extension
provides:
  - org-admin-page: /dashboard/admin/organizations (super-admin only)
  - org-switcher: Header component for multi-org users
  - invitation-banner: PendingInvitationBanner in Layout
  - org-query-hooks: TanStack Query hooks for all org operations
affects:
  - frontend/components/layout/Header.tsx
  - frontend/components/layout/Layout.tsx

# Tech stack
tech-stack:
  added: []
  patterns: [tanstack-query-org-hooks, org-switcher-header, invitation-banner-layout]

# Key files
key-files:
  created:
    - frontend/hooks/queries/organization-keys.ts
    - frontend/hooks/queries/use-organizations.ts
    - frontend/pages/dashboard/admin/organizations.tsx
    - frontend/components/organizations/OrgAdminPage.tsx
    - frontend/components/organizations/InviteMemberDialog.tsx
    - frontend/components/organizations/OrgSwitcher.tsx
    - frontend/components/organizations/PendingInvitationBanner.tsx
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/hooks/queries/index.ts
    - frontend/lib/auth-client.ts
    - frontend/components/layout/Header.tsx
    - frontend/components/layout/Layout.tsx

# Decisions
key-decisions:
  - OrgSwitcher placed in Header left side (after mobile menu, before spacer) for global context visibility
  - MUI Table for org list and member display (consistent with admin data patterns)
  - Expandable table rows for member management (click org row to see members)
  - Full cache invalidation on org switch (all TanStack queries invalidated)
  - Auto-generated slug from org name in create dialog
  - No role column in member table (flat model per ORG-03)
  - Used as-any casts for better-auth organization client methods (type inference limitation)

# Metrics
metrics:
  duration: 14min
  completed: "2026-03-10"
---

# Phase 56 Plan 02: Organization Management UI Summary

Organization admin page with create/delete/invite dialogs, org switcher for multi-org users, and pending invitation banner -- all MUI, all i18n.

## Tasks Completed

### Task 1: Translations + Query Hooks
- Added 28 organization translation keys to en.ts, it.ts, and index.ts types
- Created `organization-keys.ts` query key factory (6 key patterns)
- Created `use-organizations.ts` with 10 TanStack Query hooks (3 queries, 7 mutations)
- Added `organizationClient()` plugin to frontend auth-client.ts
- Exported from queries/index.ts
- **Commit:** `77326361`

### Task 2: Org Admin Page + Invite Dialog
- Created `/dashboard/admin/organizations` page with super-admin gate
- Created `OrgAdminPage` with org list table, create dialog (name + auto-slug), delete confirmation (type org name)
- Created `InviteMemberDialog` with email input and success/error feedback
- Member table shows email and joined date only (no role column -- ORG-03 flat model)
- Expandable rows for per-org member management
- **Commit:** `f5c95e98` (included with other changes by concurrent session)

### Task 3: Org Switcher + Invitation Banner + Layout Integration
- Created `OrgSwitcher`: MUI Button + Menu, renders only for 2+ org users, switches active org
- Created `PendingInvitationBanner`: MUI Alert with Accept/Decline for each pending invitation
- Integrated OrgSwitcher in Header (left of spacer)
- Integrated PendingInvitationBanner in Layout (below header, above content)
- **Commit:** `8320c9b9`

### Task 4: Verify Organization Management End-to-End
- Auto-approved (auto_advance mode)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 prerequisite partially missing**
- **Found during:** Task 1 (startup)
- **Issue:** `organizationClient()` was not added to frontend auth-client.ts (Plan 01 had been partially executed by another session)
- **Fix:** Added `organizationClient()` import and plugin registration to auth-client.ts
- **Files modified:** `frontend/lib/auth-client.ts`

**2. [Rule 1 - Bug] TypeScript type inference for organization client methods**
- **Found during:** Task 1 verification
- **Issue:** `authClient.organization.listOrganizations()` not recognized by TypeScript (better-auth's React client exposes it as an atom, not a direct method)
- **Fix:** Used `(authClient.organization as any)` cast for query methods; cast role to `'admin' | 'member' | 'owner'` union
- **Files modified:** `frontend/hooks/queries/use-organizations.ts`

**3. [Rule 1 - Bug] Unused import in organizations page**
- **Found during:** Task 2 verification
- **Issue:** `useRouter` imported but never used (TypeScript error TS6133)
- **Fix:** Removed unused import
- **Files modified:** `frontend/pages/dashboard/admin/organizations.tsx`

## Requirements Satisfied

- **ORG-02:** Super-admin can invite members by email to an organization
- **ORG-03:** Flat role model enforced -- no role column in member table, all members are admin
- **ORG-04:** User can switch between organizations via OrgSwitcher (visible only for multi-org users)

## Self-Check: PASSED

All files verified to exist and commits confirmed.
