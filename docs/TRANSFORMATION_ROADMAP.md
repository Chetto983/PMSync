# MailAgent — Enterprise Transformation Roadmap

**Date:** 2026-03-04
**Baseline Score:** 42/100 Enterprise Readiness
**Target Score:** 80/100 (end of Phase 4)
**Based on:** [ENTERPRISE_PLATFORM_PRD.md](./ENTERPRISE_PLATFORM_PRD.md)

---

## Current State Summary

| Dimension | Score | Files | Critical Issues |
|-----------|-------|-------|-----------------|
| Backend | 3.6/5 | 33 controllers, 160 services, 7 guards | 54 files > 500 lines, 24 forwardRef files |
| Frontend | 2.4/5 | 104 components, 28 pages, 10 stores | 13 files > 500 lines, 3 design systems |
| Security | Medium-High risk | tenant.guard on 60 methods, roles.guard on 8 | No Prisma tenant middleware, no RLS |
| Testing | Low coverage | 14 E2E + ~8 unit tests | Zero contract tests |

---

## Phase 1 — Security Hardening & Debt Reduction

**Timeline:** Weeks 1-6
**Goal:** Eliminate P0 security risks, enforce code quality gates
**Score Target:** 42 → 55/100

### Sprint 1 (Weeks 1-2): Tenant Isolation & Auth Hardening

#### 1.1 Prisma Tenant-Scoping Middleware
**Priority:** P0 — Single biggest security risk
**Risk if skipped:** One missed `tenantId` WHERE clause = cross-tenant data breach

| Task | File(s) | Effort |
|------|---------|--------|
| Create Prisma client extension that auto-injects `tenantId` from AsyncLocalStorage | `backend/src/common/prisma/tenant-scoping.extension.ts` (new) | 4h |
| Integrate with existing `CorrelationContextService` | `backend/src/common/services/correlation-context.service.ts` | 2h |
| Add tenant context to all Prisma operations (findMany, findFirst, create, update, delete) | Extension file | 4h |
| Write negative security tests: queries WITHOUT tenant context MUST fail | `backend/src/common/prisma/__tests__/tenant-scoping.spec.ts` (new) | 4h |
| Add CI gate: tenant-scoping tests must pass before merge | `.github/workflows/ci.yml` | 1h |

**Verification:** Run query as Tenant A, verify zero Tenant B records returned. Attempt query without tenant context — must throw `TenantContextRequired` error.

#### 1.2 RolesGuard Coverage Expansion
**Priority:** P0 — Currently only 8 of ~120 controller methods guarded
**Current guard chain:** `JwtAuthGuard → TenantGuard` (60 methods) | `+ RolesGuard` (8 methods) | `+ QuotaGuard + ConsentGuard` (AI only)

| Task | Controller(s) | Methods to Guard |
|------|--------------|-----------------|
| Add `@Roles('admin')` to all admin-only endpoints | `tenants.controller.ts`, `users.controller.ts` | ~8 methods |
| Add `@Roles('admin', 'manager')` to write operations | `contacts.controller.ts`, `emails.controller.ts` | ~15 methods |
| Add `@Roles()` to compliance/audit endpoints | `gdpr.controller.ts`, `consent.controller.ts`, `data-rights.controller.ts`, `legal.controller.ts`, `compliance-dashboard.controller.ts` | ~20 methods |
| Add `@Roles()` to subscription management | `subscription.controller.ts`, `plans.controller.ts`, `billing.controller.ts` | ~12 methods |
| Write integration test: non-admin calling admin endpoint → 403 | `backend/tests/guards/roles-guard.integration.spec.ts` (new) | 3h |

**Target:** RolesGuard on ≥50% of controller methods (from current 7%)

#### 1.3 JWT Refresh Token Rotation
**Priority:** P1 — 24h access token lifetime is excessive

| Task | File(s) | Effort |
|------|---------|--------|
| Reduce access token lifetime to 15 minutes | `backend/src/modules/auth/auth.service.ts` | 1h |
| Implement refresh token rotation (one-time-use refresh tokens) | `backend/src/modules/auth/services/refresh-token.service.ts` (new) | 4h |
| Add `/auth/refresh` endpoint | `backend/src/modules/auth/controllers/auth.controller.ts` | 2h |
| Frontend: auto-refresh via axios interceptor | `frontend/lib/api-client.ts` | 2h |
| Invalidate all refresh tokens on password change | `auth.service.ts` | 1h |

#### 1.4 Fix Attachment Proxy Memory Buffering
**Priority:** P1 — OOM risk on large attachments

| Task | File | Effort |
|------|------|--------|
| Replace `arrayBuffer()` + `Buffer.from()` with piped stream | `backend/src/modules/email/controllers/attachments.controller.ts:128-129` | 2h |
| Add `Content-Length` header passthrough from S3 | Same file | 30m |
| Test with 50MB attachment | Manual test | 30m |

### Sprint 2 (Weeks 3-4): Contract Tests & Code Quality

#### 1.5 Frontend-Backend Contract Tests
**Priority:** P0 — Zero contract tests means silent API drift

