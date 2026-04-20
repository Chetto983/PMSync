# Phase 149: Temporal Memory Decay - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 149-temporal-decay
**Areas discussed:** Helper API + EMA fusion, GC scope & store behavior, Nightly GC job wiring, Observability & rollout safety

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Helper API + EMA/decay fusion | How `weightCorrection` becomes decay-aware (signature, config injection), AND how (or whether) the Redis EMA blend in TriageLearningService also gets time-aware. | ✓ |
| GC scope & store behavior | 'Patterns below 0.3' spans 3 stores (Redis sender-scores hash, EmailTriageFeedback rows, TriageOverride rows). Delete vs soft-prune, GDPR implications. | ✓ |
| Nightly GC job wiring | Fold into existing TriageBackfillScheduler's 3 AM recalculation job vs spin up dedicated TriageDecayService with its own BullMQ cron. | ✓ |
| Observability & rollout safety | Prometheus metrics, legacy-binary-mode fallback flag, first-run behavior on existing Redis hashes + test suite migration. | ✓ |

**User's choice:** All four areas + freeform note: "deep search online best 2026 approach without reinvent the wheel"
**Notes:** Web research was performed for each area before question presentation. Research summary synthesized and presented inline before each AskUserQuestion batch.

---

## Area 1 — Helper API + EMA Fusion

### 1a — How should `weightCorrection` expose configurability?

| Option | Description | Selected |
|--------|-------------|----------|
| Pure fn, explicit params (Recommended) | `weightCorrection(ageDays, { halfLifeDays = 14, minWeight = 0.0 })`. Call sites read env via ConfigService and pass it in. Matches reranking.service.ts pattern. | ✓ |
| Service with DI + ConfigService | New `TriageDecayService` under ai module, injects ConfigService, owns the constants. Helper file becomes thin re-export. | |
| Pure fn, env read internally | Reads `process.env.TRIAGE_DECAY_HALF_LIFE_DAYS` directly inside the function. Simplest but impure and test-unfriendly. | |

**User's choice:** Pure fn, explicit params
**Notes:** Matches existing `backend/src/modules/ai/utils/` pure-util convention. Planner should copy the static-constant + pure-method style from `reranking.service.ts`.

### 1b — EMA/decay fusion for Redis sender scores

| Option | Description | Selected |
|--------|-------------|----------|
| Time-aware blend weight (Recommended) | In `blendScores`, compute `prevWeight = EMA_PREV_WEIGHT * exp(-dt/halfLife)` where dt = now - prev.lastUpdated. Matches Boyd/Luxenberg EWMM pattern. | ✓ |
| Decay on read only | Blend stays fixed at 0.7. getSenderBehavior multiplies rates by exp(-ageSinceLastUpdate/halfLife) on read. | |
| Don't fuse — decay corrections only | Keep EMA as-is; only correction paths get decay via helper. Cynically argues the roadmap conflates two systems. | |
| Both: time-aware blend + read-time clamp | Belt-and-suspenders; most defensive but adds cognitive load. | |

**User's choice:** Time-aware blend weight
**Notes:** Uses the already-tracked-but-unused `SenderBehaviorScore.lastUpdated` field. No schema change; wire directly into `flushSenderSignals`.

### 1c — Fate of Redis 30-day TTL

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as outer backstop (Recommended) | Bump to 45d (above natural decay→0.3 boundary at 24.3d + buffer). Decay does real work, TTL is hygiene. | ✓ |
| Remove entirely | Nightly GC is sole mechanism. Cleaner but risky if job fails for weeks. | |
| Make it `TRIAGE_DECAY_HALF_LIFE_DAYS * 4` | Derived TTL = 4 half-lives = weight ~0.0625. Auto-scales if half-life changes. | |

**User's choice:** Keep as outer backstop
**Notes:** CONTEXT.md D-03 implements this as `halfLifeDays * 4` in seconds (unifies option 1 and 3 — derived scale with natural backstop semantics).

---

## Area 2 — GC Scope & Store Semantics

### 2a — Which stores are "patterns" for GC?

