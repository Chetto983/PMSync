# Sprint 11 — Checkpoint

## Status

- **Sprint:** 11 — Embedding Quality & Chunking
- **Last Task Completed:** T-1104 — Backfill existing embeddings with enriched format
- **Next Task:** Sprint 11 COMPLETE. Phase 4 COMPLETE. Next: Phase 5 S12 (Google Driver Hardening)
- **Tasks Done:** 4/4
- **SP Completed:** 8/8
- **Last Updated:** 2026-03-27 09:20

## Audit Findings Addressed

- E5: Embedding text missing sender/recipient/date metadata — ✅ T-1101 (From/To/Date/Subject header)
- E6: No chunk overlap — context lost at boundaries — ✅ T-1102 (20% configurable overlap)
- E7: Italian prefixes in embedding text — ✅ T-1103 (English Subject: prefix)
- Backfill: Old-format embeddings coexist with new — ✅ T-1104 (auto-purge + re-embed)

## Last Modified Files

- backend/src/common/interfaces/embedding-queue.interface.ts (T-1101: added `to` field)
- backend/src/common/events/email.events.ts (T-1101: added `to` to EmailIndexedEvent)
- backend/src/modules/email-sync/services/sync-message-processor.service.ts (T-1101: pass `to`)
- backend/src/modules/ai/services/email-indexed.handler.ts (T-1101: pass `to`)
- backend/src/modules/ai/services/embedding-composer.service.ts (T-1101/T-1102/T-1103)
- backend/src/modules/ai/services/knowledge-base.service.ts (T-1101: pass metadata to composer)
- backend/src/modules/ai/services/embedding-backfill.service.ts (T-1101: `to` in query + enqueue)
- backend/src/modules/ai/services/embedding-backfill-scheduler.service.ts (T-1104: purgeStaleEmbeddings)
- backend/src/modules/ai/services/__tests__/embedding-composer.service.spec.ts (T-1101/T-1103: updated assertions)
- backend/src/modules/push/push-dispatch.handler.spec.ts (T-1101: updated test event)

## Key Decisions Made

- T-1101: Metadata header uses `\n` separator (not `\n\n`) — keeps header compact, body follows naturally
- T-1101: `to` field added as `string[]` throughout pipeline (matches Prisma Email model)
- T-1101+T-1103: Combined in single commit — English prefix change was part of metadata restructure
- T-1102: Overlap snaps to sentence boundary (previous `\n`) to avoid mid-word splits
- T-1102: Safety: if overlap > chunk advance distance, falls back to no-overlap to prevent infinite loop
- T-1104: Detect old format via `metadata->'to' IS NULL` instead of content prefix check — simpler, reliable
- T-1104: Purge-then-backfill pattern reuses existing orphan detection — no duplicate embedding logic

## Patterns Established

- Embedding text format: `From: ...\nTo: ...\nDate: YYYY-MM-DD\nSubject: ...\n[body]`
- Chunk overlap: configurable via `AI_EMBEDDING_CHUNK_OVERLAP` env (0-50%, default 20)
- Stale embedding detection: check JSONB metadata for missing keys (extensible for future format changes)

## Blockers / Notes

- None. Sprint 11 complete. Phase 4 complete.
- Phase 5 (Driver Resilience) starts with S12 (Google Driver Hardening).
- Old-format embeddings will be gradually purged (100/run, every 10 min) — full re-index takes ~hours depending on volume.

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: not affected (backend-only sprint)
- Tests: ✅ 25/25 passing (embedding-composer.service.spec.ts)
