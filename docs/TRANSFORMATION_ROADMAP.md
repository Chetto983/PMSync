# PMSync — Enterprise Transformation Roadmap

> Historical transformation log from 2026-03-04 to 2026-03-05.
> Items in this roadmap that refer to JWT refresh rotation and related frontend interceptor work describe the legacy auth track, not the current primary browser auth model.
> The current primary auth reference is [`../backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md`](../backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md). The current backend architecture and AI governance references are [`../backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md`](../backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md) and [`../backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md`](../backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md).

**Date:** 2026-03-04 | **Last Updated:** 2026-03-05 (Sprint 1.5)
**Baseline Score:** 42/100 Enterprise Readiness
**Target Score:** 80/100 (end of Phase 4)
**Based on:** [ENTERPRISE_PLATFORM_PRD.md](./ENTERPRISE_PLATFORM_PRD.md)

---

## Completed Work Log

### Sprint 1 Progress (2026-03-04 — 2026-03-05)

| Item | Status | Details |
|------|--------|---------|
| Prisma upgrade 7.3.0 → 7.4.2 | ✅ Done | Client, adapter, CLI all upgraded |
| Dead code cleanup (~830 lines) | ✅ Done | 3 dead filters, email-analysis.service (725 lines), ghost stubs |
| Prisma tenant-scoping extension | ✅ Done | 43 models scoped (incl. RefreshToken), 5 composite PK models, enforce mode active |
| Cron/scheduler bypass wrapping | ✅ Done | 12 services wrapped with `withoutTenantScopingAsync` |
| Negative security tests | ✅ Done | 31 tests total: 13 extension + 18 tenant-isolation (incl. 6 cross-tenant WHERE injection) |
| RolesGuard expansion to 53% | ✅ Done | 17/32 controllers guarded; compliance, subscription, ai-observability, emails, contacts |
| JWT refresh token rotation | ✅ Done | 15min access tokens, `POST /auth/refresh`, family-based theft detection, frontend interceptor |
| Frontend auto-refresh interceptor | ✅ Done | Axios 401 interceptor with queue + retry; 4 tests in api-client-interceptor.spec.ts |
| Password-change token invalidation | ✅ Done | `deleteAllRefreshTokens` on password change + logout; 6 tests in password-change-invalidation.spec.ts |

### Sprint 1.5 Progress (2026-03-05)

| Item | Status | Details |
|------|--------|---------|
| Fix `withoutTenantScopingAsync` | ✅ Done | AsyncLocalStorage + PrismaPromise lazy evaluation bug — bypass scope lost on `.then()`. Fixed: `bypassStorage.run(true, async () => fn())` |
| Fix 403s on compliance endpoints | ✅ Done | ConsentGuard default-deny when no records. Seeded `UserConsent` for 4 AI features. Fixed RolesGuard blocking consent controller |
| One-user-one-tenant admin policy | ✅ Done | All users `role: 'admin'`, schema default changed `@default("user")` → `@default("admin")`, registration always assigns admin |
| Remove ngrok completely | ✅ Done | Killed: env values, CORS regex, `ngrok-skip-browser-warning` header, Docker service, swagger.json URL. Only `.planning/` doc references remain |
| Remove bcrypt dependency | ✅ Done | Uninstalled `bcrypt` + `@types/bcrypt`. Migrated seed.ts + password-hashing.service to argon2id only. All 4 DB hashes rehashed from `$2b$` to `$argon2id$` |
| Railway deployment prep | ✅ Done | `Dockerfile.railway` (multi-stage, no native deps), `railway.toml` (auto-migrate on deploy), `.env.railway.template`, `docs/RAILWAY_DEPLOY.md` |
| PORT env var for Railway | ✅ Done | `configuration.ts` reads `PORT \|\| API_PORT \|\| 3000` (Railway injects `PORT`) |
| Environment split (dev/prod) | ✅ Done | `backend/.env` = dev only (`FRONTEND_URL=localhost:3001`), `.env.railway.template` = prod reference. Deleted dead `.vercel/.env.development.local` |

### Phase 42 Verified (2026-03-04)

Full verification: [42-VERIFICATION.md](../.planning/phases/42-tenant-isolation-auth-hardening/42-VERIFICATION.md)

- **15/15 observable truths verified**, all 4 gaps closed
- Covers: TSEC-01 through TSEC-07, AUTH-01 through AUTH-05, TEST-01 through TEST-03

---

## Current State Summary (as of 2026-03-05 — Post-Audit)

| Dimension | Score | Verified State | Critical Issues |
|-----------|-------|----------------|-----------------|
| Backend | 4.2/5 | 36 controllers, god-files decomposed (auth.service 1376→113), 19/36 RolesGuard | 24 forwardRef files (46 occurrences), attachment proxy still buffers |
| Frontend | 3.8/5 | Fully refactored to modular chat UI, no files >350 lines, 131 deps | No bundle size budget, 3 design systems |
| Security | Medium-Low risk | tenant-scoping 43 models (enforce), argon2id only, ngrok dead, 5 contract tests | CI gate missing, silent CSRF catch, AI endpoints lack RolesGuard |
| Deployment | Railway-ready | Dockerfile.railway, railway.toml, env template, deploy guide | Railway project not yet created |
| Testing | Medium coverage | 41 tenant-scoping tests, 5 contract tests + CI gate, ~60 unit/integration | No WebSocket Redis adapter for horizontal scaling |

