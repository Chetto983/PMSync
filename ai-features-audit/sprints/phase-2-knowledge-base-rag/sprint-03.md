# Sprint 03 — Embeddings & Vector Search

| Campo | Valore |
|-------|--------|
| **Phase** | 2 — Knowledge Base & RAG |
| **Sprint** | 03 |
| **SP** | 14 |
| **Objective** | Add tenant-level throttle to backfill, implement embedding versioning, increase orphan cleanup frequency, add dedup guard |
| **Addresses** | KB-C1, KB-H1, KB-H2, KB-H3 |

---

## Sprint Backlog

### T-0301: Add per-tenant throttle to embedding backfill [3 SP]
- [x] Read `embedding-backfill-scheduler.service.ts` — trace scheduling logic ✅ DONE
- [x] Add per-tenant concurrency limit (configurable, default 100 emails/tenant/hour) ✅ DONE
- [x] Use Redis sorted set to track per-tenant backfill progress ✅ DONE
- [x] Add metrics: per-tenant backfill rate, queue depth by tenant ✅ DONE
- [x] Addresses: **KB-C1** ✅ DONE

### T-0302: Implement embedding model versioning [4 SP]
- [x] Read `embeddings.service.ts` — check how `embeddingModel` is stored ✅ DONE
- [x] Add `embeddingVersion` column or use existing `embeddingModel` as version key ✅ DONE (used existing column)
- [x] On search: filter to current model version only (exclude stale vectors) ✅ DONE
- [x] Add migration endpoint: `POST /ai/knowledge-base/migrate-embeddings` (re-embeds stale version) ✅ DONE
- [x] Add `EMBEDDING_MODEL_VERSION` env var for controlled rollout ✅ DONE (AI_EMBEDDING_MODEL)
- [x] Addresses: **KB-H1** ✅ DONE

### T-0303: Increase orphan embedding cleanup to daily [2 SP]
- [x] Read `orphan-embedding-cleanup.service.ts` — locate cron schedule ✅ DONE
- [x] Change from weekly to daily (or every 6 hours) ✅ DONE (every 6h)
- [x] Add batch size limit to prevent long-running cleanup blocking other work ✅ DONE (already had MAX_BATCHES=50)
- [x] Log cleanup count to AiRunLedger ✅ DONE
- [x] Addresses: **KB-H2** ✅ DONE

### T-0304: Add dedup guard before embedding job enqueue [3 SP]
- [x] Read `email-embedding.queue.ts` — trace `enqueue()` and `enqueueMany()` ✅ DONE
- [x] Add Redis SET check: `embedding:pending:{emailId}` with 1h TTL ✅ DONE
- [x] Skip enqueue if emailId already pending ✅ DONE
- [x] Remove from SET on job completion/failure ✅ DONE
- [x] Addresses: **KB-H3** ✅ DONE

### T-0305: Verify embedding search returns correct tenant-scoped results [2 SP]
- [x] Read `embedding-search.service.ts` — verify tenantId WHERE clause ✅ DONE
- [x] Write test: create embeddings for 2 tenants, search from tenant A, verify no tenant B results ✅ DONE
- [x] Verify GDPR hydration (content fetch from source tables) includes tenant filter ✅ DONE

---

## Dependencies

- None

## Risks

1. **T-0302 versioning** — Migration endpoint could be expensive. Must be async with progress tracking.
2. **T-0304 dedup** — Redis SET could grow large during bulk sync. TTL prevents unbounded growth.

## Definition of Done

- [x] Backfill throttled per tenant (max 100/hr default) ✅
- [x] Embedding model version tracked — stale vectors excluded from search ✅
- [x] Orphan cleanup runs every 6h (was daily) ✅
- [x] Duplicate embedding jobs prevented via Redis dedup guard ✅
- [x] Tenant isolation verified in embedding search ✅
- [x] `npx tsc --noEmit` passes on backend ✅
