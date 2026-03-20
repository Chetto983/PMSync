# Phase 93: Admin, Subscriptions & Integrations - Research

**Researched:** 2026-03-20
**Domain:** Backend API verification + Frontend page verification (admin, subscription, compliance, providers, telegram, organizations)
**Confidence:** HIGH

## Summary

Phase 93 is a **verification and fix phase** -- not a greenfield build. All backend controllers, frontend pages, API modules, query hooks, and E2E tests already exist. The codebase has:

- **Labels API**: Full CRUD + email assignment + reorder (`/labels` controller, 9 endpoints)
- **Providers API**: Google/Microsoft OAuth + generic IMAP + auto-connect social + test endpoints + CRUD (`/providers` controller, ~20 endpoints)
- **Subscription API**: Get subscription/usage/limits/features/cost + cancel (`/subscription` controller, 8 endpoints)
- **Compliance API**: Consent CRUD + GDPR status + data export + data deletion + legal acceptance (5 controllers, ~12 endpoints)
- **Tenants API**: CRUD with super-admin guards (`/tenants` controller, 5 endpoints)
- **Telegram API**: Settings CRUD + link token + webhook (`/telegram` controllers, 6 endpoints)
- **Admin (better-auth)**: List users, ban/unban, impersonate, revoke sessions -- routed via `authClient.admin`
- **Organizations (better-auth)**: Create, delete, invite, remove, accept/reject, set active, list -- routed via `authClient.organization`
- **Frontend pages**: Settings (10 sections), Admin Users, Admin Organizations, Invitation Accept -- all with full components
- **E2E tests**: `admin.spec.ts` (user list, search, ban/unban, sessions, impersonate) and `organizations.spec.ts` (create, invite, accept, switch)
- **Contract tests**: labels, providers, subscription, admin, orgs -- all OpenAPI spec validation

The work is to **verify each endpoint returns correct responses** (backend) and **verify each page renders and functions** (frontend), fixing bugs found along the way.

**Primary recommendation:** Systematically exercise each backend API domain via curl/vitest and each frontend page via Playwright, fixing any discovered issues in-place. Do NOT build new features.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-08 | Label management API (list, create, update, delete, add/remove emails, reorder) | LabelsController has all 9 endpoints. Service tests exist. Contract test exists. |
| BAPI-09 | Provider management (list, connect Google/Microsoft/IMAP, test, delete, sync) | ProvidersController has ~20 endpoints. OAuth services, IMAP service, provider-config service all exist. |
| BAPI-10 | Subscription management (get status, usage, limits, features, cost-breakdown, cancel) | SubscriptionController has 8 endpoints. Service tests + contract test exist. |
| BAPI-11 | Compliance (consent, GDPR status, data export, data deletion, legal acceptance) | 5 controllers covering all endpoints. Service tests exist for consent, legal, data-export, account-deletion. |
| BAPI-17 | Admin user management (list, ban/unban, impersonate, revoke sessions) | Uses better-auth admin plugin. Frontend hooks exist. E2E test covers all operations. |
| BAPI-18 | Tenant management (list, create, update, delete) | TenantsController with 5 endpoints, super-admin/admin role guards. Service test exists. |
| BAPI-19 | Telegram integration (settings, link/unlink, webhook) | TelegramSettingsController (5 endpoints) + TelegramWebhookController. Bot service + webhook service tests exist. |
| FE-10 | Settings pages (general, security, email accounts, notifications, AI, billing) | Settings.tsx with 10 sections. All section components exist: GeneralSettings, SecuritySettings, AiSettings, AccountsSettings, SignatureSettings, ConsentSettings, DataExportPanel, AccountDeletionPanel, BillingPanel, TelegramSettingsPanel. |
| FE-11 | Admin pages (user list, ban/unban, impersonation, organization management) | UserListTable, BanUserDialog, UserSessionsDialog, ImpersonationBanner, OrgAdminPage, InviteMemberDialog -- all exist. |
| FE-19 | Organization flows (create, invite, switch, accept invitation) | OrgAdminPage + InviteMemberDialog + OrgSwitcher + PendingInvitationBanner + AcceptInvitationPage. All hooks exist. |
| FE-20 | Provider connection flows (Google OAuth, Microsoft OAuth, generic IMAP/SMTP) | AccountsSettings handles OAuth callback. ProvidersApi has all methods. Settings.tsx handles code+state query params for provider-link OAuth. |
</phase_requirements>