| Option | Description | Selected |
|--------|-------------|----------|
| Redis sender-scores hash (Recommended) | `triage:sender-scores:{tenantId}` HDEL fields whose decayed score drops below 0.3. Primary target. | ✓ |
| TriageOverride rows (Recommended) | DB rows auto-promoted in Phase 147. GC when underlying correction signal decays below 0.3. | (initially missed; confirmed in follow-up) |
| EmailTriageFeedback raw rows | Raw signals, not patterns. NOT recommended — conflates retention with staleness. | |
| Redis signal buffer lists | Already has 10-min TTL. Nothing to GC. | |

**User's choice:** Initial multiSelect picked only Redis sender-scores. Follow-up clarified both Redis sender-scores + TriageOverride are in-scope.
**Notes:** Contradiction between 2a and 2b (which assumed TriageOverride deletion) surfaced and resolved via a single follow-up question.

### 2b — Delete semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Redis HDEL + TriageOverride hard delete (Recommended) | Redis: HDEL. DB: `deleteMany`. Prometheus counter is audit trail. Matches `orphan-embedding-cleanup` pattern. | ✓ |
| Redis HDEL + TriageOverride soft-prune (pruned_at) | Add `prunedAt` column, filter queries. Audit-friendly but requires blocking Prisma migration. | |
| Soft-prune both (staleAt on Redis) | Max reversibility, max complexity. Probably overkill. | |

**User's choice:** Redis HDEL + TriageOverride hard delete
**Notes:** Avoids a blocking Prisma migration. Recoverability via upstream EmailTriageFeedback.

### 2c — TriageOverride confidence computation

| Option | Description | Selected |
|--------|-------------|----------|
| Recompute at GC time from EmailTriageFeedback (Recommended) | Nightly job re-runs Phase 147 D-09b math (`count * exp(-age/14)`) across feedback rows. No schema change. | ✓ |
| Store `lastPromotedAt` + age-decay stored confidence | Simpler arithmetic but ignores reinforcement from newer corrections. | |
| Add `confidence` + `lastReinforced` columns | Most accurate; requires Prisma migration + correction-consumer wiring. | |

**User's choice:** Recompute at GC time from EmailTriageFeedback
**Notes:** No blocking Prisma migration. Naturally accounts for reinforcement (newer feedback keeps decayed sum above threshold).

### 2a follow-up — TriageOverride in/out of scope

| Option | Description | Selected |
|--------|-------------|----------|
| In scope (Recommended) | GC both Redis sender-scores AND TriageOverride rows. Confirms 2b/2c. | ✓ |
| Out of scope — only Redis | Only Redis. TriageOverride deferred to Phase 152. 2b/2c answers apply when decay tackled later. | |

**User's choice:** In scope

---

## Area 3 — Nightly GC Job Wiring

### 3a — Where does GC live?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend TriageBackfillScheduler (Recommended) | Add `type: 'decay-gc'` to existing scheduler's BullMQ worker. Zero new infra. | ✓ |
| Dedicated TriageDecayService | New service + queue + cron. Cleaner separation but more boilerplate. | |
| Fold INTO processRecalculation | Prepend GC step in same handler; tightest coupling. | |

**User's choice:** Extend TriageBackfillScheduler

### 3b — Cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Nightly 3 AM, same slot as recalc (Recommended) | Single cron `0 3 * * *`. Deterministic ordering. | ✓ |
| Nightly 2 AM (before recalc) | Separate cron an hour earlier for buffer. Minor gain. | |
| Weekly Sunday 5 AM | Less churn but lets stale patterns linger. Contradicts "nightly" criterion. | |

**User's choice:** Nightly 3 AM, same slot as recalc

### 3c — Order within a tenant's pass

| Option | Description | Selected |
|--------|-------------|----------|
| GC first, then recalc (Recommended) | Recalc reads fresh state; avoids promote-then-delete race. | ✓ |
| Recalc first, then GC | Recalc uses current (possibly stale) data. | |
| N/A — independent services | Only if 3a option 2 (dedicated service). | |

**User's choice:** GC first, then recalc

### 3d — Per-run scope

| Option | Description | Selected |
|--------|-------------|----------|
| All active tenants per run, bounded (Recommended) | `findMany({ isActive, deletedAt: null }, take: 50)` + sleep(500ms). Matches existing recalc. | ✓ |
| Fan-out job-per-tenant | N jobs, failure isolation, more queue noise. | |

