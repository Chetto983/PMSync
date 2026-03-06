---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Security Hardening & Debt Reduction
status: executing
stopped_at: Completed 46-01-PLAN.md
last_updated: "2026-03-06T10:16:35.312Z"
last_activity: 2026-03-06 -- Phase 45 forwardRef burn-down complete (18→2 call sites)
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 25
  completed_plans: 23
  percent: 91
---

---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Security Hardening & Debt Reduction
status: executing
stopped_at: Phase 45 complete, ready to plan Phase 48
last_updated: "2026-03-06T09:09:57.430Z"
last_activity: 2026-03-06 -- Phase 45 forwardRef burn-down complete (18→2 call sites)
progress:
  [█████████░] 91%
  completed_phases: 5
  total_plans: 19
  completed_plans: 19
---

---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Security Hardening & Debt Reduction
status: executing
stopped_at: Completed 45-03-PLAN.md
last_updated: "2026-03-06T09:07:24.934Z"
last_activity: 2026-03-06 -- 45-03 module-level forwardRef elimination via @Global() + domain events
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 19
  completed_plans: 19
---

---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Security Hardening & Debt Reduction
status: executing
stopped_at: Completed 45-03-PLAN.md
last_updated: "2026-03-06T09:01:00Z"
last_activity: 2026-03-06 -- 45-03 module-level forwardRef elimination
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 19
  completed_plans: 19
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 48 (Auth Fix 2026 Best Practice) -- next after Phase 45 forwardRef burn-down

## Current Position

Phase: 48 (Auth Fix 2026 Best Practice)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-06 -- Phase 45 forwardRef burn-down complete (18→2 call sites)

