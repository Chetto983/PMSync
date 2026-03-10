# PMSync — Enterprise Transformation Roadmap

> Living document. Last updated 2026-03-10 after v5.0 better-auth migration and March 2026 architecture audit.

**Date:** 2026-03-04 | **Last Updated:** 2026-03-10
**Architecture Audit Score:** 6.5/10 avg (March 9 audit) | **Target:** 8/10
**Based on:** [AUDIT.md](./AUDIT.md), [technical_overview.md](./technical_overview.md), [ENTERPRISE_PLATFORM_PRD.md](./ENTERPRISE_PLATFORM_PRD.md)

**Companion docs:**
- Auth: [`BACKEND_AUTH_ARCHITECTURE_2026-03-09.md`](../backend/docs/BACKEND_AUTH_ARCHITECTURE_2026-03-09.md)
- Architecture: [`BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md`](../backend/docs/BACKEND_ARCHITECTURE_AUDIT_2026-03-09.md)
- AI Governance: [`BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md`](../backend/docs/BACKEND_AI_TOOL_GOVERNANCE_2026-03-09.md)

---

## Architecture Summary (as of 2026-03-10)

| Dimension | State | Score | Key Facts |
|-----------|-------|-------|-----------|
| **Auth** | better-auth (active) + legacy JWT (dead code) | 7/10 | Session cookies, CSRF, TOTP 2FA, passkeys, social login, orgs |
| **Authorization** | Coarse RBAC via better-auth org roles | 6/10 | owner/admin/member roles; no ABAC, no field-level, no resource policies |
| **Multi-tenancy** | Prisma extension, 43 models scoped | 8/10 | Enforce mode, composite PKs, 41 tests |
| **AI** | Custom Mistral orchestration + pgvector RAG | 6/10 | HITL inconsistent, some tools bypass approval, ledger incomplete |
| **Frontend** | Next.js 16 + React 19, MUI-only | 7/10 | Tailwind base CSS vars only, zero utility classes, 117 deps |
| **Backend** | NestJS 11 modular monolith | 7/10 | 0 forwardRef, 0 circular deps, prom-client wired |
| **Observability** | Prometheus + structured logging + AI ledger | 6/10 | No distributed tracing, no Sentry, metrics endpoint too open |
| **DevOps** | Docker + Railway + GitHub CI | 6/10 | No staging env, no IaC, no secret governance |
| **Testing** | Mixed coverage | 6/10 | 41 tenant tests, 5 contracts, org/admin/safety specs exist |

---

## Completed Milestones

<details>
<summary>v1.0–v4.0 (2026-02-02 to 2026-03-04) — Foundation through Enterprise Stabilization</summary>

- **v1.0** Stability & Code Quality (Phases 1-5)
- **v2.0** Professional Email Client (Phases 6-10)
- **v2.1** Optimization & Polish (Phases 11-13)
- **v3.0** AI Intelligence & Scalability (Phases 1-12): VoltAgent audit, modern chat UI, priority scoring, follow-ups, nested labels, artifact renderers, AI module audit
- **v3.1** GDPR Compliance & Chatbot Enhancement (Phases 13-22): PII tokenization, database encryption, GDPR core, data rights, rich artifacts, AI triage, draft generation
- **v3.2** AI Rebuild & Cleanup (Phases 23-30): SDK foundation, backend pipeline, tools & RAG, chat frontend, VoltAgent deletion
- **v4.0** Enterprise Stabilization (Phases 31-41): Architecture decoupling, API contracts, auth hardening, AI observability, encrypted search, performance, CI hygiene

</details>

<details>
<summary>v4.1 Security Hardening & Debt Reduction (2026-03-04 to 2026-03-06) — 8 phases, 28 plans</summary>

| Phase | What |
|-------|------|
| 42 | Tenant isolation & auth hardening (Prisma scoping, RolesGuard 53%, JWT refresh rotation, 41 tests) |
| 43 | Contract tests & backend god-file splits (5 contract specs, auth.service 1376->113, emails.controller 1183->138) |
| 44 | Frontend god-file splits (all files <350 lines, modular chat UI) |
| 45 | forwardRef burn-down (24->14 files, 46->20 occurrences) |
| 46 | Observability (prom-client wired, HTTP metrics interceptor, queue metrics collector) |
| 47 | Infrastructure & cleanup (ngrok removed, bcrypt->argon2id, Railway prep, env split) |
| 48 | Auth fix 2026 best practice |
| 49 | Zero circular dependencies |

