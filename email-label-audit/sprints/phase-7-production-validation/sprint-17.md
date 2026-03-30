# Sprint 17 - Production Validation Suite

| Key | Value |
|-----|-------|
| Phase | 7 - Production Validation |
| Sprint | 17 |
| SP | 13 |
| Objective | Build comprehensive test suite and monitoring to validate all fixes across all drivers at 10/10 production readiness |
| Addresses | All previous findings — validation layer |

## Context

Phases 1-6 fix the issues. This sprint proves they're fixed in production. Covers: integration tests for all 3 drivers, health monitoring, data consistency validation, and a production scorecard checklist.

## Sprint Backlog

### T-1701: Driver integration test suite [4 SP]

- [x] Create `backend/src/modules/email-sync/__tests__/driver-integration.spec.ts` ✅ DONE
- [x] **Google tests:** ✅ DONE
  - Token refresh mid-operation recovery (withRetry + onTokenRefresh)
  - Rate limit backoff with 429 simulation
  - Sync token invalidation and recovery (IF-H2)
- [x] **Microsoft tests:** ✅ DONE
  - Folder error classification (FolderOperationError)
  - Delta token 404/410 recovery
- [x] **IMAP tests:** ✅ DONE
  - Connection error classification (auth vs network vs protocol)
  - SMTP error handling and retry logic
  - All SMTP response codes (421-552)
- [x] Mock external APIs — focus on error handling paths, not happy paths ✅ DONE
- [x] Files: 3 test files in `__tests__/` (101 tests total) ✅ DONE

### T-1702: Worker and queue integration tests [3 SP]

- [x] Test worker error isolation: IF-C1 sliding window, auto-pause at threshold ✅ DONE
- [x] Test queue backpressure: BackpressureError, per-tenant depth, rollback ✅ DONE
- [x] Test stalled job recovery: IF-H4 stalled timestamp tracking ✅ DONE
- [x] Test bulk operations tenant validation: IF-H5 boundary check pattern ✅ DONE
- [x] Test Redis lock serialization: SET NX, ownership release, mutual exclusion ✅ DONE
- [x] Test webhook idempotency: dedup pattern, timestamp validation ✅ DONE
- [x] Files: 2 test files (40 tests total) ✅ DONE

### T-1703: Production health monitoring [2 SP]

- [ ] Extend `GET /health` endpoint with driver-specific checks:
  ```json
  {
    "status": "ok",
    "drivers": {
      "google": { "status": "ok", "activeAccounts": 5, "lastSync": "..." },
      "microsoft": { "status": "ok", "activeAccounts": 2, "lastSync": "..." },
      "imap": { "status": "ok", "activeAccounts": 1, "lastSync": "..." }
    },
    "workers": {
      "emailSync": { "status": "running", "jobsProcessed": 150, "failedLast1h": 2 },
      "embedding": { "status": "running", "jobsProcessed": 80, "failedLast1h": 0 }
    },
    "queues": {
      "emailSync": { "waiting": 10, "active": 2, "depth": 12 },
      "embedding": { "waiting": 5, "active": 1, "depth": 6 }
    }
  }
  ```
- [ ] Add queue depth alert: if any queue > 80% of limit, log warning
- [ ] Add worker failure rate alert: if > 5% failure rate in last hour, log error
- [ ] Files: `health.controller.ts`, `health.service.ts`

### T-1704: Data consistency validation script [2 SP]

- [ ] Create `backend/scripts/validate-production-data.ts` (runnable via `npx ts-node`)
- [ ] Checks:
  - All emails have valid `folder` matching `determineFolderFromLabels(labels)`
  - No orphan embeddings (embedding exists but email deleted)
  - No cross-tenant data (email.tenantId matches provider.tenantId)
  - All active webhook subscriptions are valid (not expired)
  - Folder cache entries match actual folders
  - No stale sync tokens (historyId/deltaLink)
- [ ] Output: JSON report with `{ check, status, count, details }`
- [ ] Exit code: 0 if all pass, 1 if any fail
- [ ] Files: new `backend/scripts/validate-production-data.ts`

### T-1705: Production scorecard [2 SP]

- [ ] Create `email-label-audit/docs/02-PRODUCTION-SCORECARD.md`
- [ ] 10 categories, each scored 0-10:
  1. **Token Lifecycle** — refresh, mutex, error recovery
  2. **Batch Operations** — partial failure, tenant isolation, retry
  3. **Rate Limiting** — backoff, budget, 429 handling
  4. **Connection Resilience** — reconnection, pooling, health checks
  5. **Error Classification** — typed errors, recoverable vs fatal
  6. **Security** — input validation, replay prevention, path traversal
  7. **Embedding Integrity** — lifecycle, orphan cleanup, enrichment
  8. **Multi-Provider Parity** — consistent behavior across Google/MS/IMAP
  9. **Queue & Worker Safety** — isolation, backpressure, stall recovery
  10. **Monitoring & Observability** — health endpoints, alerts, validation scripts
- [ ] Each category: list of checks, current status, evidence
- [ ] Overall score: average of 10 categories
- [ ] Target: all categories >= 9/10, overall >= 9.5/10
- [ ] Files: new `email-label-audit/docs/02-PRODUCTION-SCORECARD.md`

## Dependencies

- ALL previous sprints complete (S01-S16)
- Production environment access for validation script

## Risks

- Integration tests may reveal previously unknown issues
- Mitigation: Budget 20% contingency time for discovered issues
- Production validation script needs database access
- Mitigation: Run on Railway staging first, then production

## Definition of Done

- [ ] Driver integration tests cover all error paths
- [ ] Worker/queue tests verify isolation and recovery
- [ ] Health endpoint reports all driver and worker status
- [ ] Validation script runs clean on staging
- [ ] Production scorecard >= 9.5/10 overall
- [ ] `npx tsc --noEmit` passes in backend
- [ ] All existing tests pass
- [ ] Manual E2E via Edge CDP: create/delete email on all 3 providers, verify embedding lifecycle
