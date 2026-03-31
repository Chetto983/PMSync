# Sprint 03 Checkpoint — Embeddings & Vector Search

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Last Task** | T-0305 |
| **Next Task** | Sprint 04 (T-0401) |
| **Tasks Done** | 5/5 |
| **SP Done** | 14 |

## Findings Addressed

| Finding | Status | Notes |
|---------|--------|-------|
| KB-C1 | Fixed | Per-tenant Redis counter (100/hr default, configurable EMBEDDING_BACKFILL_PER_TENANT_LIMIT). Fails open. |
| KB-H1 | Fixed | findSimilarContent filters by embeddingModel. POST /ai/knowledge-base/migrate-embeddings deletes stale. |
| KB-H2 | Fixed | Orphan cleanup now every 6h (was daily). Results logged to AiRunLedger. |
| KB-H3 | Fixed | Redis SET dedup (pmsync:embedding:pending:{emailId}, 1h TTL). Cleared on completion/final failure. |

## Last Modified Files

- `backend/src/modules/ai/services/embedding-backfill-scheduler.service.ts` — per-tenant throttle + refactored SQL
- `backend/src/modules/ai/services/embeddings.service.ts` — model version filter + stale management
- `backend/src/modules/ai/controllers/knowledge-base.controller.ts` — migrate-embeddings endpoint
- `backend/src/modules/ai/services/orphan-embedding-cleanup.service.ts` — 6h schedule + ledger
- `backend/src/common/services/scheduled-jobs.queue.ts` — updated cron pattern
- `backend/src/modules/ai/services/email-embedding.queue.ts` — Redis dedup guard
- `backend/src/modules/ai/services/__tests__/embedding-tenant-isolation.test.ts` — tenant isolation test

## Key Decisions

- Used existing `embeddingModel` column as version key (no schema migration needed)
- Per-tenant throttle fails open (backfill is best-effort, not critical path)
- Dedup guard fails open (worst case: re-embed, not data loss)
- Orphan cleanup every 6h instead of daily (audit asked for "daily or every 6 hours")
- AiRunLedger logs maintenance runs with totalTokens = deleted count (no LLM cost)

## Validation Status

- `npx tsc --noEmit` — PASS (all 5 commits)
- Tenant isolation — verified via code audit + integration test