---

## Phase 1 — Security Hardening & Debt Reduction

**Timeline:** Weeks 1-6
**Goal:** Eliminate P0 security risks, enforce code quality gates
**Score Target:** 42 → 55/100

### Sprint 1 (Weeks 1-2): Tenant Isolation & Auth Hardening

#### 1.1 Prisma Tenant-Scoping Middleware ✅ COMPLETE (2026-03-04)
**Priority:** P0 — Single biggest security risk
**Risk if skipped:** One missed `tenantId` WHERE clause = cross-tenant data breach

| Task | Status | File(s) |
|------|--------|---------|
| Create Prisma `$extends` extension (not middleware — `$use` deprecated in v7) | ✅ | `backend/src/prisma/tenant-scoping/tenant-scoping.extension.ts` |
| Tenant-scoped models registry (43 models + 5 composite PK) | ✅ | `backend/src/prisma/tenant-scoping/tenant-scoped-models.ts` |
| AsyncLocalStorage accessor + bypass mechanism | ✅ | `backend/src/prisma/tenant-scoping/tenant-context.ts` |
| Chain extension in PrismaService (before encryption) | ✅ | `backend/src/prisma/prisma.service.ts` |
| Enforce mode active — throws `TenantContextRequiredError` | ✅ | AUDIT_MODE = false |
| 12 cron/scheduler services wrapped with `withoutTenantScopingAsync` | ✅ | hitl, sync-scheduler, webhook-lifecycle, data-cleanup, health, etc. |
| 13 extension tests + 18 tenant-isolation tests (incl. 6 cross-tenant WHERE injection) | ✅ | `tenant-scoping.extension.spec.ts` + `tenant-isolation.spec.ts` |
| CI gate: tenant-scoping tests must pass before merge | ⬜ | `.github/workflows/ci.yml` — pending |

**Verification:** ✅ Query without tenant context throws `TenantContextRequiredError`. Bypass works for system operations. Cross-tenant isolation proven via CorrelationContext chain. All 31 tests green.

#### 1.2 RolesGuard Coverage Expansion ✅ COMPLETE (2026-03-04)
**Priority:** P0 — Was only 8 of ~120 controller methods guarded
**Result:** 17/32 controllers = 53.1% coverage (target was ≥50%)

| Task | Status | Controller(s) |
|------|--------|--------------|
| Add `@Roles('admin')` / `@Roles('super-admin')` to admin endpoints | ✅ | `tenants.controller.ts` |
| UsersController: confirmed self-service-only (no admin methods exist) | ✅ | `users.controller.ts` — JSDoc documents TSEC-04 compliance |
| Add `@Roles('admin', 'manager')` to write operations | ✅ | `contacts.controller.ts`, `emails.controller.ts` (14+ write methods) |
| Add `@Roles('admin')` to compliance/audit endpoints | ✅ | `consent`, `data-export`, `data-deletion`, `legal`, `gdpr`, `ai-observability` |
| Add `@Roles('admin')` to subscription management | ✅ | `subscription.controller.ts` |
| Additional controllers guarded | ✅ | `labels`, `signatures`, `templates`, `folders`, `email-sync` |
| Integration tests: role enforcement → 403 | ✅ | `roles-guard.integration.spec.ts` (12 tests) |

**Guard chain:** `JwtAuthGuard → TenantGuard → RolesGuard` on 17 controllers

#### 1.3 JWT Refresh Token Rotation ✅ COMPLETE (2026-03-04)
**Priority:** P1 — Was 24h access token lifetime

| Task | Status | File(s) |
|------|--------|---------|
| Reduce access token lifetime to 15 minutes | ✅ | `cookie.helper.ts` (maxAge: 15 * 60 * 1000) |
| RefreshToken Prisma model (familyId, tokenHash, isUsed, replacedBy) | ✅ | `schema.prisma` |
| Refresh token rotation with family-based theft detection | ✅ | `auth.service.ts` (`rotateRefreshToken`) |
| `POST /auth/refresh` endpoint with throttle | ✅ | `auth.controller.ts:282` |
| Frontend auto-refresh via axios interceptor on 401 | ✅ | `frontend/lib/api-client.ts` (isRefreshing + failedQueue) |
| Invalidate all refresh tokens on password change | ✅ | `auth.service.ts:1137` |
| Invalidate all refresh tokens on logout | ✅ | `auth.controller.ts:268` |
| Reuse-detection: consumed token → delete entire family | ✅ | `auth.service.ts:1296` |
| Backend tests (rotation, theft, expiry, grace, password-change) | ✅ | `refresh-token.spec.ts` (6), `password-change-invalidation.spec.ts` (6) |
| Frontend tests (401 retry, concurrent queue, no loop) | ✅ | `api-client-interceptor.spec.ts` (4) |

**⚠️ Side effect:** `auth.service.ts` grew from 1212 → 1376 lines. Now #2 god-file — higher priority for splitting in 1.6.

