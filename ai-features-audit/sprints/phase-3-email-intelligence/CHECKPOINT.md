# Sprint 06 Checkpoint — Follow-ups, Briefing & Draft Generation

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Last Task** | T-0606 |
| **Next Task** | Sprint 07 (T-0701) |
| **Tasks Done** | 6/6 |
| **SP Done** | 12 |

## Findings Addressed

| Finding | Status | Notes |
|---------|--------|-------|
| EI-M1 | Fixed | Draft generation prompt enforced: soft limit 2000 chars (truncate + warn), hard limit 10000 chars (400 Bad Request). |
| EI-M2 | Fixed | Analysis cache invalidated on bulkAddLabels, bulkRemoveLabels, bulkMoveToFolder via processedAt=epoch. Uses Prisma directly to avoid circular AI module dep. |
| EI-M3 | Fixed | recordSignal now checks ai_auto_triage consent + aiBehavioralTrackingEnabled preference (new schema field, default true = opt-out). |
| EI-M4 | Fixed | InAppNotification model + persistNotification() on every reminder emit. GET /ai/notifications + POST /ai/notifications/mark-read endpoints. |
| EI-L1 | Fixed | Zod schema extracted to ai/types/follow-up.types.ts. Service re-exports for backward compat. |

## Last Modified Files

- `backend/src/modules/ai/services/draft-generation.service.ts` — prompt length limits
- `backend/src/modules/ai/services/email-analysis.service.ts` — invalidateCache() method
- `backend/src/modules/email/services/email-bulk.service.ts` — cache bust on label/folder changes
- `backend/src/modules/ai/services/triage-learning.service.ts` — consent + preference checks
- `backend/prisma/schema.prisma` — aiBehavioralTrackingEnabled, InAppNotification model
- `backend/src/modules/ai/services/reminder-scheduler.service.ts` — persistNotification()
- `backend/src/modules/ai/controllers/ai.controller.ts` — notification endpoints
- `backend/src/modules/ai/types/follow-up.types.ts` — NEW: shared Zod schema
- `backend/src/modules/ai/services/follow-up-detection.service.ts` — re-export from types

## Key Decisions

- EI-M2: Used Prisma directly in EmailBulkService instead of injecting EmailAnalysisService to avoid circular AI module dependency.
- EI-M3: Behavioral tracking is opt-out (default enabled) since it improves triage quality. Consent check reuses existing ai_auto_triage feature flag.
- EI-M4: Notifications persist alongside Socket.IO (not instead of). Both fire. Endpoint returns max 50 unread, ordered by createdAt desc.
- T-0606: Verified all 5 analysis endpoints delegate to single analyzeEmailUnified() with 24h DB cache. No redundant LLM calls.

## Validation Status

- `npx tsc --noEmit` — PASS (all commits)
- `prisma db push` — PASS (both schema changes pushed to Railway)
- Phase 3 Email Intelligence — COMPLETE (S05 + S06)
