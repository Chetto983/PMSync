# Phase 151: Dreaming Consolidation Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 151-dreaming-consolidation
**Areas discussed:** Service architecture, Light-phase semantics, Deep vs REM scope split, REM contradiction algorithm

---

## Gray Area Selection

User selected all 4 areas + requested "deep search online best 2026 practice and new memory consolidation" as a parenthetical (same pattern as Phase 149/150). Four parallel web searches ran before Area 1 discussion.

| Option | Description | Selected |
|--------|-------------|----------|
| Service architecture | Extend TriageBackfillSchedulerService vs factor dedicated module | ✓ |
| Light-phase semantics | What "correction buffer merge + EMA update + cosine dedup" maps to | ✓ |
| Deep vs REM scope split | Where P150 stub ends and P151 Deep begins; REM-exclusive responsibilities | ✓ |
| REM contradiction algorithm | Concrete signal for cross-label contradiction detection | ✓ |

**User's choice:** All four. Notes: "deep search online best 2026 pratice"

---

## Web Research (before questions)

Four parallel `WebSearch` queries ran:

1. **"OpenClaw Dreaming 2026 Light Deep REM phase consolidation BullMQ cron architecture production"** → OpenClaw 4.5 GA Apr 2026, 3-phase cron default 3AM, thresholds `minScore 0.8 / minRecallCount 3 / minUniqueQueries 3`, Light=ingestion+snippet parsing, REM=concept-tag aggregation, Deep=promotion. Cited Dev.to guide + docs.openclaw.ai + openclawlaunch.com.
2. **"agent memory consolidation Light phase hourly buffer dedup cosine similarity EMA 2026 best practice"** → CrewAI uses 0.85 cosine as sweet spot; too low=false positives, too high=miss contradictions. Recency decay 0.995 hourly. OpenClaw Light = Jaccard 0.9 dedup. Plain filesystem memory scores 74% beating vector-store libs (practical simplicity matters).
3. **"knowledge graph memory contradiction detection semantic conflict agent 2026 bidirectional edge anti-poisoning"** → Graphiti/Zep bitemporal: compare new edge vs semantically related, `validUntil=now()` on loser. KARMA: logical inference over graph, not LLM debate. Martian-Engineering three-layer with automated contradiction detection. Bidirectional edge↔episode indices.
4. **"NestJS BullMQ scheduler service consolidation module boundary 2026 single-responsibility cron handler"** → BullMQ clean feature-module separation; producers/processors per feature. No strong argument for monolithic scheduler.

---

## Area 1 — Service architecture

### Q1: Where should Light/Deep/REM handlers live?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated TriageConsolidationScheduler module (Recommended) | New `backend/src/modules/ai/consolidation/` with .module.ts, `triage-consolidation` queue, worker, 3 handler methods. NestJS 2026 feature-module guidance. Phase 149 D-07 anticipated this. | ✓ |
| Extend TriageBackfillSchedulerService in-place | Three more job types on the union, three more switch branches. Cheapest; accepts >700 LF file. | |
| New module but keep BullMQ queue shared | New TriageConsolidationService registers job types on existing 'triage-backfill' queue. Namespace without new queue overhead. | |

**User's choice:** Recommended — dedicated module.

### Q2: Should Phase 151 migrate Phase 150's 'affinity-promotion' into the new home?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — move + rename to 'deep-consolidation' (Recommended) | Phase 151 Deep subsumes; rename job type; register on new scheduler; delete stub from TriageBackfillSchedulerService. No dual-writer. | ✓ |
| No — keep 'affinity-promotion', add 'deep-consolidation' separately | Soak 151 alongside 150's writer. Risk: two crons at 3AM racing on same graph_edges. | |
| Yes — move, keep job name verbatim | Honors P150 D-01 wording ("same queue name and job id"). No cutover window. | |

**User's choice:** Recommended — move + rename.

### Q3: How should the new scheduler coordinate with Phase 149's decay-gc?

| Option | Description | Selected |
|--------|-------------|----------|
| Deep handler calls decay-gc helpers first, internally (Recommended) | Import `processDecayGcForTenant` + `processAffinityEdgeDecayForTenant`. Deterministic ordering. Phase 149 decay-gc stays as safety net. | ✓ |
| Move decay-gc to consolidation scheduler too | Cleanest boundary but touches Phase 149 code (Guard-F drift risk). | |
| Deep invokes decay-gc inline via direct helper call | decay-gc loses standalone Prometheus timestamp gauge. | |

**User's choice:** Recommended.

---

## Area 2 — Light-phase semantics

### Q1: What does 'correction buffer' map to in PMSync, and what does Light compress?

