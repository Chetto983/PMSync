# Requirements: PMSync

**Defined:** 2026-03-04
**Core Value:** The best professional AI mail client — fast, intelligent, and secure

## v4.1 Requirements

Requirements for Security Hardening & Debt Reduction milestone. Enterprise readiness 42 → 55/100.

### Tenant Security

- [x] **TSEC-01**: Prisma client extension auto-injects tenantId from AsyncLocalStorage on all operations (findMany, findFirst, create, update, delete)
- [x] **TSEC-02**: Queries without tenant context throw TenantContextRequired error (negative security tests in CI)
- [x] **TSEC-03**: RolesGuard applied to ≥50% of controller methods (from current 7%)
- [x] **TSEC-04**: Admin-only endpoints guarded with @Roles('admin') — tenants, users controllers
- [x] **TSEC-05**: Write operations guarded with @Roles('admin', 'manager') — contacts, emails controllers
- [x] **TSEC-06**: Compliance/audit endpoints guarded — GDPR, consent, data-rights, legal, compliance-dashboard controllers
- [x] **TSEC-07**: Integration test: non-admin calling admin endpoint returns 403

### Auth Hardening

- [x] **AUTH-01**: Access token lifetime reduced to 15 minutes (from 24h)
- [x] **AUTH-02**: Refresh token rotation with one-time-use refresh tokens
- [x] **AUTH-03**: /auth/refresh endpoint for token renewal
- [x] **AUTH-04**: Frontend auto-refresh via axios interceptor on 401
- [x] **AUTH-05**: All refresh tokens invalidated on password change

### API Safety

- [x] **APIS-01**: ≥5 critical API contract tests validating FE API modules against OpenAPI spec
- [x] **APIS-02**: Contract tests run as required CI gate
- [x] **APIS-03**: Attachment proxy uses piped stream instead of arrayBuffer + Buffer.from
- [x] **APIS-04**: Content-Length header passthrough from S3 on attachment proxy

### Code Quality — Backend

- [x] **QUAL-01**: email-sync-back.service.ts (1429 lines) split into gmail-sync-back, microsoft-sync-back, imap-sync-back, sync-back-orchestrator (provider-based split per research)
- [x] **QUAL-02**: auth.service.ts (1376 lines) split into auth-registration, auth-login, auth-token, auth-password-reset (domain-based split per research)
- [ ] **QUAL-03**: emails.controller.ts (1188 lines) split into email-query, email-calendar-invite, email-actions controllers
- [ ] **QUAL-04**: email-insights.service.ts (1072 lines) split into email-analysis, email-compose, insight-utils services
- [ ] **QUAL-05**: contacts.service.ts (1049 lines) split into contact-crud, contact-provider-ops, contact-sync services
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

- [x] **TEST-01**: Tenant-scoping negative tests — cross-tenant query returns zero records, missing context throws error
- [x] **TEST-02**: RolesGuard integration tests — each role level (admin, manager, member, viewer) verified against guarded endpoints
- [x] **TEST-03**: Refresh token rotation tests — reuse of consumed token fails, rotation chain works, password-change invalidation works
- [x] **TEST-04**: Contract tests for ≥5 critical APIs (auth login, emails list, contacts list, AI chat stream, briefing)
- [ ] **TEST-05**: Attachment proxy test with large file (≥50MB) — no OOM, stream completes, Content-Length correct (NOTE: automated test verifies streaming mechanism; 50MB memory profiling is manual verification)
- [x] **TEST-06**: Backend god-file split regression tests — write tests for each file BEFORE splitting, verify identical behavior after
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

| Requirement | Phase | Status |
|-------------|-------|--------|
| TSEC-01 | Phase 42 | Complete |
| TSEC-02 | Phase 42 | Complete |
| TSEC-03 | Phase 42 | Complete |
| TSEC-04 | Phase 42 | Complete |
| TSEC-05 | Phase 42 | Complete |
| TSEC-06 | Phase 42 | Complete |
| TSEC-07 | Phase 42 | Complete |
| AUTH-01 | Phase 42 | Complete |
| AUTH-02 | Phase 42 | Complete |
| AUTH-03 | Phase 42 | Complete |
| AUTH-04 | Phase 42 | Complete |
| AUTH-05 | Phase 42 | Complete |
| APIS-01 | Phase 43 | Complete |
| APIS-02 | Phase 43 | Complete |
| APIS-03 | Phase 43 | Complete |
| APIS-04 | Phase 43 | Complete |
| QUAL-01 | Phase 43 | Complete |
| QUAL-02 | Phase 43 | Complete |
| QUAL-03 | Phase 43 | Pending |
| QUAL-04 | Phase 43 | Pending |
| QUAL-05 | Phase 43 | Pending |
| QUAL-06 | Phase 43 | Pending |
| QUAL-07 | Phase 44 | Pending |
| QUAL-08 | Phase 44 | Pending |
| QUAL-09 | Phase 44 | Pending |
| QUAL-10 | Phase 44 | Pending |
| QUAL-11 | Phase 44 | Pending |
| QUAL-12 | Phase 44 | Pending |
| QUAL-13 | Phase 44 | Pending |
| QUAL-14 | Phase 44 | Pending |
| DEBT-01 | Phase 45 | Pending |
| DEBT-02 | Phase 45 | Pending |
| DEBT-03 | Phase 45 | Pending |
| DEBT-04 | Phase 45 | Pending |
| DEBT-05 | Phase 45 | Pending |
| OBS-01 | Phase 46 | Pending |
| OBS-02 | Phase 46 | Pending |
| OBS-03 | Phase 46 | Pending |
| OBS-04 | Phase 46 | Pending |
| INFRA-01 | Phase 47 | Pending |
| INFRA-02 | Phase 47 | Pending |
| INFRA-03 | Phase 47 | Pending |
| TEST-01 | Phase 42 | Complete |
| TEST-02 | Phase 42 | Complete |
| TEST-03 | Phase 42 | Complete |
| TEST-04 | Phase 43 | Complete |
| TEST-05 | Phase 43 | Pending |
| TEST-06 | Phase 43 | Complete |
| TEST-07 | Phase 44 | Pending |
| TEST-08 | Phase 45 | Pending |
| TEST-09 | Phase 46 | Pending |
| TEST-10 | Phase 47 | Pending |
| TEST-11 | Phase 47 | Pending |
| TEST-12 | Phase 47 | Pending |
| TEST-13 | Phase 47 | Pending |
| CLN-01 | Phase 47 | Pending |
| CLN-02 | Phase 47 | Pending |
| CLN-03 | Phase 47 | Pending |
| CLN-04 | Phase 47 | Pending |
| CLN-05 | Phase 47 | Pending |
| CLN-06 | Phase 47 | Pending |

**Coverage:**
- v4.1 requirements: 61 total
- Mapped to phases: 61
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-05 -- QUAL-01..05 descriptions updated to match research-determined split names*
