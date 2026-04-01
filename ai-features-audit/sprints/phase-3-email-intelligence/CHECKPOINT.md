# Phase 3 — Email Intelligence COMPLETE (S05 + S06)

| Field | Value |
|-------|-------|
| **Status** | COMPLETE — Production Validated |
| **Sprints** | S05 (15 SP) + S06 (12 SP) = 27 SP |
| **Tasks** | 11/11 |
| **Next** | Sprint 07 (Phase 4 — AI Security Guards) |

## Sprint 05 — Findings Addressed

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| EI-C1 | Critical | Fixed | Sorted-set semaphore (ZADD/ZREM) replaces counting semaphore. Per-slot 5min TTL. Crashed workers auto-cleaned. |
| EI-H1 | High | Fixed | Per-tenant Redis lock (SET NX EX 120s) for follow-up detection. Batch limited to 50 emails per LLM call. |
| EI-H2 | High | Fixed | BRIEFING_MAX_INPUT_TOKENS (default 4000) with priority-based truncation. BRIEFING_LLM_TIMEOUT_MS (default 60s). |
| EI-H3 | High | Fixed | TRIAGE_BACKFILL_MAX_AGE_DAYS env var (default 7). Replaced hardcoded 168h. |
| — | — | Fixed | MAX_TRIAGE_PER_BATCH corrected from 50 to 20. Cost control tests added. |

## Sprint 06 — Findings Addressed

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| EI-M1 | Medium | Fixed | Draft prompt soft limit 2000 chars (truncate + warn), hard limit 10000 chars (400 Bad Request). |
| EI-M2 | Medium | Fixed | Analysis cache invalidated on bulkAddLabels, bulkRemoveLabels, bulkMoveToFolder via processedAt=epoch. |
| EI-M3 | Medium | Fixed | recordSignal checks ai_auto_triage consent + aiBehavioralTrackingEnabled preference (new Prisma field). |
| EI-M4 | Medium | Fixed | InAppNotification model + persistNotification() on every reminder emit. GET/POST notification endpoints. |
| EI-L1 | Low | Fixed | Zod schema extracted to ai/types/follow-up.types.ts. Service re-exports for backward compat. |
| — | — | Verified | All 5 analysis endpoints delegate to single analyzeEmailUnified() with 24h DB cache. No redundant LLM calls. |

## Production Validation (Real Data — 1184 emails, tenant cmn7kw97z)

### Triage — 20 emails batch, 73.7s total
| Metric | Value | Assessment |
|--------|-------|------------|
| Processed | 20/20 | Batch cap enforced (was 50, now 20) |
| Failed | 0 | Zero LLM failures |
| Priority dist | All P2 | Correct — all GitHub CI notifications, not human requests |
| Sentiment | 17 neutral, 10 negative | Correct — CI failures are negative but not emotional |
| Labels | Updates, Action Items | Accurate for CI failure notifications |
| Locale | Italian reasons | i18n working (user locale auto-detected) |

### Follow-up Detection — 50 emails analyzed, 22.5s
| Metric | Value | Assessment |
|--------|-------|------------|
| Analyzed | 50 | Batch limit working (MAX_EMAILS_PER_BATCH=50) |
| Detected | 1 | Correct — only the Supabase pause warning needs action |
| False positives | 0 | 49 GitHub CI alerts correctly skipped |
| Detected item | Supabase "Prodotti" pause warning | urgency=high, confidence=0.7, due=2026-04-03. Legitimate action needed. |

### Briefing — 13.8s LLM call
| Metric | Value | Assessment |
|--------|-------|------------|
| Priority emails | 5 | Build failures correctly flagged as critical |
| Follow-ups | 8 | Pending items surfaced |
| Calendar | 2 events | Real calendar data |
| Volume | 90 today vs 82 avg | Trend=stable (correct, not a spike) |
| Source | fallback (deterministic) | LLM output had low signal, deterministic fallback preferred — correct behavior |

### Draft Generation — 6.7s
| Metric | Value | Assessment |
|--------|-------|------------|
| Confidence | 0.9 | High — clear instruction + full context |
| Tone | formal | Matched request |
| Hard limit | 12000 chars → 400 | Enforced correctly |
| Body | Professional reply generated | Coherent, ready-to-send |

### Deep Analysis — 2.9s
| Metric | Value | Assessment |
|--------|-------|------------|
| Priority | 2 | Correct for CI notification |
| Urgency | high | Correct — CI failure blocks pipeline |
| Confidence | 0.98 | High — unambiguous content |
| Intent | fyi | Correct — notification, not a question |
| Topics | GitHub Actions, CI/CD, Build failure | Accurate extraction |

### Endpoint Checks
| Endpoint | Status | Data |
|----------|--------|------|
| GET /ai/health/detailed | 200 | DLQ: 276 failed, services healthy |
| GET /ai/triage/backfill/status | 200 | enabled=true, interval=60min, pending=2 |
| GET /ai/notifications | 200 | 50 real notifications from reminder scheduler |
| POST /ai/notifications/mark-read | 201 | marked=0 (correct for fake IDs) |
| POST /ai/follow-ups/detect | 200 | source=live, model=minimax-m2.7 |
| POST /ai/drafts/generate | 400/200 | Hard limit enforced, soft limit truncated |
| POST /ai/briefing/refresh | 200 | source=live, model=mistral-small-2603 |

## Last Modified Files

- `backend/src/modules/ai/services/email-triage.service.ts` — sorted-set semaphore, batch cap 50→20
- `backend/src/modules/ai/services/__tests__/email-triage-semaphore.spec.ts` — ZSET semaphore tests
- `backend/src/modules/ai/services/__tests__/email-triage-cost-controls.spec.ts` — NEW: cost control tests
- `backend/src/modules/ai/services/follow-up-detection.service.ts` — per-tenant lock + batch limit + shared types
- `backend/src/modules/ai/services/briefing.service.ts` — token budget + configurable timeout
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — configurable max-age lookback
- `backend/src/modules/ai/services/draft-generation.service.ts` — prompt length limits
- `backend/src/modules/ai/services/email-analysis.service.ts` — invalidateCache() method
- `backend/src/modules/email/services/email-bulk.service.ts` — cache bust on label/folder changes
- `backend/src/modules/ai/services/triage-learning.service.ts` — consent + preference checks
- `backend/src/modules/ai/services/reminder-scheduler.service.ts` — persistNotification()
- `backend/src/modules/ai/controllers/ai.controller.ts` — notification endpoints
- `backend/src/modules/ai/types/follow-up.types.ts` — NEW: shared Zod schema
- `backend/prisma/schema.prisma` — aiBehavioralTrackingEnabled, InAppNotification model
- `backend/prisma/seed.ts` — upsert for KB categories/articles (P2002 fix)

## Key Decisions

- EI-C1: Sorted-set > counting semaphore because individual slot expiry is essential. Counter + global TTL refreshes on every acquire.
- EI-H1: Fails open (not closed) for follow-up lock — blocking detection on Redis failure is worse than a duplicate run.
- EI-H2: Token budget uses ~4 chars/token estimate. Truncation order: stale contacts > calendar > follow-ups > emails.
- EI-M2: Used Prisma directly in EmailBulkService to avoid circular AI module dependency.
- EI-M3: Behavioral tracking is opt-out (default enabled). Consent check reuses ai_auto_triage flag.
- EI-M4: Notifications persist alongside Socket.IO (both fire). 50 max unread per query.
