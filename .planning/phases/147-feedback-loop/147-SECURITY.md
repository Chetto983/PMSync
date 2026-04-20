---
phase: 147
slug: feedback-loop
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-20
---

# Phase 147 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implemented code by `gsd-security-auditor` on 2026-04-20. All 22 declared STRIDE threats closed.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| tenant → tenant | Every DB query includes `tenantId`. Queue jobs carry `tenantId` and processor wraps in `withoutTenantScopingAsync` to intentionally bypass RLS while the job data itself scopes queries. | `EmailTriageFeedback` rows, `TriageOverride` rows, `EmailAnalysis` rows, sender/domain patterns |
| client → `POST /emails/:id/correct-triage` | NEW endpoint, phase 147-04 — TenantGuard + RolesGuard (`admin`/`manager`/`super-admin`) + `RateTierDecorator('safe-write')`; DTO validated (`@IsIn(['label_correction'])`, `@MaxLength(200)` on values). `tenantId` from `req.user.tenantId`, never body. | `{ type, oldValue?, newValue }` |
| client (super-admin) → `POST /ai/triage-overrides/promote-suggestions` | NEW endpoint, phase 147-05 — TenantGuard + RolesGuard(`super-admin`) + `RateTierDecorator('destructive-write')`. Idempotency short-circuit 5min. | none (body-less admin trigger) |
| untrusted-input → LLM prompt | CORRECTIONS block and `USER_OVERRIDE` hint receive sender addresses (PII). Pipeline: `redactPii` → `sanitizeForLLM({maxLength:80, stripCodeBlocks:true})` → `buildTaggedPromptSection`. Prompt cap `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH=4600` preserved. | Redacted, truncated sender patterns |
| redis-queue → worker | Debounced promote job carries only `{ tenantId, triggeredAt }`; BullMQ `deduplication: { id: 'promote:<tenantId>', ttl: 5min }` + 0–60s safety-net jitter. | Minimal — no secrets, no PII |
| local-dev → prod DB | Migration `20260419120000_147_feedback_loop_signal_and_triagesource` applied LOCALLY in phase 147-02. Railway `prisma migrate deploy` applies the same committed SQL file to prod on push. `prisma db push` forbidden (per memory `feedback_never_db_push_production`). | `ADD COLUMN signal`, `ADD COLUMN triageSource`, `CREATE INDEX` — no destructive statements |
| triage-pipeline → LLM | Existing prompt surface; override hint goes through `buildTaggedPromptSection` with its own 200-char budget. Few-shot CORRECTIONS block inserted without invalidating prefix cache. | Override pattern (redacted), correction exemplars |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-147-01-01 | Information disclosure | `TriageCorrectionService.getFewShotExamples` | mitigate | `tenantId` enforced in both `emailTriageFeedback.findMany` (`triage-correction.service.ts:41`) and `email.findMany` (`:58`). Spec asserts both at `triage-correction.service.spec.ts:29`. | closed |
| T-147-01-02 | Tampering | `EmailTriageFeedback.signal` column | accept | Default `'edit'` (`schema.prisma:2563`). No user-controlled write-path: `recordFeedback` is internal and callers hardcode value (`email-crud.service.ts:364` → `'correction'`, `triage-feedback.service.ts:124,156` → `'edit'`). | closed |
| T-147-01-03 | Denial of service | `getFewShotExamples` in-memory grouping | mitigate | `LOOKBACK_DAYS = 30` (`triage-correction.service.ts:11`) + cutoff at `:37` + composite index `(tenantId, signal, createdAt)` (`schema.prisma:2572`, migration line 8). | closed |
| T-147-02-01 | Denial of service (data) | Prisma migration generator | mitigate | Migration file contains 2× `ADD COLUMN` + 1× `CREATE INDEX`. Destructive-statement grep gate documented green in `147-02-SUMMARY.md:54`. `prisma db push` forbidden. | closed |
| T-147-02-02 | Elevation of privilege | Prisma client codegen | accept | Generated client is build-time only; no runtime secret exposure. Client files in `node_modules/.prisma/` contain only TypeScript type definitions. | closed |
| T-147-02-03 | Repudiation | Migration file | mitigate | `backend/prisma/migrations/20260419120000_147_feedback_loop_signal_and_triagesource/migration.sql` committed to git; Railway applies from version-controlled file, not live schema diff. | closed |
| T-147-03-01 | Tampering | Promotion rule | mitigate | `CONCENTRATION_RATIO=0.8`, `MIN_CORRECTIONS_FOR_PROMOTION=3`, `MIN_CORRECTIONS_FOR_DOMAIN=8`, `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3` (`triage-feedback.service.ts:45-47`), role-account exclusion (`:50-54`). Enforcement at `:252-266` (sender) and `:270-289` (domain). | closed |
| T-147-03-02 | Information disclosure | CORRECTIONS block in LLM prompt | mitigate | Per-line pipeline: `redactPii` → `sanitizeForLLM({ maxLength: CORRECTION_LINE_MAX_LENGTH=80, stripCodeBlocks: true })` → `buildTaggedPromptSection('CORRECTIONS', …)` (`email-analysis.service.ts:357-368`). | closed |
| T-147-03-03 | Denial of service | Debounced promote queue | mitigate | `deduplication: { id: 'promote:${tenantId}', ttl: DEDUPLICATION_TTL_MS=5min }` (`triage-promotion.queue.ts:168-178`). Safety-net jitter `Math.random() * 60_000` (`triage-promotion.service.ts:40, 229`). | closed |
| T-147-03-04 | Repudiation | Promotion action | mitigate | Redis idempotency key `triage:last-promoted:${tenantId}` with TTL 1h (`triage-promotion.service.ts:36`). BullMQ retention `removeOnComplete: 50, removeOnFail: 100` (`triage-promotion.queue.ts:89-90`). Full audit trail deferred to Phase 152. | closed |
| T-147-03-05 | Elevation of privilege | Prompt-cache invariant | mitigate | `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600` preserved (`email-analysis.service.ts:47`), warn-on-exceed at `:389-393`. Tests assert invariant ≤4600 including "WITH labels + corrections slices active" (`triage-prompt-budget.test.ts:121, 167, 204, 207, 236`). | closed |
| T-147-03-06 | Denial of service | Cron handler bootstrap race | mitigate | `scheduledJobs.registerHandler(TRIAGE_PROMOTION_SAFETY_NET, …)` invoked synchronously inside constructor (`triage-promotion.service.ts:60-66`) — no `OnModuleInit` window. Regression guard test at `triage-promotion.service.spec.ts:88-96`. | closed |
| T-147-04-01 | Spoofing | `POST /emails/:id/correct-triage` body | mitigate | Class-level `@UseGuards(TenantGuard, RolesGuard)` (`email-actions.controller.ts:97`), method `@Roles('admin','manager','super-admin')` + `@RateTierDecorator('safe-write')` (`:264-265`). DTO `@IsIn(['label_correction'])`, `@MaxLength(200)` (`:43-55`). `tenantId` from `req.user.tenantId` (`:273`). | closed |
| T-147-04-02 | Tampering | Auto-diff capture | mitigate | Fires AFTER transaction commit AND after `syncChangesToProvider` (`email-crud.service.ts:309-331`). `captureLabelDiff` + `enqueueDebounced` both `.catch((err) => logger.warn(...))`, never awaited. `signal='edit'` hardcoded in auto-diff path; `signal='correction'` only from explicit endpoint. | closed |
| T-147-04-03 | Elevation of privilege | Override short-circuit | accept | Muting short-circuit (`email-triage.service.ts:293-352`) reads `TriageOverride` via tenant-scoped `applyOverrides`. The table's write path is gated: `TriageOverridesController.create`/`remove` require `@Roles('admin','manager','super-admin')` (`triage-overrides.controller.ts:52, 74` — WR-04 fix); `TriagePromotionService.promoteOverrides` runs only under tenant-scoped internal lane-promotion loop. No unguarded writer. | closed |
| T-147-04-04 | Denial of service | Debounced enqueue on every PATCH | mitigate | Debounced `enqueueDebounced(tenantId)` on aiLabels PATCH (`email-crud.service.ts:322-330`); BullMQ dedup `promote:${tenantId}` TTL 5min collapses bursts (`triage-promotion.queue.ts:173-176`). | closed |
| T-147-04-05 | Information disclosure | Override hint in LLM prompt | mitigate | `buildTaggedPromptSection('USER_OVERRIDE', [overrideHint], 200)` hard cap (`email-analysis.service.ts:376-379`). Hint built from `or.override.pattern`, which is `toLowerCase().trim()`-validated ≤255 chars at write time (`triage-override.service.ts:90-99`). User-content path flows through redactPii + sanitizeForLLM (`email-analysis.service.ts:463-473`). | closed |
| T-147-04-06 | Repudiation | `triageSource` value | mitigate | Persisted on every `EmailAnalysis` write: pure-LLM at `email-analysis.service.ts:218, 238`; visible-override at `:226` (`'llm+rule'`); muting short-circuit at `email-triage.service.ts:328, 336` (`'rule'`). Schema nullable (`schema.prisma:1368`) for legacy backfill tolerance. | closed |
| T-147-05-01 | Elevation of privilege | Admin force-promote endpoint | mitigate | Class-level `@UseGuards(TenantGuard, RolesGuard)` (`triage-overrides.controller.ts:52`); method `@Post('promote-suggestions') @Roles('super-admin')` + `@RateTierDecorator('destructive-write')` (`:108-110`). `tenantId` from `req.user.tenantId` (`:123`). | closed |
| T-147-05-02 | Denial of service | Force-promote spam | mitigate | `IDEMPOTENCY_KEY = triage:last-promoted:${tenantId}`; if `Date.now() - Number(last) < MIN_INTERVAL_MS=5min` returns `{ promoted: 0, skipped: true }` (`triage-promotion.service.ts:108-120`). Force-promote routes through same `promoteOverrides`. | closed |
| T-147-05-03 | Tampering | `LANE_TO_ACTION` map | mitigate | `export const LANE_TO_ACTION: Record<string, string \| undefined>` — readonly const (`triage-override.service.ts:48-53`). Usage: `const action = LANE_TO_ACTION[s.target]; if (!action) continue;` (`triage-promotion.service.ts:134-135`) — unknown targets silently skip. | closed |
| T-147-05-04 | Information disclosure | Cache-invalidation email lookup | mitigate | Both `email.findMany` calls tenant-scoped (`triage-promotion.service.ts:161-165` sender, `:174-181` domain). Plumbing spec Scenarios 2 & 4 assert `tenantId: 't1'` in filter. | closed |

