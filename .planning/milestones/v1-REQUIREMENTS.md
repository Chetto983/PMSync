# Requirements Archive: v1 Stability & Code Quality Refactor

**Archived:** 2026-02-02
**Status:** ✅ SHIPPED

This is the archived requirements specification for v1.
For current requirements, see `.planning/REQUIREMENTS.md` (created for next milestone).

---

# Requirements: MailAgent Stability & Code Quality Refactor

**Defined:** 2026-01-31
**Core Value:** Stable, maintainable email sync that doesn't corrupt user data under concurrent load

## v1 Requirements

Requirements for this refactoring milestone. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Consolidate 3 duplicate LLM sanitization functions into single utility at `backend/src/modules/ai/voltagent/utils/sanitize.utils.ts`
- [x] **FOUND-02**: Remove deprecated Mistral MEDIUM model references from `mistral.provider.ts` and `mistral.service.ts`
- [x] **FOUND-03**: Delete deprecated tool creators from `email.tools.ts`, `folder.tools.ts`, `calendar.tools.ts`, `document-library.tools.ts`, `contacts.tools.ts`
- [x] **FOUND-04**: Clean up deprecated license check in `usage-tracking.service.ts`
- [x] **FOUND-05**: Extract `PrismaRetryService` to `backend/src/common/services/` if not already there
- [x] **FOUND-06**: Verify `RedisLockService` is in common module and consistently used
- [x] **FOUND-07**: Add pre-commit hook preventing DEPRECATED markers without removal dates

### Race Conditions

- [x] **RACE-01**: Add monitoring alert when folder sync duration exceeds 4 minutes (RC-A1 enhancement)
- [x] **RACE-02**: Add distributed locks to folder CRUD operations in `folder-sync.service.ts` (RC-A8 fix)
- [x] **RACE-03**: Wrap VoltAgent conversation + context updates in Prisma transaction for atomicity
- [x] **RACE-04**: Add 60-second timeout to LLM API calls with partial response fallback

### Driver Splits

- [x] **DRIV-01**: Split `imap.driver.ts` (2,249 lines) into connection, folder-sync, message-sync, IDLE, send modules (<500 lines each)
- [x] **DRIV-02**: Split `google.driver.ts` (1,364 lines) into focused Gmail API modules (<500 lines each)
- [x] **DRIV-03**: Split `microsoft.driver.ts` (1,429 lines) into focused Microsoft Graph modules (<500 lines each)
- [x] **DRIV-04**: Maintain backward-compatible facade pattern for all driver splits

### Service Splits

- [x] **SERV-01**: Split `folder-sync.service.ts` (1,629 lines) by provider: IMAP, Gmail, Microsoft sync services
- [x] **SERV-02**: Split `base-email-sync.service.ts` (1,382 lines) into orchestration components
- [x] **SERV-03**: Split `emails.service.ts` (1,705 lines) into CRUD, bulk operations, cleanup services
- [x] **SERV-04**: Split `knowledge-base.service.ts` (1,371 lines) into composer, CRUD, search, backfill services
- [x] **SERV-05**: Maintain backward-compatible facade pattern for all service splits

### Testing

- [x] **TEST-01**: Create stress tests proving RC-A1 monitoring triggers correctly under load
- [x] **TEST-02**: Create stress tests proving RC-A8 locks prevent concurrent folder corruption
- [x] **TEST-03**: Create test proving conversation atomicity rollback works on context failure
- [x] **TEST-04**: Create multi-tenant isolation tests verifying cross-tenant data access prevention
- [x] **TEST-05**: Create unit tests for each new split module (target: 80%+ coverage)
- [x] **TEST-06**: Create integration tests with real Redis/PostgreSQL for sync workflows
- [x] **TEST-07**: Use existing real-data test scripts from `backend/scripts/` for validation

## v2 Requirements (Deferred)

Tracked but not in v1 roadmap.

### Performance

- **PERF-01**: Add pgvector HNSW index for embedding similarity search
- **PERF-02**: Fix N+1 query pattern for folder counts using groupBy
- **PERF-03**: Add orphaned embedding cleanup job
- **PERF-04**: Add composite indexes to Email table for common queries

### Security

- **SEC-01**: Enable S3 server-side encryption for attachments
- **SEC-02**: Implement OAuth token revocation on provider disconnect
- **SEC-03**: Add automatic log redaction for auth payloads

### Monitoring

- **MON-01**: Add Prometheus metrics for sync execution time by provider
- **MON-02**: Add alert for cache invalidation failures (GDPR compliance)
- **MON-03**: Add DLQ alerting when emails fail to sync

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Database schema migrations | Code-level refactoring only, no schema changes |
| Frontend changes | Backend-only milestone |
| New features | Refactoring only, behavior must remain identical |
| Performance optimizations | Separate v2 milestone |
| Security hardening | Separate v2 milestone |
| Monitoring infrastructure | Only add alerts for race condition fixes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | ✅ Complete |
| FOUND-02 | Phase 1 | ✅ Complete |
| FOUND-03 | Phase 1 | ✅ Complete |
| FOUND-04 | Phase 1 | ✅ Complete |
| FOUND-05 | Phase 1 | ✅ Complete |
| FOUND-06 | Phase 1 | ✅ Complete |
| FOUND-07 | Phase 1 | ✅ Complete |
| RACE-01 | Phase 2 | ✅ Complete |
| RACE-02 | Phase 2 | ✅ Complete |
| RACE-03 | Phase 2 | ✅ Complete |
| RACE-04 | Phase 2 | ✅ Complete |
| DRIV-01 | Phase 3 | ✅ Complete |
| DRIV-02 | Phase 5 | ✅ Complete |
| DRIV-03 | Phase 5 | ✅ Complete |
| DRIV-04 | Phase 3, 5 | ✅ Complete |
| SERV-01 | Phase 4 | ✅ Complete |
| SERV-02 | Phase 6 | ✅ Complete |
| SERV-03 | Phase 4 | ✅ Complete |
| SERV-04 | Phase 7 | ✅ Complete |
| SERV-05 | Phase 4, 6, 7 | ✅ Complete |
| TEST-01 | Phase 2, 8 | ✅ Complete |
| TEST-02 | Phase 2, 8 | ✅ Complete |
| TEST-03 | Phase 2, 8 | ✅ Complete |
| TEST-04 | Phase 8 | ✅ Complete |
| TEST-05 | Phase 3, 4, 5, 6, 7 | ✅ Complete |
| TEST-06 | Phase 8 | ✅ Complete |
| TEST-07 | Phase 8 | ✅ Complete |

**Coverage:**
- v1 requirements: 26 total
- Shipped: 26 (100%)
- Unmapped: 0

---

## Milestone Summary

**Shipped:** 26 of 26 v1 requirements
**Adjusted:** None (all requirements implemented as specified)
**Dropped:** None

---
*Archived: 2026-02-02 as part of v1 milestone completion*
