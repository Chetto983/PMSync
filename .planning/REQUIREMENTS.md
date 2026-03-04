# Requirements: PMSync

**Defined:** 2026-03-04
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v4.1 Requirements

Requirements for Security Hardening & Debt Reduction milestone. Enterprise readiness 42 → 55/100.

### Tenant Security

- [ ] **TSEC-01**: Prisma client extension auto-injects tenantId from AsyncLocalStorage on all operations (findMany, findFirst, create, update, delete)
- [ ] **TSEC-02**: Queries without tenant context throw TenantContextRequired error (negative security tests in CI)
- [ ] **TSEC-03**: RolesGuard applied to ≥50% of controller methods (from current 7%)
- [ ] **TSEC-04**: Admin-only endpoints guarded with @Roles('admin') — tenants, users controllers
- [ ] **TSEC-05**: Write operations guarded with @Roles('admin', 'manager') — contacts, emails controllers
- [ ] **TSEC-06**: Compliance/audit endpoints guarded — GDPR, consent, data-rights, legal, compliance-dashboard controllers
- [ ] **TSEC-07**: Integration test: non-admin calling admin endpoint returns 403

### Auth Hardening

- [ ] **AUTH-01**: Access token lifetime reduced to 15 minutes (from 24h)
- [ ] **AUTH-02**: Refresh token rotation with one-time-use refresh tokens
- [ ] **AUTH-03**: /auth/refresh endpoint for token renewal
- [ ] **AUTH-04**: Frontend auto-refresh via axios interceptor on 401
- [ ] **AUTH-05**: All refresh tokens invalidated on password change

### API Safety

- [ ] **APIS-01**: ≥5 critical API contract tests validating FE API modules against OpenAPI spec
- [ ] **APIS-02**: Contract tests run as required CI gate
- [ ] **APIS-03**: Attachment proxy uses piped stream instead of arrayBuffer + Buffer.from
- [ ] **APIS-04**: Content-Length header passthrough from S3 on attachment proxy

### Code Quality — Backend

- [ ] **QUAL-01**: email-sync-back.service.ts (1429 lines) split into sync-delta, sync-full, sync-message-mapper
- [ ] **QUAL-02**: auth.service.ts (1212 lines) split into token, session, oauth-flow services
- [ ] **QUAL-03**: emails.controller.ts (1183 lines) split into email-search, email-thread, email-actions controllers
- [ ] **QUAL-04**: email-insights.service.ts (1072 lines) split into insight-generator, insight-cache services
- [ ] **QUAL-05**: contacts.service.ts (1049 lines) split into contact-sync, contact-search services
- [ ] **QUAL-06**: All resulting backend files < 400 lines

### Code Quality — Frontend

- [ ] **QUAL-07**: Calendar.tsx (1180 lines) split into CalendarGrid, CalendarSidebar, CalendarEventModal, CalendarToolbar
- [ ] **QUAL-08**: Contacts.tsx (1021 lines) split into ContactList, ContactListItem, ContactFilters
- [ ] **QUAL-09**: Header.tsx (799 lines) split into SearchBar, UserMenu, NotificationBell, NavTabs
- [ ] **QUAL-10**: ContactDetail.tsx (720 lines) split into ContactDetailTabs, ContactActivityFeed, ContactInfoPanel
- [ ] **QUAL-11**: DashboardContainer.tsx (674 lines) split into DashboardGrid, DashboardWidgetWrapper
- [ ] **QUAL-12**: Settings.tsx (661 lines) split into per-section SettingsSection components
- [ ] **QUAL-13**: email-ui-store.ts (552 lines) split into email-selection-store, email-filter-store
- [ ] **QUAL-14**: All resulting frontend files < 400 lines

### Structural Debt

- [ ] **DEBT-01**: forwardRef reduced from 24 → ≤12 files
- [ ] **DEBT-02**: email.module.ts forwardRef (4 refs) reduced to 1 via EventEmitter2 domain events
- [ ] **DEBT-03**: email-sync.module.ts forwardRef (3 refs) reduced to 1 via shared interfaces in common/
- [ ] **DEBT-04**: auth.module.ts forwardRef (3 refs) reduced to 1 via shared user lookup service
- [ ] **DEBT-05**: Worker file forwardRef removed via module provider injection