| Option | Description | Selected |
|--------|-------------|----------|
| EmailTriageFeedback row merging (Recommended) | Group by (tenantId, senderEmail, type, oldValue, newValue) within rolling 1-hour window. Cosine>0.9 on EmailEmbedding of underlying emails. | ✓ |
| Redis signal-buffer 1-hour force-flush | Just a safety-net hourly trigger of existing flushSenderSignals. DREAM-01 becomes no-op rename. | |
| Both stores — Redis flush + Postgres row merge | Most faithful. Highest code weight. | |

**User's choice:** Recommended.

### Q2: Where should Light's cosine>0.9 dedup get its embeddings?

| Option | Description | Selected |
|--------|-------------|----------|
| Existing EmailEmbedding (Recommended) | Fetch corrected email's 1024-dim vector. pgvector cosine_distance. Missing embedding → not dedup'd (safer). | ✓ |
| Embed correction text (type + newValue) | New correctionEmbedding column + worker cost. | |
| Skip cosine dedup this phase — exact-match only | Defers to Phase 152/155. SC-1 partial miss. | |

**User's choice:** Recommended.

### Q3: How should Light merge the rows — destructive collapse or non-destructive?

| Option | Description | Selected |
|--------|-------------|----------|
| Non-destructive: summary table + raw rows kept (Recommended) | New TriageCorrectionCluster model; raw EmailTriageFeedback untouched. Zettelkasten-compliant. | (user picked Other) |
| Destructive: clusterId + soft-tombstone on EmailTriageFeedback | Saves one table but violates immutable-atom principle. | |
| Destructive: delete duplicates after merge | Breaks Phase 147 promotion + 148 TP sweeper. | |

**User's choice:** "Other" — "best approach can scale and remove all legacy shit file". Reflected back in plain-text follow-up; user clarified with "keep best strategy". Interpreted as Reading 1 (non-destructive cluster table + delete stale code surfaced by migration, NOT raw-row deletion). Locked as D-B3 + D-B5.

### Q4: What does 'updates EMA scores' mean in Light's context?

| Option | Description | Selected |
|--------|-------------|----------|
| Force-flush SenderBehaviorScore EMA for tenants with activity (Recommended) | Invoke existing TriageLearningService.flushSenderSignals for each touched sender. Uses Phase 149 D-02 time-aware blend. | ✓ |
| Write new TriageCorrectionEMA store (per sender+label) | Heavy lift; distinct from SenderBehaviorScore. | |
| No EMA update — rely on existing 5-min flush cycle | SC-1 partial miss. | |

**User's choice:** Recommended.

### Q5: Light cron cadence — strict hourly or offset?

| Option | Description | Selected |
|--------|-------------|----------|
| Every hour at :15 (Recommended) | '15 * * * *'. Avoids :00 clash. Deterministic. | ✓ |
| Every hour at :00 | Matches spec wording literally. | |
| Configurable via env | Overkill per Phase 149 D-12. | |

**User's choice:** Recommended.

---

## Area 3 — Deep vs REM scope split

### Q1: Domain aggregation — Deep or REM?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep in Deep (Recommended) | Phase 150 2nd-pass domain aggregation stays in Deep. REM handles sub-threshold signal Deep can't see. | ✓ |
| Move to REM only | New domains wait up to 7 days to influence triage. | |
| Both — Deep covers new, REM reconciles | Most complete; adds observability surface for Phase 155. | |

**User's choice:** Recommended.

### Q2: Temporal validity — when does Phase 151 Deep set validUntil?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Phase 150 D-06: validUntil NULL, decay-gc hard-deletes (Recommended) | No change from P150. validFrom populated, edges time-scoped via GC. Reserved for P152 SAFE-03. | ✓ |
| Deep sets explicit validUntil = validFrom + 30 days | Decouples TTL from evidence strength. P150 rejected this. | |
| Bitemporal supersede (validUntil = now() on old) | Graphiti/Zep 2026 pattern. Phase 152 SAFE-03 home. | |

**User's choice:** Recommended.

### Q3: SC-2 'recalculates per-label accuracy' — how does Deep trigger Phase 148's sweeper?

| Option | Description | Selected |
|--------|-------------|----------|
| Deep enqueues Phase 148 LabelAccuracyService sweep for touched labels (Recommended) | Bounded fan-out via existing LabelAccuracyQueue. | ✓ |
| Full-tenant accuracy sweep once per nightly run | Heavy; overkill for tenants with 100+ labels. | |
| Don't trigger — Phase 148's existing nightly sweep is enough | Weakest read of SC-2. | |

**User's choice:** Recommended.

### Q4: REM reconciliation scope — what does REM's 'domain-level pattern aggregation' mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Sub-threshold roll-up: REM promotes domains with 3+ DISTINCT sub-threshold senders (Recommended) | Novel signal Deep can't produce. Bridges Phase 147 D-04 constants. | ✓ |
| REM re-evaluates existing domain edges only | Redundant with decay-gc recompute. | |
| REM does NO domain work | Simplest; minor departure from roadmap wording. | |

**User's choice:** Recommended.

---

