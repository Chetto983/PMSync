# Roadmap: PMSync

## Milestones

- ✅ **v1.0 Stability & Code Quality** - Phases 1-5 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** - Phases 6-10 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** - Phases 11-13 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** - Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** - Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** - Phases 23-30 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** - Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** - Phases 42-49 (shipped 2026-03-06)
- 🚧 **v5.0 better-auth Migration** - Phases 50-58 (in progress)

## Phases

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) - SHIPPED 2026-02-09</summary>

Phases 1-12: VoltAgent audit, modern chat UI, priority scoring, follow-ups refactor, nested labels, chat UI on mail, chat improvements, email tool triage, artifact renderers, UI review, AI module audit, test fixes. 12 phases, 42 plans, 19/19 requirements.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) - SHIPPED 2026-02-27</summary>

Phases 13-22: PII tokenization, database encryption at rest, GDPR core compliance, data rights & legal, rich artifacts UI, AI triage & bulk ops, AI draft generation, GDPR guard mounting, triage prompt enrichment, bug audit. 10 phases, 31/32 requirements (ENC-03 deferred).

</details>

<details>
<summary>✅ v3.2 AI Rebuild & Cleanup (Phases 23-30) - SHIPPED 2026-03-03 (partial)</summary>

Phases 23-28: SDK foundation, backend core pipeline, tools & RAG, non-chat AI, chat frontend, cleanup & VoltAgent deletion. 6 phases complete (20 plans). Phases 29-30 (architecture hardening, performance & debt) carried forward to v4.0 as ARCH-01/02/03 and PERF-01/02.

</details>

<details>
<summary>✅ v4.0 Enterprise Stabilization (Phases 31-41) - SHIPPED 2026-03-04</summary>

- [x] Phase 31: Foundation & Stability Verification (2/2 plans) -- completed 2026-03-03
- [x] Phase 32: Architecture Decoupling (4/4 plans) -- completed 2026-03-03
- [x] Phase 33: API Contract Standardization (3/3 plans) -- completed 2026-03-03
- [x] Phase 34: Auth Security Hardening (3/3 plans) -- completed 2026-03-04
- [x] Phase 35: AI Observability & Permissions (2/2 plans) -- completed 2026-03-04
- [x] Phase 36: Encrypted Search (2/2 plans) -- completed 2026-03-04
- [x] Phase 37: Performance & Debt Closure (2/2 plans) -- completed 2026-03-04
- [x] Phase 38: Attachment Proxy Path Fix (1/1 plan) -- completed 2026-03-04
- [x] Phase 39: Code Quality & CI Hygiene (1/1 plan) -- completed 2026-03-04
- [x] Phase 40: Fix CI Regressions (1/1 plan) -- completed 2026-03-04
- [x] Phase 41: Backend Code Hygiene (1/1 plan) -- completed 2026-03-04