Key outcomes: dead code ~830 lines removed, argon2id only, Railway deployment ready, WebSocket Redis adapter installed.

</details>

<details>
<summary>v5.0 better-auth Migration (2026-03-06 to 2026-03-10) — 13 phases</summary>

| Phase | Status | What |
|-------|--------|------|
| 50 | ✅ | Schema & infrastructure — Prisma models, dual instances, cookie/session config |
| 51 | ✅ | Core email/password auth — signup, signin, verification, password reset |
| 52 | ✅ | NestJS session validation — BetterAuthGuard, TenantGuard, bodyParser fix |
| 53 | ✅ | Frontend auth UI — login/signup pages, useSession hooks, protected routes |
| 54 | ✅ | WebSocket auth — verified better-auth WS handshake (7/7 tests) |
| 55 | ✅ | Social login & MFA — Google OAuth, TOTP 2FA, passkeys, backup codes, onboarding |
| 56 | ✅ | Organizations — org creation, invitations, roles, switching, API enforcement |
| 57 | ✅ | Admin panel — user management, ban/unban, impersonation, session revocation |
| 58 | ✅ | Compliance & cleanup — audit hooks, GDPR updates, legacy deletion |
| 59 | ✅ | Safety hardening — SQL injection fixes, DTO hardening, rate limiting, Swagger lockdown |
| 60 | ✅ | Middleware & auth cleanup — Next.js middleware, auth instance dedup, cookieCache alignment |
| 61 | ✅ | GDPR org compliance — data export with org/auth tables, orphaned org cleanup |
| 62 | 🚧 | Auth audit remediation — OAuth token encryption, proxy headers, org context consistency |

</details>

---

## Current State: What's Done, What's Not

### Auth (better-auth — Phase 50-62)

| Capability | Status |
|------------|--------|
| Email/password signup + signin | ✅ |
| Email verification | ✅ |
| Password reset | ✅ |
| Session-cookie auth (httpOnly, CSRF) | ✅ |
| NestJS BetterAuthGuard (global) | ✅ |
| TenantGuard -> org-based tenant scoping | ✅ |
| Google OAuth social login | ✅ |
| TOTP 2FA + backup codes | ✅ |
| Passkey (WebAuthn) | ✅ |
| Organizations (create, invite, roles, switch) | ✅ |
| Admin panel (ban, impersonate, revoke sessions) | ✅ |
| Onboarding wizard (name, workspace, email, avatar, MFA) | ✅ |
| GDPR data export / erasure with org tables | ✅ |
| Legacy JWT code removal | ✅ (Phase 59) |
| OAuth token encryption in DB | 🚧 Phase 62 |
| Auth proxy Set-Cookie passthrough fix | 🚧 Phase 62 |
| Org context consistency (HTTP + WS + UI) | 🚧 Phase 62 |

### Security Hardening (Phase 59)

| Capability | Status |
|------------|--------|
| Prisma.raw() vector injection validation | ✅ |
| DTO string length bounds | ✅ |
| Auth DB index optimization | ✅ |
| Rate limiting overhaul (no @SkipThrottle leaks) | ✅ |
| AI health endpoint restricted to admin | ✅ |
| Swagger disabled in production | ✅ |
| .env removed from git history | ✅ |
| Secrets rotated | ✅ |

### Design System

| Capability | Status |
|------------|--------|
| MUI as sole component library | ✅ |
| Radix/shadcn packages removed (22 packages) | ✅ |
| Tailwind utility classes removed from all .tsx | ✅ |
| ChatThemeBridge maps MUI theme -> CSS vars | ✅ |
| tailwindcss kept for `@tailwind base` CSS var injection only | ✅ |
| Zero Tailwind utility classes in source | ✅ |

### Infrastructure