## Area 4 — REM contradiction algorithm

### Q1: What counts as a contradiction in REM? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Same source, competing edges (Recommended) | GROUP BY (tenantId, sourceId) HAVING COUNT(DISTINCT targetId) > 1 AND MIN(confidence) >= 0.8. Pure SQL. | ✓ |
| Sender vs domain disagreement (Recommended) | Sender edge and domain edge both ≥0.8 pointing to different labels. Surfaces aiPrompt conflicts. | ✓ |
| Accuracy regression via Phase 148 LabelAccuracyProfile | Expensive correlation; P152 SAFE-03 territory. | |
| Mutually exclusive label violation | Phase 153 LABEL-02 hardens the field first. | |

**User's choice:** First two — competing source + sender-vs-domain.

### Q2: How should REM record contradictions found?

| Option | Description | Selected |
|--------|-------------|----------|
| New TriageConsolidationAudit table (Recommended) | Persistent audit row per contradiction. Phase 152 reads for review queue. | (user picked "Both") |
| Prometheus counter only | SC-5 compliance minimal; Phase 152 has to re-scan. | |
| Both — table + counter | Audit row + counter. | ✓ |

**User's choice:** Both — table + counter. Note: the Recommended option mentions the counter too ("Also emit..."). User's pick confirms explicit dual write. Locked as D-D2 (both).

### Q3: What should REM DO with contradictions in Phase 151?

| Option | Description | Selected |
|--------|-------------|----------|
| Record only — no auto-mutation (Recommended) | Detective-only in P151; P152 SAFE-02 owns resolution. | |
| Auto-invalidate the lower-confidence edge | Risk of oscillation on close confidences. | |
| Auto-demote both edges to 0.79 confidence | Conservative resolution; neither wins the skip path. | ✓ |

**User's choice:** Auto-demote both to 0.79 — departed from Recommended. Deliberate design choice for active defense.

**Notes:** Implication locked in D-D4 — `confidence` field now has two writers (promotion math + REM contradiction clamp). Bounded oscillation accepted (Deep re-promotes freely from evidence) until Phase 152 SAFE-03 ships `frozenUntil` cooldown.

### Q4: After REM auto-demotes, can Deep re-promote on next nightly run?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — Deep re-promotes freely; Phase 152 owns cooldown (Recommended) | Simplest; confidence field stays semantically pure. Bounded oscillation accepted. | ✓ |
| No — add frozenUntil column, 7-day cooldown | Breaks oscillation deterministically. Pre-empts Phase 152 territory. | |
| Contextual — cooldown only if 2nd consecutive REM demote | Escalating sanction; most code. | |

**User's choice:** Recommended.

### Q5: REM cron cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Sunday 5AM — '0 5 * * 0' (Recommended) | Matches SC-3. 2-hour offset from Deep absorbs overrun. | ✓ |
| Monday 3AM — '0 3 * * 1' | Aligns with reporting rhythm. Collides with Deep slot. | |
| Configurable via env | Overkill per P149 D-12. | |

**User's choice:** Recommended.

---

## Claude's Discretion

- Exact Prisma migration filename timestamp.
- File layout: whether TriageCorrectionCluster / TriageConsolidationAudit sit near other Triage* models or standalone.
- Helper file extraction for Light's embedding-cosine loop and REM's detection SQL — follow Phase 149/150 pattern if non-trivial.
- Whether `TriageConsolidationAudit.notes` JSONB stores structured diagnostics in Phase 151 or stays empty `{}`.
- Test fixture approach for the 3 handlers — follow Phase 149/150 test pattern.
- Whether Deep's `LabelAccuracyQueue` enqueue uses batched payload or per-label message — depends on queue ergonomics.
- Whether to seed a minimum N-hour warmup on Light before first cluster write.
- Implementation of Light's embedding-cosine loop (app-layer JS vs pgvector `<=>` SQL).

## Deferred Ideas

- `frozenUntil DateTime?` column + demotion-escalation — Phase 152 SAFE-03.
- Bitemporal supersession on contradiction loser — Phase 152 SAFE-03.
- Accuracy-regression contradiction kind — Phase 152 SAFE-02.
- Mutually-exclusive-label violation kind — Phase 153 LABEL-02.
- Human-review UI — Phase 152 SAFE-02.
- Auto-rollback on >15% accuracy drop — Phase 152 SAFE-03.
- Moving Phase 149's decay-gc to consolidation scheduler — future cleanup.
- Per-correction embedding artifact — Phase 155+ if needed.
- Per-phase configurable cron — rejected per P149 D-12.
- Full-tenant accuracy sweep — rejected in D-C3.
- Light cadence shorter than 1 hour — rejected (SC-1 hourly).
- Jaccard dedup — rejected; pgvector cosine is native.
- Phase 155 dashboards / Phase 156 E2E benchmarking — own phases.
- Cross-tenant pattern aggregation — out of scope for v13.
