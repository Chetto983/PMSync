# Sprint 04 Checkpoint — Backfill, Queues & Orphan Cleanup

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Last Task** | T-0405 |
| **Next Task** | Sprint 05 (T-0501) |
| **Tasks Done** | 5/5 |
| **SP Done** | 12 |

## Findings Addressed

| Finding | Status | Notes |
|---------|--------|-------|
| KB-M1 | Fixed | Query cache invalidated per-tenant after embedding deletions. Note: cache stores query vectors (not results), so search was already fresh. TTL already 1h (not 24h as audit claimed). Defense-in-depth. |
| KB-M2 | Fixed | Per-tenant Redis rate limiter for contact embedding queue. Key: `pmsync:contact-embed:rate:{tenantId}`, 1min TTL. Default 120/min, configurable via `CONTACT_EMBEDDING_PER_TENANT_PER_MINUTE`. Fails open. |
| KB-M3 | Fixed | 17 new edge case tests for embedding composer chunking: exact/over max size, whitespace, unicode, long words, overlap, newline boundaries, HTML-only, plain-text-only, all-null fields. |
| KB-L1 | Fixed | Cache prewarming deferred from startup (10s setTimeout) to lazy trigger on first search via `triggerInitialWarmIfNeeded()`. Fire-and-forget, does not block search. |

## Last Modified Files

- `backend/src/modules/ai/services/knowledge-base.service.ts` — query cache invalidation on delete
- `backend/src/modules/ai/services/contact-embedding.queue.ts` — per-tenant Redis rate limiter
- `backend/src/modules/ai/services/__tests__/embedding-composer.service.spec.ts` — 17 new chunking tests
- `backend/src/modules/ai/services/cache-prewarming.service.ts` — lazy initialization
- `backend/src/modules/ai/services/embedding-search.service.ts` — lazy prewarm trigger
- `backend/src/modules/ai/controllers/ai-health.controller.ts` — DLQ stats in health endpoint

## Key Decisions

- KB-M1: Query embedding cache stores vectors, not results — finding overstated severity. Added invalidation as defense-in-depth.
- KB-M2: Used 1-minute sliding window (not hourly like backfill) since contact embedding is more latency-sensitive.
- KB-L1: Lazy prewarm fires after first search completes, not on a timer. Eliminates any boot-time impact.
- T-0405: Both queues already had DLQ + AlertingService. Added DLQ stats to /ai/health/detailed (admin only).

## Validation Status

- `npx tsc --noEmit` — PASS (all 4 code commits)
- Unit tests — 41/41 pass (embedding-composer.service.spec.ts)
- Phase 2 Knowledge Base & RAG — COMPLETE (S03 + S04)