### Observability

- [ ] **OBS-01**: prom-client replaces custom metrics, /metrics endpoint live
- [ ] **OBS-02**: Request duration histogram + active connections gauge middleware
- [ ] **OBS-03**: BullMQ queue depth metrics exposed
- [ ] **OBS-04**: AI cost/token counter via prom-client

### Infrastructure

- [ ] **INFRA-01**: WebSocket Redis adapter (@socket.io/redis-adapter) configured
- [ ] **INFRA-02**: Pub/sub channels scoped per tenant
- [ ] **INFRA-03**: Verified working with 2 backend instances

### Testing

- [ ] **TEST-01**: Tenant-scoping negative tests — cross-tenant query returns zero records, missing context throws error
- [ ] **TEST-02**: RolesGuard integration tests — each role level (admin, manager, member, viewer) verified against guarded endpoints
- [ ] **TEST-03**: Refresh token rotation tests — reuse of consumed token fails, rotation chain works, password-change invalidation works
- [ ] **TEST-04**: Contract tests for ≥5 critical APIs (auth login, emails list, contacts list, AI chat stream, briefing)
- [ ] **TEST-05**: Attachment proxy test with large file (≥50MB) — no OOM, stream completes, Content-Length correct
- [ ] **TEST-06**: Backend god-file split regression tests — write tests for each file BEFORE splitting, verify identical behavior after
- [ ] **TEST-07**: Frontend god-file split visual regression — Playwright screenshot comparison before/after each split
- [ ] **TEST-08**: forwardRef removal regression — NestJS module bootstrap succeeds, all dependency injection chains resolve
- [ ] **TEST-09**: Prometheus /metrics endpoint returns valid prom-client format with expected metric names
- [ ] **TEST-10**: WebSocket Redis adapter test — message published on instance A received by client on instance B
- [ ] **TEST-11**: CSRF error surfacing test — invalid/expired token returns meaningful error, retry logic succeeds
- [ ] **TEST-12**: Bundle size CI gate — build exceeding budget fails CI
- [ ] **TEST-13**: CBC→GCM migration verification — all encrypted fields readable, no CBC-encoded records remain

### Cleanup

- [ ] **CLN-01**: CSRF error properly surfaced (not empty string)
- [ ] **CLN-02**: CSRF token refresh retry logic
- [ ] **CLN-03**: Dead filter files deleted (all-exceptions, http-exception, throttler-exception)
- [ ] **CLN-04**: Frontend dependency audit — unused packages removed
- [ ] **CLN-05**: Bundle size budget in CI
- [ ] **CLN-06**: CBC→GCM re-encryption backfill verified

## Future Requirements

Deferred to v4.2+ (Phase 2 of transformation roadmap).

### Permission Model & RBAC

- **PERM-01**: Permission/Role/RolePermission Prisma models
- **PERM-02**: PermissionsGuard replacing flat RolesGuard
- **PERM-03**: Frontend PermissionGate component + usePermission hook

### CRM Domain

- **CRM-01**: Account, Deal, Pipeline, Stage, Activity models
- **CRM-02**: CRM frontend (accounts list, deals board, pipelines)

### Admin Console

- **ADMIN-01**: User management, role/permission editor, audit log viewer

### Design Unification

- **DESIGN-01**: Consolidate to single design system (MUI), remove Tailwind

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full RBAC/permission model | Phase 2 scope — v4.1 expands RolesGuard, v4.2 adds granular permissions |
| CRM domain module | Phase 2 scope — requires permission model first |
| Admin console | Phase 2 scope — requires RBAC + CRM |
| Tailwind removal | Phase 2 scope — needs visual regression infrastructure |
| OpenTelemetry | Phase 2 scope — Prometheus first in v4.1 |
| AI Run Ledger v2 | Phase 3 scope |
| Workflow engine | Phase 4 scope |
| Plugin system | Phase 4 scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v4.1 requirements: 55 total
- Mapped to phases: 0
- Unmapped: 55 ⚠️

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*
