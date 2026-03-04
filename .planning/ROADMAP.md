# Roadmap: PMSync

## Milestones

- ✅ **v1.0 Stability & Code Quality** - Phases 1-5 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** - Phases 6-10 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** - Phases 11-13 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** - Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** - Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** - Phases 23-30 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** - Phases 31-41 (shipped 2026-03-04)
- 🚧 **v4.1 Security Hardening & Debt Reduction** - Phases 42-47 (in progress)

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

### 🚧 v4.1 Security Hardening & Debt Reduction (In Progress)

**Milestone Goal:** Eliminate P0 security risks, enforce code quality gates, reduce structural debt. Enterprise readiness 42 to 55/100.

**Phase Numbering:**
- Integer phases (42, 43, ...): Planned milestone work
- Decimal phases (42.1, 42.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 42: Tenant Isolation & Auth Hardening** - ~~Prisma tenant-scoping~~ (DONE), RolesGuard expansion, JWT refresh rotation
- [ ] **Phase 43: Contract Tests & Backend God-File Splits** - API contract tests in CI, attachment streaming, 5 backend god-files decomposed
- [ ] **Phase 44: Frontend God-File Splits** - 7 frontend god-files decomposed with visual regression verification
- [ ] **Phase 45: forwardRef Burn-Down** - Reduce forwardRef from 24 to ≤12 via domain events and shared interfaces
- [ ] **Phase 46: Observability** - Prometheus metrics with prom-client, queue depth, AI cost counters
- [ ] **Phase 47: Infrastructure & Cleanup** - WebSocket Redis adapter, CSRF fix, dead code removal, bundle budget

## Phase Details

### Phase 42: Tenant Isolation & Auth Hardening
**Goal**: Every database query is tenant-scoped by default; users get short-lived tokens with transparent refresh
**Depends on**: Nothing (first phase of v4.1)
**Requirements**: TSEC-01, TSEC-02, TSEC-03, TSEC-04, TSEC-05, TSEC-06, TSEC-07, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. A query executed without tenant context throws TenantContextRequired -- no silent data leak possible
  2. A non-admin user calling an admin endpoint receives 403 Forbidden
  3. Access tokens expire after 15 minutes; the frontend seamlessly refreshes without user interaction
  4. Reusing a consumed refresh token fails and invalidates the entire token family
  5. Changing password invalidates all active sessions across all devices
**Plans**: 3 plans
Plans:
- [ ] 42-02-PLAN.md -- RolesGuard expansion to >=50% controllers + integration tests
- [ ] 42-03-PLAN.md -- Refresh token rotation + dual cookie + frontend interceptor
- [ ] 42-04-PLAN.md -- Negative security tests + password-change invalidation

**Completed work (pre-plan, Sprint 1):**
  - Prisma 7.3.0 → 7.4.2 upgrade
  - Dead code cleanup (~830 lines removed)
  - Tenant-scoping extension created (42 models, 5 composite PK)
  - AUDIT_MODE flipped to enforce (TSEC-01, TSEC-02 done)
  - 12 cron/scheduler services wrapped with withoutTenantScopingAsync
  - 13 unit tests passing

### Phase 43: Contract Tests & Backend God-File Splits
**Goal**: Frontend-backend API contracts are CI-enforced; backend god-files are decomposed below 400 lines with zero behavior change
**Depends on**: Phase 42
**Requirements**: APIS-01, APIS-02, APIS-03, APIS-04, QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. CI fails if a backend API response shape diverges from the OpenAPI spec consumed by frontend API modules
  2. Downloading a 50MB+ attachment completes without OOM -- memory stays flat (piped stream)
  3. Each of the 5 split backend services has its own test file that passes before AND after the split
  4. No backend file in the split set exceeds 400 lines
**Plans**: TBD

### Phase 44: Frontend God-File Splits
**Goal**: 7 frontend god-files decomposed into focused components below 400 lines with pixel-identical rendering
**Depends on**: Phase 42 (independent of Phase 43 backend splits)
**Requirements**: QUAL-07, QUAL-08, QUAL-09, QUAL-10, QUAL-11, QUAL-12, QUAL-13, QUAL-14, TEST-07
**Success Criteria** (what must be TRUE):
  1. Calendar, Contacts, Header, ContactDetail, Dashboard, Settings pages render identically (Playwright screenshot diff < 0.5%)
  2. No frontend file in the split set exceeds 400 lines
  3. email-ui-store split preserves all existing store consumers without API changes
**Plans**: TBD

### Phase 45: forwardRef Burn-Down
**Goal**: NestJS circular dependency count reduced from 24 to ≤12 files via domain events, shared interfaces, and provider injection
**Depends on**: Phase 43 (backend splits may affect module boundaries)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05, TEST-08
**Success Criteria** (what must be TRUE):
  1. `grep -r forwardRef backend/src | wc -l` returns twelve or fewer hits
  2. NestJS application bootstraps successfully with zero circular dependency warnings
  3. All existing E2E and integration tests pass without modification
**Plans**: TBD

### Phase 46: Observability
**Goal**: Production metrics available via standard Prometheus /metrics endpoint covering HTTP, queues, and AI costs
**Depends on**: Phase 42 (needs stable auth for metrics endpoint access)
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04, TEST-09
**Success Criteria** (what must be TRUE):
  1. GET /metrics returns valid Prometheus exposition format parseable by prometheus server
  2. Request duration histogram shows p50/p95/p99 latencies per route
  3. BullMQ queue depths for all queues visible in metrics output
  4. AI token usage and cost counters increment on every LLM call
**Plans**: TBD

### Phase 47: Infrastructure & Cleanup
**Goal**: WebSocket scales horizontally via Redis adapter; CSRF errors are visible; dead code and unused deps removed with CI bundle budget
**Depends on**: Phase 46 (metrics should be in place before infra changes)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06, TEST-10, TEST-11, TEST-12, TEST-13
**Success Criteria** (what must be TRUE):
  1. WebSocket message published on backend instance A is received by a client connected to instance B
  2. An expired CSRF token returns a meaningful error message (not empty string) and retry succeeds
  3. `npm ls --all` shows zero unused production dependencies; bundle size stays within CI budget
  4. Zero CBC-encoded records remain in the database -- all re-encrypted to GCM
  5. Dead filter files (all-exceptions, http-exception, throttler-exception) are deleted
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 42 -> 43 -> 44 -> 45 -> 46 -> 47

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 31. Foundation & Stability Verification | v4.0 | 2/2 | Complete | 2026-03-03 |
| 32. Architecture Decoupling | v4.0 | 4/4 | Complete | 2026-03-03 |
| 33. API Contract Standardization | v4.0 | 3/3 | Complete | 2026-03-03 |
| 34. Auth Security Hardening | v4.0 | 3/3 | Complete | 2026-03-04 |
| 35. AI Observability & Permissions | v4.0 | 2/2 | Complete | 2026-03-04 |
| 36. Encrypted Search | v4.0 | 2/2 | Complete | 2026-03-04 |
| 37. Performance & Debt Closure | v4.0 | 2/2 | Complete | 2026-03-04 |
| 38. Attachment Proxy Path Fix | v4.0 | 1/1 | Complete | 2026-03-04 |
| 39. Code Quality & CI Hygiene | v4.0 | 1/1 | Complete | 2026-03-04 |
| 40. Fix CI Regressions | v4.0 | 1/1 | Complete | 2026-03-04 |
| 41. Backend Code Hygiene | v4.0 | 1/1 | Complete | 2026-03-04 |
| 42. Tenant Isolation & Auth Hardening | v4.1 | 1/4 | In progress | - |
| 43. Contract Tests & Backend God-File Splits | v4.1 | 0/TBD | Not started | - |
| 44. Frontend God-File Splits | v4.1 | 0/TBD | Not started | - |
| 45. forwardRef Burn-Down | v4.1 | 0/TBD | Not started | - |
| 46. Observability | v4.1 | 0/TBD | Not started | - |
| 47. Infrastructure & Cleanup | v4.1 | 0/TBD | Not started | - |

**v4.1 Requirement Status (Phase 42):**
- ✅ TSEC-01: Prisma extension auto-injects tenantId (done)
- ✅ TSEC-02: Queries without context throw TenantContextRequiredError (enforce mode active)
- ⬜ TSEC-03..06: RolesGuard expansion (plan 42-02)
- ⬜ TSEC-07: Integration test non-admin → 403 (plan 42-02)
- ⬜ AUTH-01..05: Refresh token rotation + short-lived access tokens (plan 42-03)
- ⬜ TEST-01..03: Negative security tests (plan 42-04)

---
*Roadmap created: 2026-02-09*
*v4.0 completed: 2026-03-04 -- 11 phases, 22 plans, 19/19 requirements*
*v4.1 roadmap added: 2026-03-04 -- 6 phases, 61 requirements mapped*
*Phase 42 tenant-scoping work started: 2026-03-04 -- TSEC-01/02 complete, enforce mode active*
*Phase 42 plans created: 2026-03-04 -- 3 plans (42-02, 42-03, 42-04) in 2 waves*