11 phases, 22 plans, 19/19 requirements. See `.planning/milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.1 Security Hardening & Debt Reduction (Phases 42-49) - SHIPPED 2026-03-06</summary>

- [x] Phase 42: Tenant Isolation & Auth Hardening (4/4 plans) -- completed 2026-03-04
- [x] Phase 43: Contract Tests & Backend God-File Splits (4/4 plans) -- completed 2026-03-05
- [x] Phase 44: Frontend God-File Splits (4/4 plans) -- completed 2026-03-06
- [x] Phase 45: forwardRef Burn-Down (3/3 plans) -- completed 2026-03-06
- [x] Phase 46: Observability (3/3 plans) -- completed 2026-03-06
- [x] Phase 47: Infrastructure & Cleanup (3/3 plans) -- completed 2026-03-06
- [x] Phase 48: Auth Fix 2026 Best Practice (4/4 plans) -- completed 2026-03-06
- [x] Phase 49: Zero Circular Dependencies (3/3 plans) -- completed 2026-03-06

8 phases, 28 plans, 65/66 requirements. See `.planning/milestones/v4.1-ROADMAP.md` for full details.

</details>

### v5.0 better-auth Migration (In Progress)

**Milestone Goal:** Replace broken custom auth with better-auth -- full enterprise auth (email/password, social login, 2FA, organizations/roles, admin panel) with clean slate migration.

- [x] **Phase 50: Schema & Infrastructure** - Prisma models for better-auth, dual instances (Next.js + NestJS), cookie/session config
- [x] **Phase 51: Core Email/Password Auth** - Sign up, sign in, email verification, password reset via better-auth
- [x] **Phase 52: NestJS Session Validation** - Guards rewrite, tenant bridge, bodyParser fix, BullMQ context
 (completed 2026-03-06)
- [x] **Phase 53: Frontend Auth UI** - Login/signup pages, session hooks, protected routes with better-auth client (completed 2026-03-09)
- [x] **Phase 54: WebSocket Auth** - Verified existing better-auth WS handshake (7/7 tests pass, zero JWT remnants) (completed 2026-03-09)
- [ ] **Phase 55: Social Login & MFA** - Google OAuth, TOTP 2FA, passkeys, backup codes, security settings
- [ ] **Phase 56: Organizations** - Org creation, invitations, roles, switching, API permission enforcement
- [ ] **Phase 57: Admin Panel** - User management, ban/unban, impersonation, session revocation
- [ ] **Phase 58: Compliance & Cleanup** - Audit trail hooks, GDPR updates, legacy code deletion, test rewrite

## Phase Details

### Phase 50: Schema & Infrastructure
**Goal**: better-auth can run in both Next.js and NestJS, backed by shared Prisma schema with tenant awareness
**Depends on**: Nothing (first phase of v5.0)
**Requirements**: CORE-06, CORE-07
**Success Criteria** (what must be TRUE):
  1. Prisma schema contains better-auth tables (user, session, account, verification) with tenantId on user via additionalFields
  2. better-auth instance initializes in Next.js and responds to `/api/auth/*` routes
  3. better-auth instance initializes in NestJS for session validation (read-only consumer)
  4. Sessions are DB-backed httpOnly cookies (no JWT anywhere in the new auth path)
  5. HIBP password check rejects known-breached passwords during signup attempt
**Plans:** 2/2 plans complete

Plans:
- [x] 50-01-PLAN.md — Prisma schema reshape + HIBP utility + better-auth Next.js instance
- [x] 50-02-PLAN.md — NestJS better-auth consumer instance + cross-service verification

### Phase 51: Core Email/Password Auth
**Goal**: Users can create accounts, sign in, verify email, and reset passwords through better-auth
**Depends on**: Phase 50
**Requirements**: CORE-01, CORE-02, CORE-04, CORE-05
**Success Criteria** (what must be TRUE):
  1. User can create account with email and password, and a session cookie is set
  2. User can sign in with existing email/password and land on the dashboard
  3. User receives verification email after signup and can verify their address
  4. User can request password reset, receive email link, and set a new password
**Plans:** 2/2 plans complete

Plans:
- [x] 51-01-PLAN.md — Server-side: nodemailer, auth-client, email callbacks, HIBP on reset
- [x] 51-02-PLAN.md — Client-side: rewire 4 auth pages + create verify-email page

### Phase 52: NestJS Session Validation
**Goal**: NestJS backend validates better-auth sessions and enforces tenant/role isolation on all API requests
**Depends on**: Phase 51
**Requirements**: NEST-01, NEST-02, NEST-03, NEST-04, NEST-06
**Success Criteria** (what must be TRUE):
  1. NestJS AuthGuard validates better-auth session cookie via shared DB lookup and rejects invalid/expired sessions with 401
  2. TenantGuard reads tenantId from the better-auth session user and scopes all Prisma queries to that tenant
  3. RolesGuard enforces role-based access using roles from better-auth session (existing RBAC decorators still work)
  4. bodyParser is disabled only for `/api/auth/*` proxy routes; all other NestJS routes parse bodies normally
  5. BullMQ jobs created during a request carry the correct tenantId from the new auth context
**Plans:** 3/3 plans complete

Plans:
- [ ] 52-01-PLAN.md — BetterAuthGuard + @Public() decorator + global guard registration
- [ ] 52-02-PLAN.md — Controller cleanup (remove JwtAuthGuard) + TenantGuard/RolesGuard verification
- [ ] 52-03-PLAN.md — Gap closure: fix stale test + update JwtAuthGuard references in JSDoc

### Phase 53: Frontend Auth UI
**Goal**: Users interact with polished login/signup pages and the app manages sessions entirely through better-auth client
**Depends on**: Phase 52
**Requirements**: FEUI-01, FEUI-02, FEUI-03, FEUI-04
**Success Criteria** (what must be TRUE):
  1. User sees a login page and signup page built with better-auth-ui shadcn components (no custom form)
  2. useSession hook from better-auth/react provides current user/session state across the app
  3. Old Zustand auth store and custom AuthContext are removed; all auth state comes from better-auth client
  4. Unauthenticated users hitting any protected route are redirected to /auth/login with return URL preserved
**Plans:** 2/2 plans complete

Plans:
- [x] 53-01-PLAN.md — Install better-auth-ui, create middleware + auth pages, wire AuthUIProvider
- [x] 53-02-PLAN.md — Migrate all auth consumers to useSession, delete old auth layer, update E2E tests

### Phase 54: WebSocket Auth
**Goal**: WebSocket connections authenticate using better-auth session tokens instead of JWT
**Depends on**: Phase 52
**Requirements**: NEST-05
**Success Criteria** (what must be TRUE):
  1. WebSocket handshake extracts better-auth session cookie and validates it via DB lookup
  2. Invalid or expired session tokens are rejected during handshake with appropriate error
  3. Existing real-time features (email sync notifications, chat) work with the new WebSocket auth
**Plans:** 1/1 plans complete

Plans:
- [x] 54-01-PLAN.md — Verify existing WS auth implementation (tests + smoke test)

### Phase 55: Social Login & MFA
**Goal**: Users can sign in with Google or Microsoft and protect their accounts with TOTP or passkeys
**Depends on**: Phase 53
**Requirements**: CORE-03, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. User can sign in with Google or Microsoft OAuth and land on the dashboard with a valid session
  2. User can enable TOTP 2FA, scan QR code, and is prompted for TOTP code on subsequent logins
  3. User can use backup codes to bypass TOTP when their device is unavailable
  4. User can register a passkey (WebAuthn) and use it as primary or second-factor authentication
  5. User can view and manage all security settings (active 2FA methods, registered passkeys, active sessions) from a settings page
**Plans**: TBD

Plans:
- [ ] 55-01: TBD
- [ ] 55-02: TBD
- [ ] 55-03: TBD

### Phase 56: Organizations
**Goal**: Users can create and manage organizations with role-based membership
**Depends on**: Phase 52
**Requirements**: ORG-01, ORG-02, ORG-03, ORG-04, ORG-05
**Success Criteria** (what must be TRUE):
  1. User can create a new organization and becomes its owner
  2. Organization owner can invite members by email; invited user receives invitation and can accept
  3. Organization owner/admin can assign and change roles (owner, admin, member) for members
  4. User belonging to multiple organizations can switch between them and the UI/API context updates
  5. API endpoints enforce organization-level permissions (members cannot perform admin/owner actions)
**Plans**: TBD

Plans:
- [ ] 56-01: TBD
- [ ] 56-02: TBD

### Phase 57: Admin Panel
**Goal**: Admins can manage users and sessions from an admin interface
**Depends on**: Phase 52, Phase 55
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04
**Success Criteria** (what must be TRUE):
  1. Admin can list all users with search/filter and see account status (verified, banned, 2FA enabled)
  2. Admin can ban a user with a reason and optional expiry; banned user cannot sign in and sees ban reason
  3. Admin can impersonate a user to troubleshoot their experience, with audit trail of impersonation
  4. Admin can revoke any user's active sessions, forcing immediate re-authentication
**Plans**: TBD

Plans:
- [ ] 57-01: TBD
- [ ] 57-02: TBD

### Phase 58: Compliance & Cleanup
**Goal**: Auth events feed into audit/GDPR systems and all legacy auth code is deleted
**Depends on**: Phase 55, Phase 56, Phase 57
**Requirements**: CLN-01, CLN-02, CLN-03, CLN-04, CLN-05
**Success Criteria** (what must be TRUE):
  1. Auth events (login, logout, signup, password change, 2FA enable/disable) are logged to the existing audit trail
  2. GDPR data export includes better-auth tables (account, session, verification, organization membership)
  3. Right to erasure cascades into all better-auth tables and cleans up organization memberships
  4. Old auth code is deleted (~17 services, 5 npm packages, 7 Prisma models) and the app builds cleanly
  5. Auth test suite covers all better-auth flows (signup, signin, OAuth, 2FA, org, admin, session validation)
**Plans**: TBD

Plans:
- [ ] 58-01: TBD
- [ ] 58-02: TBD
- [ ] 58-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 50 -> 51 -> 52 -> 53 -> 54 -> 55 -> 56 -> 57 -> 58

Note: Phase 54 (WebSocket) can run in parallel with Phase 53 (Frontend) since both depend on Phase 52 only.
Phase 56 (Orgs) can start after Phase 52; Phase 57 (Admin) needs Phase 55 for 2FA status display.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 50. Schema & Infrastructure | v5.0 | Complete    | 2026-03-06 | 2026-03-06 |
| 51. Core Email/Password Auth | v5.0 | Complete    | 2026-03-06 | 2026-03-06 |
| 52. NestJS Session Validation | 3/3 | Complete    | 2026-03-06 | - |
| 53. Frontend Auth UI | 2/2 | Complete    | 2026-03-09 | 2026-03-09 |
| 54. WebSocket Auth | v5.0 | Complete    | 2026-03-09 | 2026-03-09 |
| 55. Social Login & MFA | v5.0 | 0/TBD | Not started | - |
| 56. Organizations | v5.0 | 0/TBD | Not started | - |
| 57. Admin Panel | v5.0 | 0/TBD | Not started | - |
| 58. Compliance & Cleanup | v5.0 | 0/TBD | Not started | - |

### Phase 59: safety

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 58
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 59 to break down)

---
*Roadmap created: 2026-02-09*
*v4.1 completed: 2026-03-06 -- 8 phases, 28 plans, 65/66 requirements*
*v5.0 roadmap added: 2026-03-06 -- 9 phases, 35 requirements*