Progress: [██████████] 100% (Phase 45: 3/3 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: ~9min
- Total execution time: ~71min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 42 | 3/3 | ~35min | ~12min |
| 43 | 4/4 | 36min | 9min |
| 48 | 2/3 | ~12min | ~6min |

*Updated after each plan completion*
| Phase 48 P01 | 7min | 3 tasks | 9 files |
| Phase 48 P03 | 9min | 2 tasks | 6 files |
| Phase 48 P04 | 7min | 2 tasks | 7 files |
| Phase 44 P01 | 4min | 2 tasks | 8 files |
| Phase 44 P02 | 6min | 2 tasks | 12 files |
| Phase 44 P03 | 6min | 2 tasks | 14 files |
| Phase 44 P04 | 9min | 3 tasks | 11 files |
| Phase 45 P01 | 6min | 2 tasks | 10 files |
| Phase 45 P02 | 4min | 2 tasks | 7 files |
| Phase 45 P03 | 12min | 2 tasks | 18 files |
| Phase 49 P01 | 5min | 2 tasks | 15 files |
| Phase 49 P02 | 7min | 2 tasks | 8 files |
| Phase 49 P03 | 6min | 2 tasks | 4 files |
| Phase 46 P01 | 3min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v4.0: 5 forwardRef accepted in Email core cluster (target <=12 in v4.1 DEBT phase)
- v4.0: IPolicyService/Permission enum scaffolding for v4.1 RBAC
- 42-02: UsersController RolesGuard added without class-level @Roles (self-service endpoints)
- 42-02: Compliance controllers made admin-only per plan
- 42-02: Write-guarded controllers use method-level @Roles on mutations, reads open
- 42-04: Simulated extension logic tests instead of real DB -- faster, no DB dependency
- 42-04: ESM modules (otplib, qrcode) mocked in Jest to avoid transform failures
- 42-03: Access token cookie reduced from 7d to 15m; refresh cookie scoped to /api/v1/auth/refresh
- 42-03: 10s grace period on refresh token reuse to handle network retries without theft detection
- [Phase 42]: Model count is 43 not 48: only RefreshToken was added to TENANT_SCOPED_MODELS in Phase 42
- [Phase 42]: UsersController is purely self-service (/users/me/*) -- documented with JSDoc, no @Roles needed
- [Phase 42]: withTenantContext does not exist -- tenant context set via CorrelationContext (AsyncLocalStorage)
- 43-01: Contract tests skip gracefully when OpenAPI spec unavailable (no DB in CI fallback)
- 43-01: Used pipeline() + Readable.fromWeb() for streaming (proper backpressure + error cleanup)
- 43-01: Contract tests validate path/method existence + response schema fields, not deep type matching
- 43-02: Facade keeps same class name (EmailSyncBackService, AuthService) -- zero consumer changes
- 43-02: Function-passing pattern for cross-sub-service calls avoids circular DI
- 43-02: executeWithRetry duplicated in provider sub-services (acceptable: avoids shared base class coupling)
- 43-03: Controller ordering critical: specific-path controllers before catch-all @Get(':id') in module
- 43-03: Facade pattern preserves public API -- zero consumer changes after god-file split
- [Phase 43]: QUAL-06 verified: all 22 split files under 400 lines (max 399); 10 failing test suites confirmed pre-existing
- 48-02: MFA tokens not pinned to HS256 -- module-level config switches sign+verify together; 5m TTL makes grace irrelevant
- 48-02: jwtLegacyHmacSecret auto-populated from JWT_SECRET when ES256 enabled (simplifies migration)
- 48-02: secretOrKeyProvider decodes header base64url to determine algorithm -- standard passport-jwt dual-algo pattern
- [Phase 48]: Argon2id params configurable via env (ARGON2_MEMORY_COST/TIME_COST/PARALLELISM) with OWASP 2025 defaults (64MiB/3/1)
- [Phase 48]: HIBP breach threshold >3 (not >0) to reduce false positives from padding noise
- [Phase 48]: LoginDto @MaxLength(128) is the primary CPU DoS prevention gate for Argon2id
- [Phase 48]: Soft password policy warning uses length check (not HIBP) to keep login fast
- [Phase 48]: Per-email rate limit 10/15min (vs per-IP 5/15min) due to shared IP commonality
- [Phase 48]: Refresh cookie keeps refresh_token name (no __Host-) because path-scoping incompatible with __Host- requirement
- [Phase 48]: lastActivityAt debounced at 1min to avoid DB write on every authenticated request
- 44-01: widget-registry.ts uses React.createElement (not JSX) to stay .ts for pure config file
- 44-01: Visual regression tests use storageState: undefined to bypass auth setup project
- 44-01: God-file split pattern: extract inline components to subdir, keep parent as import-wiring facade
- 44-02: Sub-components keep useTranslations/useRouter calls (no prop-drilling translations)
- 44-02: InteractionList renamed to ContactActivityFeed per QUAL-10 naming convention
- [Phase 44]: Zustand slice creator pattern: (set, get) => state+actions spread into single store
- [Phase 44]: Contacts handlers receive translations via hook parameter; dialogs extracted to ContactDialogs.tsx
- [Phase 45]: useExisting (not useClass) for Symbol token bindings to avoid duplicate service instances
- 45-03: @Global() TransactionalEmailModule for standalone nodemailer -- auth no longer imports EmailModule
- 45-03: Domain event (email.indexed) over interface token for EmailSync->AI -- eliminates module import entirely
- 45-03: EmailEmbeddingCleanupService moved to AiModule -- AI concern, not sync concern
- 45-03: CalendarModule direct import in email.module.ts -- cycle broken at EmailSync edge
- [Phase 49]: Type extraction pattern: shared interface to types/ dir with re-export from original file
- [Phase 49]: Inline interface types: define types in interface file to break circular imports from services
- [Phase 49]: Type extraction file: locales/types.ts with zero imports as canonical source for all translation interfaces
- [Phase 49]: @Global() StorageModule with AttachmentStorageService to break EmailModule<->EmailSyncModule forwardRef cycle
- [Phase 46]: @Global() MetricsModule so metric tokens injectable without per-module imports

### Roadmap Evolution

- Phase 49 added: Zero Circular Dependencies (eliminate all 14 madge --circular chains)

### Pending Todos

None.

### Blockers/Concerns

- api.generated.ts placeholder (resolves with CI against live DB)
- Compliance GDPR endpoints (consent, data-export, data-deletion, legal) now admin-only -- may need revisiting for user self-service GDPR rights
- ROADMAP grep criterion for forwardRef yields 17 (15 are comments) -- actual call sites are 2; wording issue, not implementation gap

## Session Continuity

Last session: 2026-03-06T10:16:35.307Z
Stopped at: Completed 46-01-PLAN.md
Resume file: None
Next action: Plan Phase 48 (Auth Fix 2026 Best Practice)
