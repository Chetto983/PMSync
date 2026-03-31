# Sprint 04 — Backfill, Queues & Orphan Cleanup

| Campo | Valore |
|-------|--------|
| **Phase** | 2 — Knowledge Base & RAG |
| **Sprint** | 04 |
| **SP** | 12 |
| **Objective** | Fix cache invalidation, add per-tenant rate config, test chunking edge cases, defer cache prewarming |
| **Addresses** | KB-M1, KB-M2, KB-M3, KB-L1 |

---

## Sprint Backlog

### T-0401: Invalidate query embedding cache on email deletion [2 SP]
- [ ] Read `query-embedding-cache.service.ts` — understand cache key structure
- [ ] Hook into email deletion event: bust cache entries referencing deleted emailId
- [ ] Alternative: reduce TTL to 1h for search results (simpler, less precise)
- [ ] Addresses: **KB-M1**

### T-0402: Add per-tenant rate config for contact embedding queue [3 SP]
- [ ] Read `contact-embedding.queue.ts` — trace rate limiting
- [ ] Add tenant-aware rate bucket via Redis: `embedding:rate:{tenantId}`
- [ ] Default 2 req/s global, configurable override per tenant
- [ ] Addresses: **KB-M2**

### T-0403: Add unit tests for embedding composer chunking [4 SP]
- [ ] Read `embedding-composer.service.ts` — map all chunking paths
- [ ] Write tests for: empty body, body > max chunk size, huge attachment, mixed content
- [ ] Write tests for: HTML-only email, plain text only, multipart with inline images
- [ ] Verify chunk boundaries don't split mid-word or mid-sentence
- [ ] Addresses: **KB-M3**

### T-0404: Defer cache prewarming to after first request [2 SP]
- [ ] Read `cache-prewarming.service.ts` — locate `onModuleInit()` call
- [ ] Change to lazy initialization: prewarm on first search request (or after 30s delay)
- [ ] Measure boot time improvement
- [ ] Addresses: **KB-L1**

### T-0405: Verify DLQ monitoring for embedding queues [1 SP]
- [ ] Check both `email-embedding.queue.ts` and `contact-embedding.queue.ts`
- [ ] Verify DLQ jobs are surfaced in health endpoint
- [ ] Verify alert creation on DLQ threshold breach

---

## Dependencies

- S03 complete (embedding versioning and dedup guard)

## Risks

1. **T-0401** — Full cache invalidation could cause search latency spike. Consider gradual invalidation.
2. **T-0403** — Chunking tests may reveal undocumented behavior. Fix discovered issues in-sprint.

## Definition of Done

- [ ] Deleted emails no longer appear in cached search results
- [ ] Contact embedding rate configurable per tenant
- [ ] Embedding chunking has comprehensive test coverage
- [ ] Cache prewarming deferred — boot time improved
- [ ] DLQ monitoring verified for both queues
- [ ] `npx tsc --noEmit` passes on backend