*Status: closed · open — all 22 threats closed.*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party).*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-147-01 | T-147-01-02 | `EmailTriageFeedback.signal` has no user-controlled write-path. All callers hardcode the value (`'edit'` from auto-diff, `'correction'` from explicit endpoint). Verified no external writer. | gsd-security-auditor | 2026-04-20 |
| AR-147-02 | T-147-02-02 | Prisma client codegen is build-time only; runtime client exposes no secrets. Verified `.prisma/` contains only generated TS types. | gsd-security-auditor | 2026-04-20 |
| AR-147-03 | T-147-04-03 | Muting-override short-circuit trusts the `TriageOverride` table as ground truth. Table write path is gated by `@Roles('admin','manager','super-admin')` on both create and delete (WR-04 fix, commit `072bf6f5`). No unguarded writer exists. | gsd-security-auditor | 2026-04-20 |
| AR-147-04 | WR-07 (review-fix) | Domain-scope cache-invalidation uses `from: { contains: '@<domain>' }` which may substring-match unrelated senders. `applyOverrides` matcher itself uses exact-tail `senderDomain === override.pattern` (`triage-override.service.ts:138`), so bleed only wastes cache-invalidation writes — no data leak. Documented inline at `triage-promotion.service.ts:147-165`. | davide marchetto | 2026-04-19 (commit `3b80ba6c`) |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-20 | 22 | 22 | 0 | gsd-security-auditor (auto) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-20