#### 1.4 Fix Attachment Proxy Memory Buffering
**Priority:** P1 — OOM risk on large attachments

| Task | File | Effort |
|------|------|--------|
| Replace `arrayBuffer()` + `Buffer.from()` with piped stream | `backend/src/modules/email/controllers/attachments.controller.ts:128-129` | 2h |
| Add `Content-Length` header passthrough from S3 | Same file | 30m |
| Test with 50MB attachment | Manual test | 30m |

### Sprint 2 (Weeks 3-4): Contract Tests & Code Quality

#### 1.5 Frontend-Backend Contract Tests ✅ COMPLETE (verified 2026-03-05 audit)
**Priority:** P0 — Zero contract tests means silent API drift

| Task | Status | File(s) |
|------|--------|---------|
| OpenAPI schema validation approach | ✅ | Uses generated `openapi-spec.json` |
| Contract test runner | ✅ | `backend/test/contract/contract-helpers.ts` (175 lines) |
| auth-login contract | ✅ | `backend/test/contract/auth-login.contract.spec.ts` |
| emails-list contract | ✅ | `backend/test/contract/emails-list.contract.spec.ts` |
| contacts-list contract | ✅ | `backend/test/contract/contacts-list.contract.spec.ts` |
| briefing contract | ✅ | `backend/test/contract/briefing.contract.spec.ts` |
| ai-chat contract | ✅ | `backend/test/contract/ai-chat.contract.spec.ts` |
| CI gate | ✅ | `.github/workflows/ci.yml` — runs after OpenAPI generation |

#### 1.6 God-File Decomposition (Backend) ✅ COMPLETE (verified 2026-03-05 audit)

**Priority:** P1 — Was 54 files exceed 500-line limit

| File | Was | Now | Status |
|------|-----|-----|--------|
| `auth.service.ts` | 1376 | 113 | ✅ Split into auth-login, auth-registration, auth-token services |
| `emails.controller.ts` | 1183 | 138 | ✅ Split into email-query, email-actions, email-calendar-invite controllers |
| `email-insights.service.ts` | 1072 | 78 | ✅ Decomposed |
| `contacts.service.ts` | 1049 | 88 | ✅ Decomposed |
| `email-sync-back.service.ts` | 1429 | N/A | ✅ File removed, split into sync workers |

**Remaining >500 line files:** ~22 files (930 max), all justified by domain complexity (queue processors, OAuth services, calendar sync, IMAP drivers). No god-files remain.

#### 1.7 God-File Decomposition (Frontend) ✅ COMPLETE (verified 2026-03-05 audit)

**Priority:** P1 — Was 13 files exceed 500-line limit

Frontend fully refactored to modular chat-based AI UI. All original god-files eliminated:

| File | Was | Now | Status |
|------|-----|-----|--------|
| `Calendar.tsx` | 1180 | Removed | ✅ Replaced by modular components |
| `Contacts.tsx` | 1021 | Removed | ✅ Replaced by modular components |
| `Header.tsx` | 799 | Removed | ✅ Replaced by modular components |
| `ContactDetail.tsx` | 720 | Removed | ✅ Replaced by modular components |
| `DashboardContainer.tsx` | 674 | Removed | ✅ Replaced by modular components |
| `Settings.tsx` | 661 | Removed | ✅ Replaced by modular components |
| `email-ui-store.ts` | 552 | Removed | ✅ Replaced by modular components |

**Largest frontend file now:** 349 lines (`chat/types.ts` — type definitions). No files >500 lines.

### Sprint 3 (Weeks 5-6): Observability & Cleanup

#### 1.8 Prometheus Upgrade
**Priority:** P2

| Task | File(s) | Effort |
|------|---------|--------|
| Replace custom metrics with `prom-client` | `backend/src/modules/health/controllers/health.controller.ts` | 3h |
| Add standard metrics: request duration histogram, active connections gauge | New middleware | 2h |
| Add queue depth metrics from BullMQ | `backend/src/modules/email-sync/services/queue.service.ts` | 2h |
| Add AI cost/token counter | `backend/src/modules/ai/services/ai-run-ledger.service.ts` | 1h |

#### 1.9 Fix Silent CSRF Catch
**Priority:** P2

| Task | File | Effort |
|------|------|--------|
| Replace empty string return with proper error propagation | `frontend/lib/api-client.ts` | 1h |
| Add CSRF token refresh retry logic | Same file | 1h |

#### 1.10 WebSocket Redis Adapter
**Priority:** P2 — Required for horizontal scaling

| Task | File(s) | Effort |
|------|---------|--------|
| Add `@socket.io/redis-adapter` | `backend/src/modules/realtime/` | 2h |
| Configure pub/sub channels per tenant | Same module | 2h |
| Test with 2 backend instances | Docker Compose | 2h |

#### 1.11 Dead Code & Dependency Cleanup (partial ✅)
**Priority:** P2

