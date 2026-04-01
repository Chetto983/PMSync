# Sprint 05 Checkpoint — Email Analysis, Triage & Semaphore

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Last Task** | T-0505 |
| **Next Task** | Sprint 06 (T-0601) |
| **Tasks Done** | 5/5 |
| **SP Done** | 15 |

## Findings Addressed

| Finding | Status | Notes |
|---------|--------|-------|
| EI-C1 | Fixed | Replaced counting semaphore (INCR/DECR) with sorted-set semaphore (ZADD/ZREM). Each slot gets unique ID + timestamp score. Stale slots auto-expire individually (5 min TTL) during every acquire/release. Added `getSemaphoreUtilization()` for monitoring. |
| EI-H1 | Fixed | Per-tenant Redis lock (SET NX EX 120s) prevents concurrent follow-up detection for same tenant. Batch limited to 50 emails per LLM call. Fails open if Redis unavailable. |
| EI-H2 | Fixed | Added `BRIEFING_MAX_INPUT_TOKENS` (default 4000) with priority-based truncation (stale contacts first, then calendar, follow-ups, emails). Added `BRIEFING_LLM_TIMEOUT_MS` (default 60s) replacing hardcoded 45s. |
| EI-H3 | Fixed | Replaced hardcoded 168h lookback with `TRIAGE_BACKFILL_MAX_AGE_DAYS` env var (default 7). Both `findTenantsWithUntriagedEmails` and `getStatus` use the same config. |

## Last Modified Files

- `backend/src/modules/ai/services/email-triage.service.ts` — sorted-set semaphore, batch cap 50->20
- `backend/src/modules/ai/services/__tests__/email-triage-semaphore.spec.ts` — updated for ZSET semaphore
- `backend/src/modules/ai/services/__tests__/email-triage-cost-controls.spec.ts` — NEW: cost control tests
- `backend/src/modules/ai/services/follow-up-detection.service.ts` — per-tenant lock + batch limit
- `backend/src/modules/ai/services/briefing.service.ts` — token budget + configurable timeout
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — configurable max-age lookback
- `backend/prisma/seed.ts` — upsert for KB categories/articles (P2002 fix)

## Key Decisions

- EI-C1: Sorted-set > counting semaphore because individual slot expiry is essential. Counter + global TTL refreshes on every acquire, so stale slots persist indefinitely.
- EI-H1: Fails open (not closed) because blocking detection on Redis failure is worse than a potential duplicate run.
- EI-H2: Token budget uses ~4 chars/token estimate. Truncation order: stale contacts > calendar > follow-ups > emails (preserving highest-signal data).
- EI-H3: Default 7 days matches the temporary 168h that was hardcoded, making it a config-only change with no behavior difference on existing deployments.
- T-0505: Fixed MAX_TRIAGE_PER_BATCH from 50 to 20 to match documentation and audit expectations.

## Validation Status

- `npx tsc --noEmit` — PASS (all commits)
- Bonus: Fixed KB seed P2002 unique constraint on re-seed (upsert)