**User's choice:** All active tenants per run, bounded

---

## Area 4 — Observability & Rollout Safety

### 4a — Prometheus metrics (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| `triage_patterns_gc_total` counter (Recommended) | Counter labeled by `store` + `tenant_id`. Reused by Phase 151. | ✓ |
| `triage_decay_half_life_days` gauge (Recommended) | Exposes configured half-life. (Renamed to `_seconds` per Prometheus canon — see Notes.) | ✓ (renamed) |
| `triage_decay_last_run_timestamp` gauge (Recommended) | `Date.now()` at end of GC pass. Alerts on silent job failures. (Renamed to `_timestamp_seconds`.) | ✓ (renamed) |
| Per-sender-score histogram | Cardinality risk; defer to Phase 155. | |

**User's choice:** All three recommendations + freeform "deep search best 2026 pattern"
**Notes:** Additional web research confirmed Prometheus naming canon requires `_total` for counters (already correct), `_seconds` base unit (not `_days`), and `_timestamp_seconds` for epoch gauges. Gauge names normalized to `triage_decay_half_life_seconds` and `triage_decay_last_run_timestamp_seconds`. The env var `TRIAGE_DECAY_HALF_LIFE_DAYS` stays in human-friendly units; the metric converts.

### 4b — Feature flag / rollback switch

| Option | Description | Selected |
|--------|-------------|----------|
| No flag — `TRIAGE_DECAY_HALF_LIFE_DAYS=9999` is the kill switch (Recommended) | Absurdly large half-life effectively disables decay. Single env redeploy to roll back. | ✓ |
| `TRIAGE_DECAY_MODE=exponential|binary` kill switch | Dispatches to old 1/0 logic. More code to delete later. | |
| `TRIAGE_GC_ENABLED=true|false` | Decay on, GC behind flag. Default true, removable after stable week. | |

**User's choice:** No flag — env kill switch only
**Notes:** Aligned with Octopus 2025 "flags for safety, not features." Zero tech debt for post-rollout cleanup.

### 4c — Existing test suite fate

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite to continuous assertions (Recommended) | Replace `toBe(1|0)` with `toBeCloseTo` + property-based tests. The *spec* changes, not a broken impl — so CLAUDE.md "don't modify tests" doesn't apply. | ✓ |
| Keep old tests guarded by mode flag | Both modes coexist until flag removed. | |
| Delete old tests, write entirely new | Loses edge-case regression coverage. | |

**User's choice:** Rewrite to continuous assertions

### 4d — First production run behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Let natural decay do the work (Recommended) | No migration. Existing `lastUpdated` ≤30d (Redis TTL), pass 1 GCs ~24d+ entries, leaves younger intact. | ✓ |
| Backfill script to touch lastUpdated on deploy | Buys 24d settling time. Operational step likely unnecessary. | |
| Dry-run mode on first pass | Emit metrics without deleting; flip flag on next deploy. Most conservative. | |

**User's choice:** Let natural decay do the work

---

## Claude's Discretion

Areas left explicitly to planner/executor judgment:
- Helper file layout: single `weightCorrection` vs adding named export `decayWeight(ageDays, opts)` for semantic clarity.
- Prometheus client library integration approach (follow whatever pattern is established in the ai module).
- Tenant-iteration error handling style (try/catch per tenant with Prometheus failure counter, or log-and-continue).
- Exact BullMQ job handler shape (extract `processDecayGc` private method vs inline).

## Deferred Ideas

- Per-sender-score histogram (cardinality — revisit in Phase 155).
- Unify decay half-life with `reranking.service.ts` via `backend/src/common/decay.ts` — not yet worth the refactor.
- Dedicated `TriageDecayService` — revisit in Phase 151 if multiple consolidation sweeps emerge.
- `TRIAGE_GC_ENABLED` canary flag — rejected; revisit if first-prod-run surprises.
- Soft-prune `TriageOverride` with `prunedAt` column — revisit if audit UX or regulation requires it.
- `EmailTriageFeedback` retention policy — separate GDPR-driven concern.
