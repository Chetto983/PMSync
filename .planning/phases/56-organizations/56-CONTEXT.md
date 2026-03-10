# Phase 56: Organizations - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and manage organizations with role-based membership. **Scoped down:** Only super-admins can create orgs and invite members. Regular users stay in their auto-provisioned single-tenant workspace. Inside an org, all users are equal (admin). The better-auth `organization()` plugin is mapped to the existing `Tenant` table.

Requirements: ORG-01, ORG-02, ORG-03, ORG-04, ORG-05

**Requirement reinterpretation (user decision):**
- ORG-01: ~~User~~ → Super-admin can create an organization
- ORG-02: ~~Organization owner~~ → Super-admin can invite members by email
- ORG-03: Simplified — no owner/admin/member hierarchy; all org members are admin; super-admin is system-level
- ORG-04: User can switch between organizations (only if super-admin added them to multiple orgs)
- ORG-05: API endpoints enforce organization-level permissions (unchanged)

</domain>

<decisions>
## Implementation Decisions

### Role Model (Flat + Super-Admin)
- Inside an org: everyone is admin (flat, no owner/admin/member hierarchy)
- Super-admin is a system-level role (user.role = 'super-admin'), NOT per-org
- Super-admin is set directly in the database — no UI to promote, no env var seed
- Super-admin can manage orgs (create, delete, invite) but sees only their own active org's data — no cross-tenant data view
- better-auth org plugin's built-in role system mapped to single "admin" role for simplicity

### Organization Creation (Super-Admin Only)
- Only super-admin can create organizations
- Regular users get their auto-provisioned workspace on signup (existing behavior, unchanged)
- No self-service org creation for regular users
- Org management lives on a dedicated `/dashboard/admin/organizations` page (super-admin only)

### Organization Deletion
- Super-admin can hard-delete an organization (permanent, all data removed)
- Members of deleted org are moved back to their personal workspace
- Confirmation dialog with org name typed to confirm (destructive action)

### Member Management
- Claude's discretion on layout (table vs cards) — pick based on existing MUI patterns
- Actions: add member (invite dialog), remove member
- No role column needed (everyone is admin)
- Members shown: name, email, joined date, status

### Invitation Experience
- Super-admin invites by email from the org admin page
- If invitee doesn't have a PMSync account: invitation email contains a signup link; after signup + onboarding, they auto-join the org
- If invitee already has an account: invitation email + in-app banner notification in the dashboard ("You've been invited to [Org] — Accept / Decline")
- Banner visible until acted on (accept or decline)
- better-auth `organization.inviteMember()` + `sendInvitationEmail` hook wired to existing EmailService

### Org Switcher UX
- Only visible if user belongs to 2+ orgs (most users will never see it)
- Claude's discretion on placement (header dropdown vs sidebar top) — pick based on existing layout
- On switch: Claude's discretion on cache strategy (full refresh vs per-org cache)

### Claude's Discretion
- Member management layout (table vs cards)
- Org switcher placement (header vs sidebar)
- Cache invalidation strategy on org switch (full refresh vs per-org)
- Invitation accept behavior (switch to new org immediately vs stay in current)
- In-app banner design for pending invitations
- Org admin page layout and navigation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/common/auth/better-auth.instance.ts`: Auth instance with plugins array — add `organization()` plugin here
- `backend/src/common/auth/tenant.guard.ts`: TenantGuard reads `user.tenantId` — extend to read `session.activeOrganizationId`
- `backend/src/common/auth/roles.guard.ts`: RolesGuard reads `user.role` — already works for super-admin check
- `frontend/lib/auth-client.ts`: Auth client with plugins — add `organizationClient()` here
- `provisionWorkspaceForUser()` in better-auth.instance.ts: Creates Tenant on signup — will need to also create Member record
- Existing EmailService for sending invitation emails

### Established Patterns
- Guard chain: Throttler → BetterAuth → Legal → Consent → Tenant → Roles
- `withoutTenantScopingAsync()` for cross-tenant queries in guards
- TanStack Query with queryOptions pattern for data fetching
- MUI components for all UI (Radix/shadcn fully removed)
- i18n via `locales/en.ts` and `locales/it.ts` with useTranslations hook
- `prisma db push` for schema changes (not migrate dev — drift decision from Phase 55)

### Integration Points
- `better-auth.instance.ts` plugins array: Add `organization()` with schema mapping to Tenant
- `better-auth.instance.ts` databaseHooks.user.create.after: Update provisioning to create Member record alongside Tenant
- Session model: Add `activeOrganizationId` column
- Prisma schema: Add `Member` and `Invitation` models (mapped to `member` and `invitation` tables)
- Frontend auth-client.ts: Add `organizationClient()` plugin
- Frontend routing: Add `/dashboard/admin/organizations` page (super-admin gated)

</code_context>

<specifics>
## Specific Ideas

- Current model is 1 user = 1 tenant with admin role. This phase adds the infrastructure for multi-org but keeps the default experience unchanged for regular users.
- Super-admin is a manual database assignment — intentionally simple, no UI escalation path.
- The org admin page is a precursor to the full admin panel (Phase 57). Keep it standalone so Phase 57 can integrate it.
- Existing `user.role` field continues to work: 'admin' for regular users in their org, 'super-admin' for system admins.

</specifics>

<deferred>
## Deferred Ideas

- Full admin panel with user management — Phase 57 (ADM-01 through ADM-04)
- GDPR data export/erasure for org data — Phase 61 (CLN-02, CLN-03)
- Self-service org creation for regular users — future milestone if needed
- Per-org role hierarchy (owner/admin/member) — future milestone if business need arises
- Org settings (name, logo, billing) — future milestone

</deferred>

---

*Phase: 56-organizations*
*Context gathered: 2026-03-10*