| Capability | Status |
|------------|--------|
| WebSocket Redis adapter (`@socket.io/redis-adapter`) | ✅ |
| prom-client with HTTP metrics interceptor + queue collector | ✅ |
| Railway deployment (Dockerfile, toml, env template) | ✅ |
| forwardRef burn-down | ✅ 0 runtime calls (14 files have comments only) |
| Circular dependency | ✅ 0 cycles (extracted `getRequestIp` to `common/utils/request.utils.ts`) |
| Bundle size budget | ❌ Not established |
| Distributed tracing (OpenTelemetry) | ❌ Not started |
| Staging environment | ❌ Not established |

---

## Phase 1 — Remaining Gaps (from v4.1)

Most Phase 1 items are complete. Remaining gaps:

| Item | Priority | Status | Effort |
|------|----------|--------|--------|
| forwardRef elimination | ✅ | 0 runtime calls (comments only remain) | Done |
| File-level circular dep (`better-auth.instance` <-> `audit-hooks`) | ✅ | Extracted to `common/utils/request.utils.ts` | Done |
| Bundle size budget in CI | P2 | Not started | 1h |
| Attachment proxy full streaming | P2 | Controller streams, service still buffers | 2h |
| Frontend dependency audit (117 deps) | P2 | Not started | 2h |

---

## Phase 2 — Enterprise Foundation (REVISED)

**Goal:** Authorization depth, CRM domain, observability
**Architecture audit priority:** "governance before topology"

### 2.1 Organization-Aware Authorization

> Replaces original 2.1/2.2 (custom Permission model). better-auth organization plugin already provides owner/admin/member roles. Build on it rather than replacing it.

| Task | Effort |
|------|--------|
| Extend better-auth org roles with resource-scoped permissions | 4h |
| Create `@RequirePermission('contacts.write')` decorator layered on org role | 3h |
| Permission caching (Redis, 5min TTL) | 3h |
| Frontend `PermissionGate` component + `usePermission()` hook | 4h |
| Wrap all write/delete actions in PermissionGate | 8h |
| Route-level permission guards (redirect if no permission) | 3h |

### 2.2 AI Control Plane Hardening

> AUDIT.md critical finding: "HITL execution path can approve actions that cannot actually run" + "several AI mutating tools bypass approval entirely."

| Task | Effort |
|------|--------|
| Unify AI approval semantics for all mutating tools | 4h |
| Make HITL execute the same tool implementations used by chat runtime | 4h |
| Fix action taxonomy (e.g., `delete_event` -> `SCHEDULE_MEETING` mismatch) | 2h |
| Define AI safety policy: allowed tools, approval classes, auditability | 3h |
| Complete AI ledger telemetry accuracy | 4h |
| Consolidated circuit breaker (replace duplicates in `ai/` and `ai-chat/`) | 4h |

### 2.3 CRM Backend

**New entities:** Account, Deal, Activity, Pipeline, Stage

| Task | Effort |
|------|--------|
| CRM Prisma models (Account, Deal, Pipeline, Stage, Activity) | 4h |
| `CrmModule` with controllers + services | 16h |
| Link existing contacts to accounts (M:N) | 2h |
| Auto-generate activities from email sends/receives | 4h |
| Auto-generate activities from calendar events | 3h |

### 2.4 CRM Frontend

| Task | Effort |
|------|--------|
| CRM query hooks (`frontend/hooks/queries/use-crm.ts`) | 4h |
| Accounts list page with DataTable | 6h |
| Account detail page with timeline | 6h |
| Deals board (Kanban view) | 8h |
| Pipeline configuration | 4h |
| Activity timeline component | 4h |
| CRM navigation + translations (en.ts + it.ts) | 4h |

### 2.5 OpenTelemetry Integration

| Task | Effort |
|------|--------|
| Install `@opentelemetry/sdk-node` + exporters | 1h |
| OTel bootstrap file | 4h |
| Trace context on HTTP requests, BullMQ jobs, AI calls | 7h |
| Forward `traceId` to frontend via response headers | 1h |

### Phase 2 Exit Criteria