| Task | Status | Details |
|------|--------|---------|
| Delete dead filter files | ✅ | `all-exceptions.filter.ts`, `http-exception.filter.ts`, `throttler-exception.filter.ts` removed |
| Delete dead `email-analysis.service.ts` (725 lines) | ✅ | Zero imports, fully superseded |
| Remove ghost service stubs (BatchIndexing, WritingStyle, FollowUp, AttentionScore) | ✅ | ~100 lines of dead `@Optional()` injections removed |
| Clean dead code paths (VoltAgent SQL, getUserMessages, cache namespaces) | ✅ | ~830 lines total removed |
| Audit 149 frontend dependencies — remove unused | ⬜ | `frontend/package.json` |
| Add bundle size budget in CI | ⬜ | `next.config.js` + CI |
| Run CBC→GCM re-encryption backfill or verify it ran | ⬜ | `backend/scripts/` |

#### 1.12 forwardRef Burn-Down (FULL ELIMINATION)
**Priority:** P0 — **Hard blocker: zero forwardRef before any microservice extraction**
**Current:** 24 files, 46 occurrences | **Target:** 0

| Current (24 files) | Target (0) | Strategy |
|--------------------|------------|----------|
| `email.module.ts` (4 refs) | 0 | Replace with EventEmitter2 domain events |
| `email-sync.module.ts` (3 refs) | 0 | Extract shared interfaces to `common/` |
| `auth.module.ts` (3 refs) | 0 | Move user lookup to shared service |
| `providers.module.ts` (2 refs) | 0 | Extract provider interfaces to `common/` |
| Worker files (various) | 0 | Inject via module providers, not forwardRef |
| Queue services (various) | 0 | Extract queue interfaces, use dynamic modules |
| AI services (various) | 0 | Extract shared AI interfaces to `common/` |
| Remaining files | 0 | Audit each — replace with events, shared interfaces, or module restructuring |

### Phase 1 Exit Criteria (8/15 verified 2026-03-05)

- [x] Prisma tenant-scoping extension active + negative tests (**enforce mode, 41 tests**)
- [x] Dead code cleanup (~830 lines removed: filters, email-analysis, ghost stubs)
- [x] Prisma upgraded to 7.4.2
- [x] RolesGuard on ≥50% of controller methods (**19/36 = 52.8%**)
- [x] JWT access token lifetime ≤ 15 minutes (**+ refresh token rotation + frontend interceptor**)
- [x] ≥5 critical API contract tests in CI (**5 contract specs + CI gate**)
- [x] All backend files < 500 lines (top 5 split) — **auth.service 1376→113, emails.controller 1183→138**
- [x] All frontend files < 500 lines (top 7 split) — **all removed, largest now 349 lines**
- [ ] CI gate: tenant-scoping tests must pass before merge
- [ ] Attachment proxy uses streaming — **controller streams from S3 ✅, service still buffers from provider ❌**
- [ ] `prom-client` metrics wired properly — **endpoint exists at /health/metrics but uses manual string formatting, not prom-client APIs**
- [ ] WebSocket Redis adapter configured — **not installed, vanilla Socket.IO only**
- [ ] Bundle size budget established — **131 frontend deps, no constraints in next.config.js**
- [ ] `forwardRef` eliminated: 24 → 0 files — **still 24 files, 46 occurrences (only UsersModule fixed)**
- [ ] CSRF error properly surfaced — **api-client.ts:55-58 silently returns empty string, warning commented out**

---

## Phase 2 — Enterprise Foundation

**Timeline:** Weeks 7-18 (Months 2-4.5)
**Goal:** RBAC, CRM domain, Admin console, unified design system
**Score Target:** 55 → 68/100

### Sprint 4-5 (Weeks 7-10): Permission Model & RBAC

#### 2.1 Permission Model (Backend)

**New Prisma models:**
```prisma
model Permission {
  id          String   @id @default(cuid())
  resource    String   // "contacts", "emails", "ai-chat", "billing"
  action      String   // "read", "write", "delete", "admin"
  description String?
  roles       RolePermission[]
}

model Role {
  id          String   @id @default(cuid())
  name        String   // "owner", "admin", "manager", "member", "viewer"
  tenantId    String
  permissions RolePermission[]
  users       User[]
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(...)
  permission   Permission @relation(...)
  @@id([roleId, permissionId])
}
```

| Task | File(s) | Effort |
|------|---------|--------|
| Create Permission, Role, RolePermission models | `schema.prisma` | 2h |
| Create `PermissionsGuard` (replaces/extends RolesGuard) | `backend/src/common/guards/permissions.guard.ts` (new) | 4h |
| Create `@RequirePermission('contacts.write')` decorator | `backend/src/common/decorators/require-permission.decorator.ts` (new) | 2h |
| Apply to all 33 controllers (replace flat `@Roles()`) | All controllers | 8h |
| Seed default roles + permissions per plan tier | Migration seed script | 3h |
| Permission caching (Redis, 5min TTL) | `backend/src/modules/auth/services/permission-cache.service.ts` (new) | 3h |

#### 2.2 Frontend Permission System

