# Requirements: MailAgent v4.0 Enterprise Stabilization

**Defined:** 2026-03-03
**Core Value:** The best professional AI mail client -- fast, intelligent, and secure
**Source:** Enterprise Platform PRD Phase 1 (Stabilization & Debt Reduction) + v3.2 carry-forward items

## v4.0 Requirements

Requirements for enterprise stabilization. Each maps to roadmap phases.

### Architecture

- [x] **ARCH-01**: Circular dependencies reduced from 17 forwardRef edges to <=5 using event bus, interface injection, and ToolRegistry
- [x] **ARCH-02**: Typed domain event contracts defined and wired (EmailSynced, ProviderConnected, ContactUpdated, CalendarIcsDetected)
- [x] **ARCH-03**: dependency-cruiser enforces module boundary rules in CI, blocking forbidden imports on PR merge

### API Contracts

- [x] **API-01**: Global ResponseEnvelopeInterceptor wraps all success responses in `{ data, meta: { requestId, timestamp } }` with @SkipEnvelope for streaming
- [x] **API-02**: Unified ApiExceptionFilter emits `{ error: { code, message, details }, meta }` with machine-readable error codes per domain
- [x] **API-03**: Global API prefix `api/v1` enforced via setGlobalPrefix, manual prefixes removed from 8 controllers
- [x] **API-04**: CorrelationInterceptor registered globally, correlation IDs propagated through BullMQ jobs and AI run records
- [x] **API-05**: OpenAPI spec linted via Spectral in CI, frontend types generated via openapi-typescript

### Security

- [ ] **SEC-01**: Frontend auth migrated from localStorage JWT to httpOnly secure cookies with dual-mode transition period
- [ ] **SEC-02**: HMAC-SHA256 blind indexes on `from` field for exact-match sender lookup, with backfill job and dual-path search
- [ ] **SEC-03**: All encryption paths standardized to AES-GCM, legacy AES-CBC usage audited and migrated

### AI Observability

- [ ] **AIOBS-01**: AiRunLedger Prisma model captures runType, model, token counts, estimatedCostUsd, latencyMs, toolCallCount, hitlRequired, requestId
- [ ] **AIOBS-02**: Fire-and-forget telemetry wiring across AiChatService, BriefingService, FollowUpDetectionService, DraftGenerationService
- [ ] **AIOBS-03**: GET /api/v1/ai/runs and /cost-summary endpoints with tenant and date filters
- [ ] **AIOBS-04**: Permission taxonomy documented (resource:action pairs) with PolicyService interface defined

### Performance & Debt

- [ ] **PERF-01**: Lighthouse LCP <2.5s and TTI <3.5s on email list page (production build, 4G throttled)
- [ ] **PERF-02**: All 7 deferred v3.1 bugs resolved (RC-A1/A8 race conditions + BUG-REPORT items)
- [x] **PERF-03**: Phase 28 gap closure complete (chat 403 fix, dead polling disabled, E2E mobile tests passing)
- [ ] **PERF-04**: Silent frontend API fallbacks replaced with explicit degraded states and telemetry

## v4.1+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enterprise Foundation (PRD Phase 2)

- **RBAC-01**: Policy-based authorization service (RBAC+ABAC) with fine-grained object/action/field permissions
- **RBAC-02**: Workspace/org model and tenant switching UX
- **CRM-01**: CRM canonical objects (Account, Deal, Activity) with timeline and saved views
- **CRM-02**: Object-centric activity feed and global timeline
- **CONTRACT-01**: Pact contract testing pipeline with broker infrastructure and CI integration

### AI Governance (PRD Phase 3)

- **OTEL-01**: OpenTelemetry distributed tracing (API -> queue -> worker -> AI tool call)
- **AIUI-01**: AI Run Ledger UI (run timeline, cost panel, replay)
- **AIPOL-01**: Deterministic workflow mode for high-stakes automations
- **AIPOL-02**: Policy gates per tool/action with mandatory pre/post-conditions

### Advanced (PRD Phase 4)

- **WF-01**: Workflow builder with reusable templates
- **MKTPL-01**: Plugin/marketplace extension framework
- **I18N-01**: Full locale pack strategy + enterprise i18n
- **BRAND-01**: Tenant branding profile (logo, palette, typography)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full ABAC policy engine | Needs CRM object model first (PRD Phase 2); premature without domain objects |
| AI Run Ledger UI | No production data yet; collect first, then design the right UI |
| OpenTelemetry tracing | Wire CorrelationInterceptor first; full OTel needs infrastructure (Jaeger/Tempo) |
| Database RLS | Prisma 7 + PostgreSQL RLS interaction is problematic; keep TenantGuard + add negative tests |
| Subject field encryption | Substring search on subject is critical for UX; HMAC only supports exact-match |
| Compliance evidence pipeline | Document controls first; build pipeline when pursuing SOC2 certification |
| Mobile app | Web-first, responsive |
| Offline support | Service worker complexity deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 32 | Complete |
| ARCH-02 | Phase 32 | Complete |
| ARCH-03 | Phase 32 | Complete |
| API-01 | Phase 33 | Complete |
| API-02 | Phase 33 | Complete |
| API-03 | Phase 33 | Complete |
| API-04 | Phase 33 | Complete |
| API-05 | Phase 33 | Complete |
| SEC-01 | Phase 34 | Pending |
| SEC-02 | Phase 36 | Pending |
| SEC-03 | Phase 34 | Pending |
| AIOBS-01 | Phase 35 | Pending |
| AIOBS-02 | Phase 35 | Pending |
| AIOBS-03 | Phase 35 | Pending |
| AIOBS-04 | Phase 35 | Pending |
| PERF-01 | Phase 37 | Pending |
| PERF-02 | Phase 37 | Pending |
| PERF-03 | Phase 31 | Complete |
| PERF-04 | Phase 33 | Pending |

**Coverage:**
- v4.0 requirements: 19 total
- Mapped to phases: 19/19
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 -- traceability updated after roadmap creation*
