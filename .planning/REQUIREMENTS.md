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
- [ ] **DRIV-02**: Split `google.driver.ts` (1,364 lines) into focused Gmail API modules (<500 lines each)
- [ ] **DRIV-03**: Split `microsoft.driver.ts` (1,429 lines) into focused Microsoft Graph modules (<500 lines each)
- [~] **DRIV-04**: Maintain backward-compatible facade pattern for all driver splits (IMAP complete, Gmail/Microsoft pending)

### Service Splits

- [x] **SERV-01**: Split `folder-sync.service.ts` (1,629 lines) by provider: IMAP, Gmail, Microsoft sync services
- [ ] **SERV-02**: Split `base-email-sync.service.ts` (1,382 lines) into orchestration components
- [x] **SERV-03**: Split `emails.service.ts` (1,705 lines) into CRUD, bulk operations, cleanup services
- [ ] **SERV-04**: Split `knowledge-base.service.ts` (1,371 lines) into composer, CRUD, search, backfill services
- [~] **SERV-05**: Maintain backward-compatible facade pattern for all service splits (Phase 4 complete, Phase 6/7 pending)

### Testing

- [x] **TEST-01**: Create stress tests proving RC-A1 monitoring triggers correctly under load
- [x] **TEST-02**: Create stress tests proving RC-A8 locks prevent concurrent folder corruption
- [x] **TEST-03**: Create test proving conversation atomicity rollback works on context failure
- [ ] **TEST-04**: Create multi-tenant isolation tests verifying cross-tenant data access prevention
- [~] **TEST-05**: Create unit tests for each new split module (target: 80%+ coverage) (Phase 3/4 complete, Phase 5/6/7 pending)
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
| DRIV-02 | Phase 5 | Pending |
| DRIV-03 | Phase 5 | Pending |
| DRIV-04 | Phase 3, 5 | 🔄 In Progress (IMAP done) |
| SERV-01 | Phase 4 | ✅ Complete |
| SERV-02 | Phase 6 | Pending |
| SERV-03 | Phase 4 | ✅ Complete |
| SERV-04 | Phase 7 | Pending |
| SERV-05 | Phase 4, 6, 7 | 🔄 In Progress (Phase 4 done) |
| TEST-01 | Phase 2 | ✅ Complete |
| TEST-02 | Phase 2 | ✅ Complete |
| TEST-03 | Phase 2 | ✅ Complete |
| TEST-04 | Phase 8 | Pending |
| TEST-05 | Phase 3, 4, 5, 6, 7 | 🔄 In Progress (Phase 3/4 done) |
| TEST-06 | Phase 8 | Pending |
| TEST-07 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-02-01 after Phase 4 completion*