| Task | File(s) | Effort |
|------|---------|--------|
| Create `PermissionGate` component | `frontend/components/common/PermissionGate.tsx` (new) | 3h |
| Create `usePermission()` hook | `frontend/hooks/use-permission.ts` (new) | 2h |
| Create permission context (fetches on login) | `frontend/lib/context/permission-context.tsx` (new) | 3h |
| Wrap all write/delete actions in PermissionGate | All relevant components | 8h |
| Route-level guards (redirect if no permission) | `frontend/lib/guards/route-permission-guard.tsx` (new) | 3h |

**Usage pattern:**
```tsx
<PermissionGate permission="contacts.write" fallback={<DisabledButton />}>
  <EditContactButton />
</PermissionGate>
```

### Sprint 6-7 (Weeks 11-14): CRM Domain Module

#### 2.3 CRM Backend

**New entities:** Account, Deal, Activity, Pipeline, Stage

| Task | File(s) | Effort |
|------|---------|--------|
| Create CRM Prisma models (Account, Deal, Pipeline, Stage, Activity) | `schema.prisma` | 4h |
| Create `CrmModule` with controllers + services | `backend/src/modules/crm/` (new module) | 16h |
| `AccountsController` — CRUD + search + relationship to contacts | `crm/controllers/accounts.controller.ts` | 4h |
| `DealsController` — CRUD + pipeline management + stage transitions | `crm/controllers/deals.controller.ts` | 4h |
| `ActivitiesController` — timeline events across email/calendar/manual | `crm/controllers/activities.controller.ts` | 4h |
| `PipelinesController` — configurable sales/support pipelines | `crm/controllers/pipelines.controller.ts` | 3h |
| Link existing contacts to accounts (M:N relation) | Migration + service update | 2h |
| Auto-generate activities from email sends/receives | Event listener on email sync | 4h |
| Auto-generate activities from calendar events | Event listener on calendar sync | 3h |

#### 2.4 CRM Frontend

| Task | File(s) | Effort |
|------|---------|--------|
| CRM query hooks | `frontend/hooks/queries/use-crm.ts` (new) | 4h |
| Accounts list page with DataTable | `frontend/pages/dashboard/crm/accounts.tsx` (new) | 6h |
| Account detail page with timeline | `frontend/pages/dashboard/crm/accounts/[id].tsx` (new) | 6h |
| Deals board (Kanban view) | `frontend/pages/dashboard/crm/deals.tsx` (new) | 8h |
| Pipeline configuration | `frontend/pages/dashboard/crm/pipelines.tsx` (new) | 4h |
| Activity timeline component | `frontend/components/crm/ActivityTimeline.tsx` (new) | 4h |
| CRM navigation integration | `frontend/components/layout/Sidebar.tsx` | 2h |
| Translations (en.ts + it.ts) | `frontend/locales/en.ts`, `frontend/locales/it.ts` | 2h |

### Sprint 8-9 (Weeks 15-18): Admin Console & Design Unification

#### 2.5 Admin Console

| Task | File(s) | Effort |
|------|---------|--------|
| Admin layout with sub-navigation | `frontend/pages/dashboard/admin/index.tsx` (new) | 3h |
| User management (list, invite, deactivate, role assign) | `frontend/pages/dashboard/admin/users.tsx` (new) | 6h |
| Role/permission matrix editor | `frontend/pages/dashboard/admin/roles.tsx` (new) | 8h |
| Audit log viewer (filterable, searchable) | `frontend/pages/dashboard/admin/audit.tsx` (new) | 6h |
| Billing/subscription management | `frontend/pages/dashboard/admin/billing.tsx` (new) | 4h |
| Tenant settings (branding, defaults) | `frontend/pages/dashboard/admin/settings.tsx` (new) | 4h |

#### 2.6 Design System Unification

**Decision:** Consolidate to MUI as primary. Migrate Tailwind/Radix components.

| Task | File(s) | Effort |
|------|---------|--------|
| Audit all Tailwind classes in `src/components/` | All chat/AI components | 2h |
| Create MUI equivalents for shadcn `ui/` components | `frontend/components/ui/*.tsx` | 12h |
| Migrate chat components from Tailwind to MUI `sx` prop | `frontend/src/components/chat/` | 8h |
| Remove Tailwind config + dependencies | `tailwind.config.ts`, `package.json` | 2h |
| Create theme token documentation | `docs/DESIGN_SYSTEM.md` | 2h |
| Visual regression tests (screenshot comparison) | Playwright visual tests | 4h |

#### 2.7 OpenTelemetry Integration

| Task | File(s) | Effort |
|------|---------|--------|
| Install `@opentelemetry/sdk-node` + exporters | `backend/package.json` | 1h |
| Create OTel bootstrap file | `backend/src/common/telemetry/otel-setup.ts` (new) | 4h |
| Add trace context to HTTP requests | NestJS interceptor | 2h |
| Add trace context to BullMQ jobs | Queue processors | 3h |
| Add trace context to AI calls | `ai-chat.service.ts` | 2h |
| Forward `traceId` to frontend via response headers | Interceptor | 1h |

### Phase 2 Exit Criteria