## Standard Stack

This phase does not introduce new libraries. All components use the existing stack:

### Core (Backend)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| NestJS 11 | Controllers, guards, decorators | Existing framework |
| Prisma | Database queries with tenantId filter | Existing ORM |
| better-auth | Admin + Organization plugin routes | Existing auth layer |
| class-validator | DTO validation | Existing validation |

### Core (Frontend)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| MUI | All UI components | Project standard |
| TanStack Query | Data fetching hooks | Project standard |
| better-auth/react | Admin/org client methods | Existing auth client |
| Playwright | E2E verification | Existing test runner |

## Architecture Patterns

### Backend Verification Pattern
All backend modules follow the same NestJS pattern:
```
Controller -> Service -> PrismaService
Guards: TenantGuard -> RolesGuard -> FeatureFlagGuard (labels only)
```

Key architectural facts:
- **Admin operations** go through `better-auth` admin plugin, NOT NestJS controllers. The `authClient.admin.listUsers()` calls go to `/api/auth/admin/list-users`.
- **Organization operations** go through `better-auth` organization plugin. The `authClient.organization.create()` calls go to `/api/auth/organization/create`.
- **Tenant isolation** is enforced via `req.user.tenantId` in every controller. TenantsController has explicit cross-tenant checks.
- **UsersController has NO admin endpoints** -- only self-service `/users/me/*` operations. Admin user management is entirely via better-auth.
- **Compliance controllers** use `@SkipLegalCheck()` decorator to remain accessible before legal acceptance.

### Frontend Settings Architecture
Settings is a single page with 10 sections selected by sidebar/dropdown:
```
pages/dashboard/settings.tsx
  -> components/dashboard/Settings.tsx (orchestrator)
     -> useSettingsState() (all state management)
     -> useSettingsCopy() (i18n)
     -> useSettingsHandlers() (save/delete/upload handlers)
     -> SettingsSidebar
     -> 10 section components (GeneralSettings, SecuritySettings, etc.)
```

OAuth callback flow in Settings:
1. User clicks "Connect Google" -> redirected to Google OAuth
2. Callback returns to `/dashboard/settings?code=X&state=Y&provider=google`
3. `Settings.tsx` useEffect detects `code` param, calls `providersApi.connectGoogle()`
4. On success, refetches providers list

### Frontend Admin Architecture
Admin pages are at `/dashboard/admin/users` and `/dashboard/admin/organizations`:
- Protected by client-side role check (`user.role !== 'super-admin'`)
- UserListTable uses `authClient.admin.*` methods (not REST API)
- OrgAdminPage uses `authClient.organization.*` methods

### E2E Test Architecture
Tests use Playwright with two auth contexts:
- `playwright/.auth/user.json` (admin/super-admin)
- `playwright/.auth/member.json` (member user)
- Setup scripts: `auth.setup.ts` + `auth.setup.member.ts`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin user list | Custom REST endpoint | `authClient.admin.listUsers()` | better-auth plugin handles pagination, search, serialization |
| Organization CRUD | Custom NestJS module | `authClient.organization.*` | better-auth plugin handles org state, memberships, invitations |
| OAuth state/PKCE | Custom state manager | `OAuthStateService` | Already handles state creation, validation, PKCE code verifier |
| Subscription enforcement | Manual limit checks | `QuotaGuard` + `PLAN_LIMITS` | Guard-level enforcement with plan-specific limits |

## Common Pitfalls

### Pitfall 1: Admin Routes Not in OpenAPI Spec
**What goes wrong:** better-auth admin/org routes are NOT NestJS routes. They won't appear in `openapi-spec.json`.
**How to avoid:** Contract tests for admin/org correctly use graceful-skip pattern. Don't try to add these routes to the NestJS spec.

### Pitfall 2: Impersonation + Legal Acceptance
**What goes wrong:** Impersonated user may not have accepted legal terms, causing redirect to `/onboarding`.
**Known issue:** E2E test already skips impersonation test with this exact note.
**How to avoid:** Document as known limitation, don't block phase on it.

