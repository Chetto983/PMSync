# Requirements: MailAgent Stability & Code Quality Refactor

**Defined:** 2026-01-31
**Core Value:** Stable, maintainable email sync that doesn't corrupt user data under concurrent load

## v1 Requirements

Requirements for this refactoring milestone. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Consolidate 3 duplicate LLM sanitization functions into single utility at `backend/src/modules/ai/voltagent/utils/sanitize.utils.ts`
- [ ] **FOUND-02**: Remove deprecated Mistral MEDIUM model references from `mistral.provider.ts` and `mistral.service.ts`
- [ ] **FOUND-03**: Delete deprecated tool creators from `email.tools.ts`, `folder.tools.ts`, `calendar.tools.ts`, `document-library.tools.ts`, `contacts.tools.ts`
- [ ] **FOUND-04**: Clean up deprecated license check in `usage-tracking.service.ts`
- [ ] **FOUND-05**: Extract `PrismaRetryService` to `backend/src/common/services/` if not already there
- [ ] **FOUND-06**: Verify `RedisLockService` is in common module and consistently used
- [ ] **FOUND-07**: Add pre-commit hook preventing DEPRECATED markers without removal dates

### Race Conditions

- [ ] **RACE-01**: Add monitoring alert when folder sync duration exceeds 4 minutes (RC-A1 enhancement)
- [ ] **RACE-02**: Add distributed locks to folder CRUD operations in `folder-sync.service.ts` (RC-A8 fix)
- [ ] **RACE-03**: Wrap VoltAgent conversation + context updates in Prisma transaction for atomicity
- [ ] **RACE-04**: Add 60-second timeout to LLM API calls with partial response fallback

### Driver Splits

- [ ] **DRIV-01**: Split `imap.driver.ts` (2,249 lines) into connection, folder-sync, message-sync, IDLE, send modules (<500 lines each)
- [ ] **DRIV-02**: Split `google.driver.ts` (1,364 lines) into focused Gmail API modules (<500 lines each)
- [ ] **DRIV-03**: Split `microsoft.driver.ts` (1,429 lines) into focused Microsoft Graph modules (<500 lines each)
- [ ] **DRIV-04**: Maintain backward-compatible facade pattern for all driver splits

### Service Splits

- [ ] **SERV-01**: Split `folder-sync.service.ts` (1,629 lines) by provider: IMAP, Gmail, Microsoft sync services
- [ ] **SERV-02**: Split `base-email-sync.service.ts` (1,382 lines) into orchestration components
- [ ] **SERV-03**: Split `emails.service.ts` (1,705 lines) into CRUD, bulk operations, cleanup services
- [ ] **SERV-04**: Split `knowledge-base.service.ts` (1,371 lines) into composer, CRUD, search, backfill services
- [ ] **SERV-05**: Maintain backward-compatible facade pattern for all service splits

### Testing

- [ ] **TEST-01**: Create stress tests proving RC-A1 monitoring triggers correctly under load
- [ ] **TEST-02**: Create stress tests proving RC-A8 locks prevent concurrent folder corruption
- [ ] **TEST-03**: Create test proving conversation atomicity rollback works on context failure
- [ ] **TEST-04**: Create multi-tenant isolation tests verifying cross-tenant data access prevention
- [ ] **TEST-05**: Create unit tests for each new split module (target: 80%+ coverage)
- [ ] **TEST-06**: Create integration tests with real Redis/PostgreSQL for sync workflows
- [ ] **TEST-07**: Use existing real-data test scripts from `backend/scripts/` for validation

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

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

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| FOUND-07 | Phase 1 | Pending |
| RACE-01 | Phase 2 | Pending |
| RACE-02 | Phase 2 | Pending |
| RACE-03 | Phase 2 | Pending |
| RACE-04 | Phase 2 | Pending |
| DRIV-01 | Phase 3 | Pending |
| DRIV-02 | Phase 5 | Pending |
| DRIV-03 | Phase 5 | Pending |
| DRIV-04 | Phase 3, 5 | Pending |
| SERV-01 | Phase 4 | Pending |
| SERV-02 | Phase 6 | Pending |
| SERV-03 | Phase 4 | Pending |
| SERV-04 | Phase 7 | Pending |
| SERV-05 | Phase 4, 6, 7 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 8 | Pending |
| TEST-05 | Phase 3-7 | Pending |
| TEST-06 | Phase 8 | Pending |
| TEST-07 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after initial definition*