- [ ] Permission model with ≥5 roles and ≥20 permissions seeded
- [ ] `PermissionsGuard` on all 33 controllers
- [ ] Frontend `PermissionGate` wrapping all write/delete actions
- [ ] CRM module with Accounts, Deals, Activities, Pipelines
- [ ] Admin console with user management, roles, audit log
- [ ] Single design system (MUI) — Tailwind removed
- [ ] OpenTelemetry traces across HTTP → Queue → AI
- [ ] Enterprise readiness score ≥ 68/100

---

## Phase 3 — AI Governance & Observability

**Timeline:** Weeks 19-30 (Months 5-7.5)
**Goal:** Full AI auditability, cost transparency, operational dashboards
**Score Target:** 68 → 76/100

### Sprint 10-11 (Weeks 19-22): AI Run Ledger & Cost Control

#### 3.1 Unified AI Run Ledger

| Task | File(s) | Effort |
|------|---------|--------|
| Create `AiRun` Prisma model (run, steps, tools, costs, approvals, traces) | `schema.prisma` | 3h |
| Create `AiRunLedgerService` v2 with unified tracking | `backend/src/modules/ai/services/ai-run-ledger-v2.service.ts` | 8h |
| Link every AI tool call to a run with OTel trace ID | All AI tool handlers | 6h |
| Persist prompt + completion + model + latency per step | Ledger service | 4h |
| Token budget enforcement per request | `backend/src/modules/ai/guards/token-budget.guard.ts` (new) | 4h |
| Per-user daily cost cap with configurable threshold | Budget service + admin API | 4h |
| Replace hardcoded cost map with configurable pricing | Admin settings or env config | 2h |

#### 3.2 Consolidated Circuit Breaker

| Task | File(s) | Effort |
|------|---------|--------|
| Identify duplicate circuit breaker implementations | Grep across `ai/`, `ai-chat/` | 1h |
| Create single `CircuitBreakerService` in `common/` | `backend/src/common/services/circuit-breaker.service.ts` (new) | 4h |
| Replace all duplicates with shared service | All AI modules | 3h |

#### 3.3 Cost Transparency UI

| Task | File(s) | Effort |
|------|---------|--------|
| AI cost per interaction display in chat | `frontend/src/components/chat/ChatMessage.tsx` | 3h |
| Cost summary widget on dashboard | `frontend/components/dashboard/widgets/AiCostWidget.tsx` (new) | 4h |
| Cost breakdown in admin console | `frontend/pages/dashboard/admin/ai-costs.tsx` (new) | 6h |
| Budget alert notifications | Frontend + backend push | 4h |

### Sprint 12-13 (Weeks 23-26): Observability Dashboards

#### 3.4 AI Execution Trace Dashboard

| Task | File(s) | Effort |
|------|---------|--------|
| AI run list (filterable by user, status, cost, date) | `frontend/pages/dashboard/admin/ai-runs.tsx` (new) | 6h |
| Run detail: timeline of steps, tool calls, decisions | `frontend/pages/dashboard/admin/ai-runs/[id].tsx` (new) | 8h |
| HITL approval/rejection history | Same page | 3h |

#### 3.5 Operations Dashboard

| Task | File(s) | Effort |
|------|---------|--------|
| Queue health overview (active, waiting, failed per queue) | `frontend/pages/dashboard/admin/ops.tsx` (new) | 6h |
| Email sync status per provider/tenant | Same page | 4h |
| AI failure categorization (rate limit, model error, budget, timeout) | Same page | 4h |
| p95 latency charts (requires Prometheus + Grafana or built-in) | Grafana config or custom chart | 8h |
| SLO compliance indicators | Same page | 3h |

### Sprint 14 (Weeks 27-30): Governance & Accessibility

#### 3.6 HITL Improvements

| Task | File(s) | Effort |
|------|---------|--------|
| Push notification for pending approvals | Backend SSE + frontend notification | 4h |
| Approval timeout with configurable auto-reject | Backend scheduled job | 3h |
| Approval audit trail linked to AI Run Ledger | Ledger service | 2h |

#### 3.7 AI Action Rollback Registry

| Task | File(s) | Effort |
|------|---------|--------|
| Rollback registry for non-email AI actions (CRM updates, calendar changes) | `backend/src/modules/ai/services/rollback-registry.service.ts` (new) | 8h |
| Undo UI in chat interface | Frontend chat component | 4h |
| Compensation actions (e.g., un-create a contact) | Per-tool rollback handlers | 6h |

#### 3.8 WCAG AA Accessibility Audit

| Task | File(s) | Effort |
|------|---------|--------|
| Run axe-core audit on all pages | Playwright + axe integration | 4h |
| Fix critical a11y issues (focus management, aria labels, color contrast) | Various components | 12h |
| Add keyboard navigation to DataTable, FilterBuilder, Pipeline board | CRM components | 6h |
| Screen reader testing (NVDA/VoiceOver) | Manual testing | 4h |

### Phase 3 Exit Criteria

- [ ] Unified AI Run Ledger tracking 100% of AI operations
- [ ] Token budget cap per request + per-user daily cap
- [ ] Per-interaction cost visible in chat UI
- [ ] AI execution trace dashboard live
- [ ] Operations dashboard with queue health, sync status, failure categories
- [ ] Single circuit breaker implementation
- [ ] HITL push notifications + timeout + audit trail
- [ ] Rollback registry for non-email AI actions
- [ ] WCAG AA compliance on critical paths
- [ ] Enterprise readiness score ≥ 76/100