- [ ] Organization-scoped permissions with `@RequirePermission` on all controllers
- [ ] Frontend `PermissionGate` wrapping all write/delete actions
- [ ] AI control plane: all mutating tools require approval, HITL executes real tool code
- [ ] AI ledger telemetry 100% accurate
- [ ] CRM module with Accounts, Deals, Activities, Pipelines
- [ ] OpenTelemetry traces across HTTP -> Queue -> AI

---

## Phase 3 — AI Governance & Observability

**Goal:** Full AI auditability, cost transparency, operational dashboards

### 3.1 Unified AI Run Ledger v2

| Task | Effort |
|------|--------|
| `AiRun` Prisma model (run, steps, tools, costs, approvals, traces) | 3h |
| `AiRunLedgerService` v2 with unified tracking | 8h |
| Link every tool call to a run with OTel trace ID | 6h |
| Token budget enforcement per request | 4h |
| Per-user daily cost cap with configurable threshold | 4h |

### 3.2 Cost Transparency UI

| Task | Effort |
|------|--------|
| AI cost per interaction in chat | 3h |
| Cost summary widget on dashboard | 4h |
| Cost breakdown in admin console | 6h |
| Budget alert notifications | 4h |

### 3.3 Operations Dashboard

| Task | Effort |
|------|--------|
| Queue health overview (active, waiting, failed per queue) | 6h |
| Email sync status per provider/tenant | 4h |
| AI failure categorization (rate limit, model error, budget, timeout) | 4h |
| p95 latency charts | 8h |

### 3.4 HITL Improvements

| Task | Effort |
|------|--------|
| Push notification for pending approvals | 4h |
| Approval timeout with configurable auto-reject | 3h |
| Approval audit trail linked to AI Run Ledger | 2h |

### 3.5 AI Action Rollback Registry

| Task | Effort |
|------|--------|
| Rollback registry for non-email AI actions | 8h |
| Undo UI in chat interface | 4h |
| Compensation actions (e.g., un-create a contact) | 6h |

### 3.6 WCAG AA Accessibility Audit

| Task | Effort |
|------|--------|
| axe-core audit on all pages | 4h |
| Fix critical a11y issues (focus, aria, contrast) | 12h |
| Keyboard navigation for DataTable, Pipeline board | 6h |

### Phase 3 Exit Criteria

- [ ] Unified AI Run Ledger tracking 100% of AI operations
- [ ] Token budget cap per request + per-user daily cap
- [ ] Per-interaction cost visible in chat UI
- [ ] Operations dashboard with queue health, sync status, failure categories
- [ ] HITL push notifications + timeout + audit trail
- [ ] Rollback registry for non-email AI actions
- [ ] WCAG AA compliance on critical paths

---

## Phase 4 — Marketplace & Advanced Automation

**Goal:** Workflow builder, plugin system, white-label, marketplace beta

### 4.1 Workflow Engine (Backend)

| Task | Effort |
|------|--------|
| Workflow Prisma models (Workflow, WorkflowStep, WorkflowRun) | 3h |
| Durable state machine with retries + compensation | 16h |
| Canonical action registry with typed I/O schemas | 6h |
| Policy engine integration per workflow step | 4h |
| Workflow CRUD API + execution API with real-time status | 10h |

### 4.2 Workflow Builder UI

| Task | Effort |
|------|--------|
| Visual node editor using `@xyflow/react` | 16h |
| Action node palette (email, AI, CRM, calendar, webhook) | 6h |
| Conditional branching nodes | 4h |
| Workflow run history + execution debugger | 8h |
| Template library (pre-built workflows) | 4h |

### 4.3 Extension Point API

| Task | Effort |
|------|--------|
| Plugin manifest schema (capabilities, scopes, resource access) | 4h |
| Plugin registry service | 8h |
| Extension contracts: custom tools, CRM fields, workflow actions | 12h |
| Plugin sandbox (V8 isolate or WASM) | 16h |
| Plugin CRUD API + install/uninstall lifecycle | 6h |

### 4.4 Custom CRM Fields

| Task | Effort |
|------|--------|
| Custom field definition model | 2h |
| Custom field value storage (JSONB + indexed) | 4h |
| Custom field admin UI + rendering in CRM detail pages | 10h |
| Custom field filtering in DataTable | 4h |

### 4.5 White-Label Theming

