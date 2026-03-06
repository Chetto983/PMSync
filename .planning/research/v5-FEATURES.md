# Feature Landscape: better-auth Migration (v5.0)

**Domain:** Authentication migration
**Researched:** 2026-03-06

## Table Stakes

Features that MUST work after migration. Missing = regression.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email/password login | Current core flow | Low | better-auth built-in |
| Session persistence (httpOnly cookie) | Current security model | Low | better-auth default behavior |
| Session validation on NestJS endpoints | Every protected endpoint depends on this | Medium | @thallesp/nestjs-better-auth guard |
| Tenant isolation (multi-tenant) | 42+ models scoped by tenantId | High | Organization plugin + tenantId bridge |
| Role-based access control | >50% controllers use RolesGuard | Medium | Map org member role to existing RolesGuard |
| WebSocket authentication | Real-time features depend on it | Medium | Adapt RealtimeHandshakeService |
| BullMQ job context (tenantId) | Background jobs need tenant isolation | Low | No change needed -- jobs carry tenantId in data |
| Logout + session revocation | Security requirement | Low | better-auth built-in |
| Password reset | User-facing feature | Low | better-auth built-in |
| CSRF protection | Security requirement | Medium | Verify better-auth's CSRF handling vs. current custom middleware |

## Differentiators

Features that make this migration worthwhile. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Google OAuth social login | One-click sign-in; PROJECT.md target | Low | better-auth socialProviders config |
| Two-factor auth (TOTP) | Stronger security; PROJECT.md target | Medium | better-auth 2FA plugin (replaces 4 custom services) |
| Passkey/WebAuthn login | Passwordless future | Medium | better-auth passkey plugin (replaces custom WebAuthnService) |
| Organization invitations | Invite team members via email | Low | Organization plugin built-in |
| Organization roles (owner/admin/member) | Granular org-level access | Low | Organization plugin built-in |
| Admin panel | User management, ban/unban, impersonation | Medium | better-auth admin plugin + dashboard |
| Session freshness for sensitive ops | Extra security for password changes, etc. | Low | better-auth freshAge config |
| Device trust for 2FA | Skip 2FA on trusted devices (30 days) | Low | better-auth 2FA built-in |

## Anti-Features

Features to explicitly NOT build during v5.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Dual auth system (JWT + better-auth) | Two auth systems = security holes | Clean cutover; delete all JWT infrastructure |
| Custom session caching in Redis | better-auth has cookieCache; duplicating adds confusion | Use better-auth's cookieCache (compact strategy) |
| Gradual per-endpoint migration | Partially migrated auth = inconsistent security | All-at-once migration with clean slate for users |
| Custom organization/tenant sync daemon | Over-engineering | Direct `Organization.tenantId` FK column |
| Microsoft social login in v5.0 | Scope creep; Google OAuth is the stated goal | Defer to v5.1; better-auth supports it when ready |

## Feature Dependencies

```
better-auth instance (Next.js)
  ├── Prisma adapter setup
  │     └── Schema generation (User, Session, Account, Verification)
  │
  ├── Organization plugin
  │     ├── Organization schema + Member table
  │     └── Session.activeOrganizationId
  │           └── TenantGuard adaptation (reads activeOrganizationId)
  │
  ├── 2FA plugin
  │     └── TwoFactor table
  │
  ├── Social login (Google)
  │     └── Account table (providerId: "google")
  │
  └── Admin plugin
        └── Role-based admin endpoints

NestJS session validation
  ├── @thallesp/nestjs-better-auth
  │     ├── AuthGuard (replaces JwtAuthGuard)
  │     └── @Session() decorator
  │
  ├── TenantGuard adaptation
  │     └── Depends on Organization plugin being configured
  │
  ├── RolesGuard adaptation
  │     └── Depends on session carrying role info
  │
  └── WebSocket auth adaptation
        └── Depends on session validation working with cookie extraction
```

## MVP Recommendation

Prioritize (Phase 1 -- must ship together):
1. better-auth instance in Next.js with Prisma adapter
2. NestJS session validation via @thallesp/nestjs-better-auth
3. Email/password login
4. Organization plugin with tenantId bridge
5. TenantGuard + RolesGuard adaptation
6. WebSocket auth adaptation
7. Frontend auth UI (login page, session hooks)

Phase 2:
8. Google OAuth social login
9. 2FA (TOTP + backup codes)
10. Passkey login

Phase 3:
11. Admin panel
12. Organization invitations
13. Delete all legacy auth code

Defer: Microsoft social login, custom roles per organization, teams feature

## Sources

- [better-auth Organization Plugin](https://better-auth.com/docs/plugins/organization) -- HIGH confidence
- [better-auth 2FA Plugin](https://better-auth.com/docs/plugins/2fa) -- HIGH confidence
- [better-auth Admin Plugin](https://better-auth.com/docs/plugins/admin) -- HIGH confidence
- [better-auth Passkey Plugin](https://better-auth.com/docs/plugins/passkey) -- HIGH confidence