---

## Phase 4 — Marketplace & Advanced Automation

**Timeline:** Weeks 31-48 (Months 8-12)
**Goal:** Workflow builder, plugin system, white-label, marketplace beta
**Score Target:** 76 → 80+/100

### Sprint 15-17 (Weeks 31-36): Workflow Builder

#### 4.1 Workflow Engine (Backend)

| Task | File(s) | Effort |
|------|---------|--------|
| Workflow Prisma models (Workflow, WorkflowStep, WorkflowRun, WorkflowRunStep) | `schema.prisma` | 3h |
| Durable state machine with retries + compensation | `backend/src/modules/workflow/services/workflow-engine.service.ts` (new) | 16h |
| Canonical action registry with typed I/O schemas | `backend/src/modules/workflow/services/action-registry.service.ts` (new) | 6h |
| Policy engine integration per workflow step | Permission checks per action | 4h |
| Workflow CRUD API | `backend/src/modules/workflow/controllers/workflow.controller.ts` (new) | 6h |
| Workflow execution API with real-time status | Controller + SSE | 4h |

#### 4.2 Workflow Builder UI

| Task | File(s) | Effort |
|------|---------|--------|
| Visual node editor using `@xyflow/react` | `frontend/pages/dashboard/workflows/builder.tsx` (new) | 16h |
| Action node palette (email, AI, CRM, calendar, webhook) | `frontend/components/workflow/ActionPalette.tsx` (new) | 6h |
| Conditional branching nodes | Builder component | 4h |
| Workflow run history + execution debugger | `frontend/pages/dashboard/workflows/[id]/runs.tsx` (new) | 8h |
| Template library (pre-built workflows) | `frontend/pages/dashboard/workflows/templates.tsx` (new) | 4h |

### Sprint 18-20 (Weeks 37-42): Plugin System & Custom Fields

#### 4.3 Extension Point API

| Task | File(s) | Effort |
|------|---------|--------|
| Plugin manifest schema (capabilities, scopes, resource access) | `backend/src/modules/plugins/schemas/manifest.schema.ts` (new) | 4h |
| Plugin registry service | `backend/src/modules/plugins/services/plugin-registry.service.ts` (new) | 8h |
| Extension contracts: custom tools, CRM fields, workflow actions | Plugin module | 12h |
| Plugin sandbox (V8 isolate or WASM) | `backend/src/modules/plugins/services/plugin-sandbox.service.ts` (new) | 16h |
| Plugin CRUD API + install/uninstall lifecycle | Controller | 6h |

#### 4.4 Custom CRM Fields

| Task | File(s) | Effort |
|------|---------|--------|
| Custom field definition model (name, type, validation, entity) | `schema.prisma` | 2h |
| Custom field value storage (JSONB + indexed) | Migration + service | 4h |
| Custom field admin UI | `frontend/pages/dashboard/admin/custom-fields.tsx` (new) | 6h |
| Custom field rendering in CRM detail pages | CRM components | 4h |
| Custom field filtering in DataTable | FilterBuilder integration | 4h |

### Sprint 21-24 (Weeks 43-48): White-Label & Marketplace

#### 4.5 White-Label Theming

| Task | File(s) | Effort |
|------|---------|--------|
| Tenant branding model (logo, colors, favicon, email templates) | `schema.prisma` | 2h |
| Theme token override per tenant | Backend API + frontend context | 6h |
| Dynamic MUI theme generation from tenant config | `frontend/lib/theme/tenant-theme.ts` (new) | 4h |
| Email template branding (outgoing emails use tenant branding) | Backend email service | 4h |
| Login page branding (custom domain support prep) | Frontend login component | 3h |

#### 4.6 Marketplace Infrastructure

| Task | File(s) | Effort |
|------|---------|--------|
| App store backend (listing, install, rate, review) | `backend/src/modules/marketplace/` (new module) | 16h |
| App store frontend (browse, search, install) | `frontend/pages/dashboard/marketplace/` (new) | 12h |
| Plugin certification pipeline (review, approve, publish) | Admin module extension | 8h |
| Revenue integration (if applicable) | Billing module extension | 8h |

#### 4.7 App Router Migration (Optional/Parallel)

| Task | Details | Effort |
|------|---------|--------|
| Evaluate Next.js App Router migration path | Research + spike | 4h |
| Migrate page-by-page starting with new pages (CRM, admin, workflows) | Incremental | 20h |
| SSR prefetch with TanStack Query `prefetchQuery` | Per-page | 8h |

### Phase 4 Exit Criteria

- [ ] Workflow builder with visual editor, execution engine, templates
- [ ] Plugin system with sandboxed execution + manifest validation
- [ ] Custom CRM fields (create, render, filter)
- [ ] White-label theming per tenant
- [ ] Marketplace beta with ≥3 internal plugins published
- [ ] Enterprise readiness score ≥ 80/100

---

## Risk Matrix

