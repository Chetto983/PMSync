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
- [ ] Read `embedding-backfill-scheduler.service.ts` — trace scheduling logic
- [ ] Add per-tenant concurrency limit (configurable, default 100 emails/tenant/hour)
- [ ] Use Redis sorted set to track per-tenant backfill progress
- [ ] Add metrics: per-tenant backfill rate, queue depth by tenant
- [ ] Addresses: **KB-C1**

### T-0302: Implement embedding model versioning [4 SP]
- [ ] Read `embeddings.service.ts` — check how `embeddingModel` is stored
- [ ] Add `embeddingVersion` column or use existing `embeddingModel` as version key
- [ ] On search: filter to current model version only (exclude stale vectors)
- [ ] Add migration endpoint: `POST /ai/knowledge-base/migrate-embeddings` (re-embeds stale version)
- [ ] Add `EMBEDDING_MODEL_VERSION` env var for controlled rollout
- [ ] Addresses: **KB-H1**

### T-0303: Increase orphan embedding cleanup to daily [2 SP]
- [ ] Read `orphan-embedding-cleanup.service.ts` — locate cron schedule
- [ ] Change from weekly to daily (or every 6 hours)
- [ ] Add batch size limit to prevent long-running cleanup blocking other work
- [ ] Log cleanup count to AiRunLedger
- [ ] Addresses: **KB-H2**

### T-0304: Add dedup guard before embedding job enqueue [3 SP]
- [ ] Read `email-embedding.queue.ts` — trace `enqueue()` and `enqueueMany()`
- [ ] Add Redis SET check: `embedding:pending:{emailId}` with 1h TTL
- [ ] Skip enqueue if emailId already pending
- [ ] Remove from SET on job completion/failure
- [ ] Addresses: **KB-H3**

### T-0305: Verify embedding search returns correct tenant-scoped results [2 SP]
- [ ] Read `embedding-search.service.ts` — verify tenantId WHERE clause
- [ ] Write test: create embeddings for 2 tenants, search from tenant A, verify no tenant B results
- [ ] Verify GDPR hydration (content fetch from source tables) includes tenant filter

---

## Dependencies

- None

## Risks

1. **T-0302 versioning** — Migration endpoint could be expensive. Must be async with progress tracking.
2. **T-0304 dedup** — Redis SET could grow large during bulk sync. TTL prevents unbounded growth.

## Definition of Done

- [ ] Backfill throttled per tenant (max 100/hr default)
- [ ] Embedding model version tracked — stale vectors excluded from search
- [ ] Orphan cleanup runs daily (not weekly)
- [ ] Duplicate embedding jobs prevented via Redis dedup guard
- [ ] Tenant isolation verified in embedding search
- [ ] `npx tsc --noEmit` passes on backend