### Pitfall 3: OAuth Callback Domain Mismatch
**What goes wrong:** Provider-link OAuth callbacks must return to the frontend origin (Vercel), not the backend (Railway).
**How it works:** Frontend has a Next.js API proxy (`/api/auth/*`). Provider OAuth uses `pl_` state prefix to distinguish provider-link from login callbacks. The `Settings.tsx` code exchange effect handles `code+state+provider` query params.
**How to avoid:** Test OAuth flows on deployed environment (Railway + Vercel), not just localhost.

### Pitfall 4: TenantGuard on All Endpoints
**What goes wrong:** Missing `tenantId` in queries causes data leakage.
**How to avoid:** Every controller already has `@UseGuards(TenantGuard)`. Verify each service method passes `tenantId`.

### Pitfall 5: Hardcoded Strings in Admin Pages
**What goes wrong:** Admin Users page has Italian hardcoded strings in the access-denied fallback ("Accesso limitato", "Questa area e riservata...").
**How to avoid:** This is a known issue. If fixing, use `t.admin.accessDenied.*` keys. But v7.0 scope is verify/fix, not i18n cleanup (that's Phase 95 CLN-02).

### Pitfall 6: Railway Backend May Be Unavailable
**What goes wrong:** Phase 92 already noted Railway backend was unavailable; verification done via code review + vitest.
**How to avoid:** Have a fallback plan: curl against local backend or use vitest mocks. Document which verifications were code-review-only.

## Code Examples

### Backend: Verifying Label API via curl
```bash
# List labels (requires auth cookie)
curl -X GET http://localhost:3000/api/v1/labels \
  -H "Cookie: better-auth.session_token=..." \
  -H "Content-Type: application/json"

# Create label
curl -X POST http://localhost:3000/api/v1/labels \
  -H "Cookie: better-auth.session_token=..." \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Label","color":"#ff0000"}'

# Reorder labels
curl -X POST http://localhost:3000/api/v1/labels/reorder \
  -H "Cookie: better-auth.session_token=..." \
  -H "Content-Type: application/json" \
  -d '{"labelIds":["id1","id2","id3"]}'
```

### Frontend: Settings Page Sections to Verify
```
/dashboard/settings                 -> GeneralSettings (theme, language, timezone, density)
/dashboard/settings?section=security -> SecuritySettings (password, MFA, passkeys, sessions, social accounts)
/dashboard/settings?section=ai      -> AiSettings + WritingStyleSettings
/dashboard/settings?section=accounts -> AccountsSettings (provider list, connect, delete, sync)
/dashboard/settings?section=signatures -> SignatureSettings
/dashboard/settings?section=consent -> ConsentSettings
/dashboard/settings?section=dataRights -> DataExportPanel + AccountDeletionPanel
/dashboard/settings?section=account -> AccountSettings (profile, avatar, delete account)
/dashboard/settings?section=billing -> BillingPanel (subscription, usage, upgrade)
/dashboard/settings?section=telegram -> TelegramSettingsPanel
```

### E2E: Running Existing Admin Tests
```bash
cd frontend
npx playwright test e2e/admin.spec.ts --headed
npx playwright test e2e/organizations.spec.ts --headed
```

## State of the Art

No technology changes. This phase is pure verification of existing code.

| Area | Current State | What Needs Verification |
|------|---------------|------------------------|
| Labels backend | 9 endpoints, all have tenantId guards | Correct responses, edge cases |
| Providers backend | ~20 endpoints, OAuth + IMAP | Connection flows, test endpoints |
| Subscription backend | 8 endpoints, plan-based limits | Usage tracking, cost breakdown |
| Compliance backend | ~12 endpoints across 5 controllers | Consent, export, deletion, legal |
| Tenants backend | 5 endpoints, role-guarded | CRUD correctness, cross-tenant check |
| Telegram backend | 6 endpoints + webhook | Settings CRUD, link token, webhook auth |
| Settings frontend | 10 sections, all components exist | Render, interact, save correctly |
| Admin frontend | UserListTable + OrgAdminPage | Ban/unban, sessions, impersonate |
| Org frontend | Full CRUD + invite + switch | Create, invite, accept, switch |
| Provider frontend | OAuth callback + IMAP form | OAuth flow completion, connect/delete |

## Open Questions

1. **Railway Backend Availability**
   - What we know: Was unavailable during Phase 92
   - What's unclear: Whether it's back up for Phase 93
   - Recommendation: Try Railway first, fall back to local backend or code review

2. **Autumn (Billing Provider) Configuration**
   - What we know: `AutumnController` exists for billing proxy endpoints
   - What's unclear: Whether Autumn API keys are configured in the deployed environment
   - Recommendation: Test subscription endpoints; if Autumn fails, verify the local subscription controller still returns correct data

3. **Telegram Bot Token Configuration**
   - What we know: Bot service uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`
   - What's unclear: Whether these are configured in Railway
   - Recommendation: Verify settings CRUD works; webhook test may be skipped if no bot token

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend unit), Playwright (frontend E2E), Vitest (backend some unit) |
| Config file | `backend/jest.config.ts`, `frontend/playwright.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern="labels\|providers\|subscription\|compliance\|tenant\|telegram" --passWithNoTests` |
| Full suite command | `cd frontend && npx playwright test e2e/admin.spec.ts e2e/organizations.spec.ts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAPI-08 | Labels CRUD + reorder | unit | `cd backend && npx jest labels.service.spec --passWithNoTests` | Yes |
| BAPI-08 | Labels contract | contract | `cd backend && npx jest labels.contract.spec --passWithNoTests` | Yes |
| BAPI-09 | Providers CRUD + OAuth | unit | `cd backend && npx jest provider-config.service.spec --passWithNoTests` | Yes |
| BAPI-09 | Providers contract | contract | `cd backend && npx jest providers.contract.spec --passWithNoTests` | Yes |
| BAPI-10 | Subscription status/usage | unit | `cd backend && npx jest subscription.service.spec --passWithNoTests` | Yes |
| BAPI-10 | Subscription contract | contract | `cd backend && npx jest subscription.contract.spec --passWithNoTests` | Yes |
| BAPI-11 | Compliance consent + export | unit | `cd backend && npx jest consent.service.spec data-export.service.spec --passWithNoTests` | Yes |
| BAPI-17 | Admin user management | E2E | `cd frontend && npx playwright test e2e/admin.spec.ts` | Yes |
| BAPI-17 | Admin contract | contract | `cd backend && npx jest admin.contract.spec --passWithNoTests` | Yes |
| BAPI-18 | Tenant CRUD | unit | `cd backend && npx jest tenant.service.spec --passWithNoTests` | Yes |
| BAPI-19 | Telegram settings + webhook | unit | `cd backend && npx jest telegram --passWithNoTests` | Yes |
| FE-10 | Settings page renders | E2E/manual | Playwright browser verification | No dedicated E2E |
| FE-11 | Admin pages function | E2E | `cd frontend && npx playwright test e2e/admin.spec.ts` | Yes |
| FE-19 | Organization flows | E2E | `cd frontend && npx playwright test e2e/organizations.spec.ts` | Yes |
| FE-20 | Provider OAuth flows | manual | Browser verification against deployed env | No automated test |

### Sampling Rate
- **Per task commit:** Run affected unit tests
- **Per wave merge:** Full backend unit suite + relevant E2E
- **Phase gate:** All backend unit + contract tests green, E2E admin + org tests green

### Wave 0 Gaps
- [ ] No dedicated E2E test for Settings page (FE-10) -- verify via Playwright browser session
- [ ] No automated E2E for provider OAuth flows (FE-20) -- requires real Google/Microsoft OAuth, verify manually
- [ ] No E2E for billing/subscription frontend (FE-10 billing section) -- verify via browser

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all relevant controllers, services, components, hooks, API modules, and E2E tests
- Existing contract tests in `backend/test/contract/`
- Existing E2E tests in `frontend/e2e/`

### Secondary (MEDIUM confidence)
- Project CLAUDE.md guidelines and STATE.md history for v7.0 approach (verify/fix only)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all existing code
- Architecture: HIGH - All modules inspected, patterns documented
- Pitfalls: HIGH - Based on actual code inspection and E2E test notes (e.g., impersonation skip)

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- existing code verification)