| Phase | Key Risk | Mitigation |
|-------|----------|------------|
| 1 | Tenant middleware breaks existing queries | Staged rollout: read-only audit mode first, then enforce |
| 1 | God-file split introduces regressions | Write tests for each file BEFORE splitting |
| 2 | Permission model too granular, hard to manage | Start with 5 roles, ~25 permissions. Add granularity later |
| 2 | CRM module scope creep | MVP: Accounts + Deals + Activities only. No custom objects yet |
| 2 | Tailwind removal breaks AI chat components | Migrate component-by-component with visual regression tests |
| 3 | AI Run Ledger adds latency to AI calls | Async logging via BullMQ queue, not synchronous persistence |
| 3 | Token budget too restrictive, blocks users | Start with soft limits (warn), then hard limits after tuning |
| 4 | Workflow engine complexity explosion | Limit to 20 built-in actions for v1. No custom code nodes |
| 4 | Plugin sandbox escape | Use V8 isolates with resource limits. No filesystem or network by default |

---

## Resource Estimates

| Phase | Duration | Effort (1 dev) | Effort (2 devs) |
|-------|----------|----------------|-----------------|
| Phase 1 | 6 weeks | 6 weeks | 3-4 weeks |
| Phase 2 | 12 weeks | 12 weeks | 6-7 weeks |
| Phase 3 | 12 weeks | 12 weeks | 6-7 weeks |
| Phase 4 | 18 weeks | 18 weeks | 10-12 weeks |
| **Total** | **48 weeks** | **48 weeks** | **25-30 weeks** |

**Solo developer realistic timeline:** ~12 months
**With second developer from Phase 2:** ~8-9 months

---

## Score Progression

```
Phase 0 (Now):     ████████░░░░░░░░░░░░  42/100
Phase 1 (Week 6):  ███████████░░░░░░░░░  55/100
Phase 2 (Week 18): █████████████░░░░░░░  68/100
Phase 3 (Week 30): ███████████████░░░░░  76/100
Phase 4 (Week 48): ████████████████░░░░  80/100
```

---

## Quick Reference: What to Do Next

**Completed (Sprint 1 + 1.5 + audit-verified):**

1. ~~Prisma tenant-scoping extension (43 models, enforce mode, 41 tests)~~ ✅
2. ~~Dead code cleanup (~830 lines)~~ ✅
3. ~~Prisma upgrade 7.3→7.4.2~~ ✅
4. ~~RolesGuard expansion to 52.8% (19/36 controllers)~~ ✅
5. ~~JWT refresh token rotation — 15min access, family-based theft detection~~ ✅
6. ~~Frontend auto-refresh interceptor (401 queue + retry)~~ ✅
7. ~~Password-change / logout token invalidation~~ ✅
8. ~~5 contract tests + CI gate (auth, emails, contacts, briefing, ai-chat)~~ ✅
9. ~~Backend god-files decomposed (auth.service 1376→113, all top 5 split)~~ ✅
10. ~~Frontend god-files eliminated (all <350 lines, modular chat UI)~~ ✅
11. ~~Fix `withoutTenantScopingAsync` (AsyncLocalStorage + lazy PrismaPromise)~~ ✅
12. ~~Remove ngrok from entire codebase~~ ✅
13. ~~Remove bcrypt — argon2id only, all hashes migrated~~ ✅
14. ~~Railway deployment prep (Dockerfile, toml, env template, guide)~~ ✅
15. ~~Environment split: dev `.env` vs prod `.env.railway.template`~~ ✅
16. ~~One-user-one-tenant admin policy enforced~~ ✅

**Remaining Phase 1 gaps (7 items):**

1. CI gate for tenant-scoping tests (1.1) — tests exist, CI doesn't enforce separately
2. Attachment proxy streaming (1.4) — service still buffers via `Buffer.from()` (lines 516, 584)
3. prom-client wiring (1.8) — endpoint works but uses manual string formatting
4. Silent CSRF catch (1.9) — `api-client.ts:55-58` returns empty string silently
5. WebSocket Redis adapter (1.10) — not installed, blocks horizontal scaling
6. Bundle size budget (1.11) — 131 frontend deps, no constraints
7. forwardRef elimination (1.12) — 46 occurrences in 24 files, only 1 fixed

**Priority order for remaining gaps:**

1. Deploy backend to Railway + wire Vercel frontend to Railway URL
2. CI gate for tenant-scoping tests (1.1) — quick win, 30min
3. Silent CSRF catch (1.9) — quick win, 1h
4. Attachment proxy streaming (1.4) — 2-3h, prevents OOM
5. prom-client proper wiring (1.8) — 2h, use Counter/Histogram APIs
6. WebSocket Redis adapter (1.10) — 2h, required before scaling
7. Bundle size budget (1.11) — 1h, add `experimental.outputFileTracingExcludes`
8. forwardRef elimination (1.12) — **8-16h, hard blocker for microservices**

---

*Generated: 2026-03-04 | Updated: 2026-03-05 (post-audit) | Based on Enterprise Platform PRD audit (42/100 baseline)*
*Phase 1 progress: 8/15 exit criteria verified complete + 8 infra/security items (ngrok, bcrypt, Railway, env split, async bugfix, admin policy, contract tests, god-file splits)*
