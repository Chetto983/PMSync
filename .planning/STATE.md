---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Enterprise Stabilization
status: completed
stopped_at: Completed 36-02-PLAN.md
last_updated: "2026-03-04T10:45:27.092Z"
last_activity: 2026-03-04 -- Plan 36-02 completed (query site migration to HashSearchService)
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 16
  completed_plans: 16
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 36 - Encrypted Search

## Current Position

Phase: 36 of 37 (Encrypted Search) -- COMPLETE
Plan: 2 of 2 complete in current phase
Status: Phase 36 complete (HMAC blind index infrastructure + query migration)
Last activity: 2026-03-04 -- Plan 36-02 completed (query site migration to HashSearchService)

Progress: [██████████] 99%

## Performance Metrics

**Velocity:**
- Total plans completed: 16 (v4.0)
- Previous milestone (v3.2): 20 plans, 227min total, 11min avg

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 31 | 2/2 | 20min | 10min |
| 32 | 4/4 | 44min | 11min |
| 33 | 3/3 | 50min | 17min |
| 34 | 3/3 | 18min | 6min |
| Phase 34 P01 | 8min | 2 tasks | 6 files |
| Phase 34 P03 | 5min | 1 tasks | 2 files |
| Phase 34 P02 | 5min | 2 tasks | 14 files |
| 35 | 2/2 | 17min | 9min |
| Phase 35 P01 | 12min | 3 tasks | 11 files |
| Phase 35 P02 | 5min | 2 tasks | 7 files |
| 36 | 2/2 | 19min | 10min |
| Phase 36 P01 | 14min | 3 tasks | 13 files |
| Phase 36 P02 | 5min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v4.0]: Enterprise stabilization scoped from PRD Phase 1 (58/100 readiness score)
- [v4.0]: v3.2 closed partial (20/25 plans) -- carry-forward items fit into enterprise stabilization
- [v4.0]: 7-phase dependency chain: Foundation -> Architecture -> API -> Auth, with AI Obs/Encrypted Search/Perf parallel
- [v4.0]: ENC-03 scoped to exact-match only (HMAC on `from` field); substring search deferred to v5.0
- [31-01]: Chat 403 is expected QuotaGuard behavior (FREE tier cost/quota cap), not a bug -- documented on controller
- [31-01]: Dead action-counts polling fully cleaned: 7 invalidation calls removed, E2E mock removed
- [31-02]: AiRunLedger applied via direct SQL due to pre-existing Prisma migration history drift
- [31-02]: dependency-cruiser baseline: 989 cross-module, 21 circular, 3 orphan violations (all warn-only)
- [Phase 32]: ToolRegistryModule placed after PrismaModule/CacheModule but before domain modules in AppModule imports
- [Phase 32]: useExisting provider pattern for ToolRegistryService: injectable by class and by TOOL_REGISTRY_SERVICE symbol
- [32-04]: no-circular at error severity, cross-module deep imports stay as warnings
- [32-04]: CI-only enforcement (no pre-commit hooks), madge informational only, dep-cruiser is the gate
- [32-04]: 1013 known violations baselined for CI comparison
- [32-02]: Direct module imports replace forwardRef in AiChatModule -- not part of Email<->Ai circular chain
- [32-02]: IAiTool wrappers for discovery; existing ToolsService classes stay as AI SDK adapter layer with PII closures
- [32-03]: ProviderConfigService rewritten with EventEmitter2 (13 injected services -> 6 local + events)
- [32-03]: 5 surviving forwardRef edges are all in Email/EmailSync core cluster (true bidirectional)
- [32-03]: madge 8 circulars = 5 pre-existing internal + 3 module-level in Email core cluster
- [32-03]: CalendarIcsDetectedEvent is scaffolding-only; emit added when ICS detection is built
- [33-01]: ApiExceptionFilter duck-types PrismaClientKnownRequestError via constructor name check
- [33-01]: ThrottlerExceptionFilter absorbed into ApiExceptionFilter (3 filters -> 1)
- [33-01]: ResponseEnvelopeInterceptor as APP_INTERCEPTOR (DI), CorrelationInterceptor via useGlobalInterceptors (no DI)
- [33-01]: Webhook exclusion uses wildcard pattern for forward-compatibility
- [33-02]: Envelope unwrap interceptor registered as first response interceptor (before 401/403 handler)
- [33-02]: rawError prop on BaseWidget for backward-compatible enhanced error display
- [33-02]: Fallback cascades preserved (deadlines, staleContacts) but final empty-return catches removed
- [33-02]: getCsrfToken migrated from raw axios to apiClient (auth routes under /api/v1)
- [33-03]: Used getContext()?.correlationId instead of getCorrelationId() to get undefined (not 'no-context' sentinel) when outside HTTP context
- [33-03]: Added requestId?: string to all BullMQ job data interfaces for type safety
- [33-03]: OpenAPI generation step is continue-on-error in CI (requires database); lint blocks when spec exists
- [33-03]: frontend/types/api.generated.ts committed as placeholder; CI overwrites with real types
- [34-01]: sameSite=lax (not strict) on auth cookie to avoid breaking OAuth callback flows
- [34-01]: JWT default expiry changed from 15m to 7d to align with session TTL; session validation handles revocation
- [34-01]: mfa.controller.ts unchanged -- passkey login is in auth.controller (webauthn/login/verify), not mfa.controller
- [34-01]: Simple split-based cookie parser in WS handshake -- no library needed for JWT values
- [34-03]: GCM ciphertext format: gcm:<ciphertextHex>:<authTagHex> -- colon-delimited prefix as version discriminator
- [34-03]: No data migration: existing CBC data transparently decrypted via fallback on access
- [34-03]: IV length change (16->12 bytes) implicit -- stored hex strings, decrypt handles any length
- [34-02]: AuthContext always calls /auth/me on hydration (cookie-based session validation replaces localStorage token check)
- [34-02]: auth-store.ts setToken is a no-op -- token field kept as null for type compatibility
- [34-02]: auth-token.ts kept as deprecation stub (returns empty string) instead of deleted, for safety
- [34-02]: E2E injectAuthCookie helper exported from fixtures.ts for reuse across all spec files
- [35-01]: @Optional() AiRunLedgerService injection for backward compatibility -- services work without ledger
- [35-01]: COST_MAP with 4 Mistral models, unknown models fall back to mistral-small-latest pricing
- [35-01]: All ledger writes fire-and-forget with .catch() -- never affect user response
- [35-01]: Each retry attempt creates separate ledger entry for accurate per-call cost tracking
- [35-02]: Thin controller pattern -- PrismaService injected directly for 2 query endpoints (no service layer)
- [35-02]: Permission enum has 21 entries (4 email + 6 AI + 3 calendar + 4 contacts + 4 admin)
- [35-02]: IPolicyService is interface-only scaffolding -- no implementation until v4.1 RBAC
- [36-01]: fromHash uses HMAC-SHA256 with per-tenant HKDF-derived key (info label: mailagent-blind-index-v1)
- [36-01]: subject stays plaintext in v4.0 -- substring search incompatible with deterministic hashing
- [36-01]: HashSearchService in common/services (not modules/email) to avoid circular dependency
- [36-01]: Dual TenantKeyService instantiation intentional -- PrismaService new(), DI injected; both deterministic
- [36-01]: Prisma migration created manually (baseline shadow DB issue); CONCURRENTLY note for production
- [Phase 36]: hashForSearch kept deprecated, not deleted -- JSDoc directs to hmacForBlindIndex

### Pending Todos

None yet.

### Blockers/Concerns

- LCP/TTI at 4.1s (deferred since v2.1, target <2.5s/<3.5s) -- Phase 37
- ENC-03 hash indexes: Phase 36 COMPLETE (infrastructure + query migration, SEC-02 satisfied)
- 5 forwardRef edges remaining (Email/EmailSync core cluster) -- down from 17+
- Enterprise readiness score: 58/100 (PRD baseline)
- Phase 28 gap items CLOSED (Plan 31-01): chat 403 documented, dead polling removed, E2E mobile passing

## Session Continuity

Last session: 2026-03-04T10:45:27.084Z
Stopped at: Completed 36-02-PLAN.md
Resume file: .planning/phases/36-encrypted-search/36-02-SUMMARY.md
Next action: Execute Phase 37 (Performance Optimization)