| Task | Effort |
|------|--------|
| Tenant branding model (logo, colors, favicon) | 2h |
| Dynamic MUI theme generation from tenant config | 4h |
| Email template branding | 4h |
| Login page branding + custom domain prep | 3h |

### 4.6 Marketplace Infrastructure

| Task | Effort |
|------|--------|
| App store backend (listing, install, rate, review) | 16h |
| App store frontend (browse, search, install) | 12h |
| Plugin certification pipeline | 8h |

### Phase 4 Exit Criteria

- [ ] Workflow builder with visual editor, execution engine, templates
- [ ] Plugin system with sandboxed execution + manifest validation
- [ ] Custom CRM fields (create, render, filter)
- [ ] White-label theming per tenant
- [ ] Marketplace beta with >=3 internal plugins

---

## Risk Matrix

| Phase | Key Risk | Mitigation |
|-------|----------|------------|
| 2 | Permission model too granular | Build on better-auth org roles, add resource permissions incrementally |
| 2 | AI control plane hardening breaks existing flows | Test each tool individually, keep soft limits initially |
| 2 | CRM module scope creep | MVP: Accounts + Deals + Activities only, no custom objects |
| 3 | AI Run Ledger adds latency | Async logging via BullMQ queue |
| 3 | Token budget too restrictive | Soft limits (warn) first, hard limits after tuning |
| 4 | Workflow engine complexity | Limit to 20 built-in actions, no custom code nodes |
| 4 | Plugin sandbox escape | V8 isolates with resource limits, no fs/network by default |

---

## Development Process (from CLAUDE.md)

**Tech Stack:**
- Backend: NestJS 11, Prisma + PostgreSQL, BullMQ + Redis, Mistral AI + pgvector, Socket.IO
- Frontend: Next.js 16 + React 19, TanStack Query + Zustand, MUI (no Tailwind utilities)
- Auth: better-auth session cookies (active), legacy JWT (being removed)

**Mandatory validations after every edit:**
- Frontend: `cd frontend && npx tsc --noEmit`
- Backend: `cd backend && npx tsc --noEmit`
- Lint: `npm run lint:win`

**Frontend procedure:** Translations (en.ts + it.ts) -> Query hooks -> Component -> Validate

**Backend rules:**
- Every query MUST include `tenantId` (enforced by Prisma extension)
- Provider pattern: Interface -> Factory -> Implementation
- Handle P2002 (unique) and P2034 (deadlock) with exponential backoff

**Code quality:**
- Max 500 lines per file
- Never hardcode secrets
- Never save working files to root
- MUI theme `sx` props only, no hardcoded CSS

---

## What To Do Next (Priority Order)

### Immediate: Close v5.0 (Phase 62)

1. **Phase 62 — Auth Audit Remediation** — OAuth token encryption, proxy header passthrough, org context consistency, verification UX alignment

### Then: v5.1 Production Validation (Phases 63-66)

2. **Phase 63 — Production Deployment** — Railway backend + Vercel frontend, env provisioning, DNS, CORS/cookie domain config
3. **Phase 64 — E2E Smoke Suite** — Playwright tests for critical paths (register, onboard, connect provider, sync, AI chat)
4. **Phase 65 — Production Observability** — Sentry error tracking, Prometheus scraping target, health check alerting, log aggregation
5. **Phase 66 — Production Hardening** — CSP headers, rate limit tuning, cookie domain/SameSite config, CORS lockdown to prod domains

### Then: Phase 1 Remaining Gaps

6. Bundle size budget in CI
7. Frontend dependency audit (117 deps -> target <100)

### Then: Phase 2 Start

9. Organization-scoped permissions (`@RequirePermission`)
10. AI control plane hardening (AUDIT.md critical findings)
11. CRM module (Accounts, Deals, Activities)
12. OpenTelemetry integration

---

*Generated: 2026-03-04 | Updated: 2026-03-10*
*v4.1 completed: 2026-03-06 (8 phases, 28 plans, 65/66 requirements)*
*v5.0 in progress: Phases 50-61 complete, Phase 62 not started*
*Architecture audit: March 9, 2026 — score 6.5/10 avg, target 8/10*