| Task | File(s) | Effort |
|------|---------|--------|
| Install Pact or use OpenAPI schema validation | `package.json` (both) | 1h |
| Generate OpenAPI spec from NestJS decorators | `backend/src/main.ts` (already exists via Swagger) | 1h |
| Create contract test runner that validates FE API modules against spec | `tests/contracts/` (new dir) | 4h |
| Write contracts for critical APIs: auth, emails, contacts, calendar, AI | `tests/contracts/*.pact.ts` | 8h |
| Add to CI pipeline as required gate | `.github/workflows/ci.yml` | 1h |

**Critical API contracts to test first:**
1. `POST /api/v1/auth/login` — response shape
2. `GET /api/v1/emails` — pagination envelope
3. `GET /api/v1/contacts` — list + detail shape
4. `POST /api/v1/ai-chat/messages` — streaming response
5. `GET /api/v1/voltagent/briefing` — briefing shape

#### 1.6 God-File Decomposition (Backend)
**Priority:** P1 — 54 files exceed 500-line limit

**Top 5 — split these first:**

| File | Lines | Split Strategy |
|------|-------|---------------|
| `email-sync-back.service.ts` | 1429 | Extract: `sync-delta.service.ts`, `sync-full.service.ts`, `sync-message-mapper.service.ts` |
| `auth.service.ts` | 1212 | Extract: `token.service.ts`, `session.service.ts`, `oauth-flow.service.ts` |
| `emails.controller.ts` | 1183 | Extract: `email-search.controller.ts`, `email-thread.controller.ts`, `email-actions.controller.ts` |
| `email-insights.service.ts` | 1072 | Extract: `insight-generator.service.ts`, `insight-cache.service.ts` |
| `contacts.service.ts` | 1049 | Extract: `contact-sync.service.ts`, `contact-search.service.ts` |

**Rule:** Each resulting file must be < 400 lines (leave room for growth).

#### 1.7 God-File Decomposition (Frontend)
**Priority:** P1 — 13 files exceed 500-line limit

| File | Lines | Split Strategy |
|------|-------|---------------|
| `Calendar.tsx` | 1180 | Extract: `CalendarGrid.tsx`, `CalendarSidebar.tsx`, `CalendarEventModal.tsx`, `CalendarToolbar.tsx` |
| `Contacts.tsx` | 1021 | Extract: `ContactList.tsx`, `ContactListItem.tsx`, `ContactFilters.tsx` |
| `Header.tsx` | 799 | Extract: `SearchBar.tsx`, `UserMenu.tsx`, `NotificationBell.tsx`, `NavTabs.tsx` |
| `ContactDetail.tsx` | 720 | Extract: `ContactDetailTabs.tsx`, `ContactActivityFeed.tsx`, `ContactInfoPanel.tsx` |
| `DashboardContainer.tsx` | 674 | Extract: `DashboardGrid.tsx`, `DashboardWidgetWrapper.tsx` |
| `Settings.tsx` | 661 | Extract: `SettingsSection.tsx` per section |
| `email-ui-store.ts` | 552 | Extract: `email-selection-store.ts`, `email-filter-store.ts` |

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

#### 1.11 Dead Code & Dependency Cleanup
**Priority:** P2

| Task | Details | Effort |
|------|---------|--------|
| Delete dead filter files | `all-exceptions.filter.ts`, `http-exception.filter.ts`, `throttler-exception.filter.ts` | 30m |
| Audit 149 frontend dependencies — remove unused | `frontend/package.json` | 2h |
| Add bundle size budget in CI | `next.config.js` + CI | 2h |
| Run CBC→GCM re-encryption backfill or verify it ran | `backend/scripts/` | 1h |

#### 1.12 forwardRef Burn-Down (Start)
**Priority:** P1 — Blocks future modularization

| Current (24 files) | Target (≤12) | Strategy |
|--------------------|--------------|----------|
| `email.module.ts` (4 refs) | 1 | Replace with EventEmitter2 domain events |
| `email-sync.module.ts` (3 refs) | 1 | Extract shared interfaces to `common/` |
| `auth.module.ts` (3 refs) | 1 | Move user lookup to shared service |
| Worker files (various) | Remove | Inject via module providers, not forwardRef |

### Phase 1 Exit Criteria

- [ ] Prisma tenant-scoping middleware active + negative tests in CI
- [ ] RolesGuard on ≥50% of controller methods
- [ ] JWT access token lifetime ≤ 15 minutes
- [ ] Attachment proxy uses streaming (not buffering)
- [ ] ≥5 critical API contract tests in CI
- [ ] All backend files < 500 lines (top 5 split)
- [ ] All frontend files < 500 lines (top 7 split)
- [ ] `prom-client` metrics endpoint live
- [ ] WebSocket Redis adapter configured
- [ ] Bundle size budget established
- [ ] `forwardRef` reduced from 24 → ≤12 files
- [ ] CSRF error properly surfaced

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

## Quick Reference: What to Do First

**This week:**
1. Create Prisma tenant-scoping extension
2. Write negative security tests
3. Start splitting `email-sync-back.service.ts` (1429 lines)

**This month:**
4. Expand RolesGuard to 50% of controllers
5. Add 5 critical API contract tests
6. Reduce JWT lifetime to 15 minutes
7. Fix attachment proxy streaming
8. Split top 5 backend god-files

**Next month:**
9. Start Permission model design
10. Begin forwardRef burn-down
11. Bundle size budget in CI
12. WebSocket Redis adapter

---

*Generated: 2026-03-04 | Based on Enterprise Platform PRD audit (42/100 baseline)*
