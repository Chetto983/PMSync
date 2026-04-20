# Phase 148: Per-Label Accuracy Profiles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `148-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 148 — Per-Label Accuracy Profiles
**Areas discussed:** TP/FP/FN semantics, Update timing & stratification, API + Frontend badge UX, Prometheus + backfill + model fit

---

## Gray area selection

**User picked:** all four gray areas + request for 2026 deep research and examples before each question set.

| Option | Description | Selected |
|--------|-------------|----------|
| TP/FP/FN semantics | Precise definition given Phase 147 `signal='correction'` vs `signal='edit'` split + implicit-TP temporal window | ✓ |
| Update timing & stratification | Inline vs batch; profile key dimensions (tenant, label, window, triageSource) | ✓ |
| API + Frontend badge UX | Endpoint shape, badge visual, cold-start threshold, confidence interval | ✓ |
| Prometheus + backfill + model fit | Cardinality strategy; day-1 data backfill; relation to existing AgentLearningProfile | ✓ |

---

## TP/FP/FN semantics

### Implicit TP window

| Option | Description | Selected |
|--------|-------------|----------|
| **14 days (Recommended)** | Aligns with Phase 149 half-life; long enough for late corrections, short enough for fast convergence | ✓ |
| 30 days | Matches Phase 147 promotion TTL but 30-day lag to first badge is poor UX for new labels | |
| 7 days | Fastest signal, but late-week catchup causes retroactive TP→FP flips | |
| No window — lifetime | Simplest but permanently inflates precision for unopened/archived mail | |

**User's choice:** 14 days.
**Notes:** Aberdeen et al. Gmail Priority Inbox paper cited — bounded action window is the production pattern.

### Do signal='edit' corrections count as FP?

| Option | Description | Selected |
|--------|-------------|----------|
| **Yes, both (Recommended)** | Both explicit `correction` and auto-diff `edit` fire FP+1. Tooltip can disambiguate later. | ✓ |
| Weighted: correction=1.0, edit=0.5 | Captures the cleanliness gap but forces decimal counters + schema complication | |
| Only explicit corrections | Cleanest math but ignores the dominant auto-diff stream (~99.9% of signal) | |

**User's choice:** Yes, both.
**Notes:** Multi-label classification standard (Synthesio, Evidently AI) treats any removal as disagreement. Signal column preserved per row for future disambiguation.

### Swap semantics

| Option | Description | Selected |
|--------|-------------|----------|
| **Two mutations: FP+1 for L, FN+1 for M (Recommended)** | Standard multi-label math; unblocks Phase 150 graph edges on both sides | ✓ |
| One mutation: FP+1 for L only | Simpler but recall for M stays flat, breaks OBS-01 | |
| Two mutations gated on "M was in top-5 suggestions" | Higher S/N but needs a new column + breaks backward compat | |

**User's choice:** Two mutations.

---

## Update timing & stratification

### FP/FN write path

| Option | Description | Selected |
|--------|-------------|----------|
| **Async event + idempotent upsert (Recommended)** | EventEmitter2 → BullMQ → upsert. Matches Phase 147's "never in transaction" rule | ✓ |
| Inline transaction bump | Stronger consistency but contention hotspot + violates Phase 147 D-01 | |
| Pure nightly batch | Violates Success Criterion #2 literal text | |

**User's choice:** Async event + idempotent upsert.

### Delayed TP credit mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| **Nightly sweeper cron (Recommended)** | New ScheduledJobType `TRIAGE_ACCURACY_SWEEP` at cron `'37 4 * * *'`, bounded 1-day slice with Redis watermark | ✓ |
| Lazy compute on profile read | Accurate but expensive per-read; only viable if admin-only | |
| Rolling sum via Deep consolidation phase | Violates 148 → 150 → 151 dependency order in roadmap | |

**User's choice:** Nightly sweeper cron.
**Notes:** arXiv:2409.10111 batch-incremental-under-delayed-labels streaming pattern cited.

### LabelAccuracyProfile key dimensions

| Option | Description | Selected |
|--------|-------------|----------|
| **(tenantId, labelId, windowKey) + triageSource rollup table (Recommended)** | 3 window rows primary + secondary breakdown table. 60 rows/tenant bounded | ✓ |
| (tenantId, labelId) single row, lifetime | Simpler but no trend, breaks "improving or degrading over time" phase goal | |
| (tenantId, labelId, day) daily buckets | Most flexible but heavier; complicates every write path | |
| (tenantId, labelId) + triageSource JSON sub-counters | Single row but Prisma JSON queries can't index per-source filters | |

**User's choice:** Two-table split with window rows + triageSource rollup.

---

## API + Frontend badge UX

### API endpoint shape

| Option | Description | Selected |
|--------|-------------|----------|
| **GET /api/ai/triage/label-accuracy (Recommended)** | Single call returns all labels × windows × optional source breakdown | ✓ |
| Per-label GET /api/labels/:id/accuracy + list endpoint | Pure REST but N+1 on settings page | |
| Fold into existing GET /api/labels | Zero extra requests but couples label query to accuracy join | |

**User's choice:** Single bulk endpoint.

### Badge visual

| Option | Description | Selected |
|--------|-------------|----------|
| **Traffic-light F1 pill + tooltip (Recommended)** | Green/Yellow/Red by F1; Wilson-CI P/R + sample size in tooltip. Matches 2026 confidence-UI convention | ✓ |
| Precision/Recall split badges | Information-dense but noisy; users without ML background confused | |
| Single % + trend arrow | Compact but requires historical-window schema we explicitly rejected | |
| Icon-only + rich tooltip | Fails scannability for worst-label detection | |

**User's choice:** Traffic-light F1 pill + Wilson-CI tooltip.
**Notes:** Agentic Design + Modexa 2026 guidance cited — badge + tooltip + source link is the trust pattern.

### Cold-start threshold

| Option | Description | Selected |
|--------|-------------|----------|
| **'Learning' state below n=20 (Recommended)** | Wilson CI half-width ≤15% at n=20, p≈0.8 — point where signal beats noise | ✓ |
| Always show, even at n=1 | Bad trust UX; violates 2026 confidence-UI principle | |
| Configurable per-tenant threshold | YAGNI; research consensus on n=10–20 is universal | |
| Hide entirely below threshold | Ambiguous — users can't tell "learning" from "not tracked" | |

**User's choice:** 'Learning' state below n=20.

---

## Prometheus + backfill + model fit

### Prometheus exposure strategy

| Option | Description | Selected |
|--------|-------------|----------|
| **Aggregated only — no per-label gauges (Recommended)** | Micro-averaged gauges + corrections counter; bounded cardinality | ✓ |
| Top-N labels + aggregated | Some on-call value but requires dynamic relabeling rules | |
| Full per-tenant, per-label gauges | Cardinality bomb; rejected by 2026 Prometheus guidance | |
| Only corrections counter, no accuracy gauges | Leaves Phase 152 auto-rollback without an alerting signal | |

**User's choice:** Aggregated only.
**Notes:** OneUptime 2026-01-30 + Last9 cardinality guidance cited. tenant_id label gated behind env flag.

### Historical backfill

| Option | Description | Selected |
|--------|-------------|----------|
| **Backfill last 30d (Recommended)** | Day-1 badges populated; bounded migration risk; expand-backfill-contract pattern | ✓ |
| Start fresh, no backfill | 30–45 days of "Learning…" on every label post-deploy | |
| Lifetime backfill | Exhaustive but marginal benefit; higher migration risk | |
| Backfill 7d only | Too little data; most labels still "Learning…" | |

**User's choice:** Last 30 days.
**Notes:** ml4devs/Acceldata 2026 backfill guidance cited. Script must be idempotent + include pre/post row-count verification.

### Phase fit (relation to Phase 152 and Phase 155)

| Option | Description | Selected |
|--------|-------------|----------|
| **Publish AccuracyDelta events for 152/155 to consume (Recommended)** | Typed EventEmitter2 topic `'triage.accuracy.changed'`; Phase 148 ships zero consumer code | ✓ |
| Phase 148 exposes read API only; 152/155 poll it | Couples rollback latency to poll frequency | |
| Tight-couple: write to Phase 152's audit table | Violates phase dependency order in roadmap | |

**User's choice:** Publish AccuracyDelta events.

---

## Claude's Discretion

- Placement of `LabelAccuracyListener` (alongside triage services vs in a sub-directory)
- Worker file layout details (reusing `base.worker.ts`)
- Window-rollover pass as second job vs second iteration
- `<LabelAccuracyBadge />` extraction vs inline in `LabelTreeItem.tsx`
- Wilson-score utility file location
- Exact import path for `weightCorrection` in the sweeper

## Deferred Ideas

- Per-day accuracy buckets (deferred to Phase 155 if dashboard needs arbitrary ranges)
- Configurable cold-start threshold env var
- Explicit vs inferred disambiguation in tooltip
- Weighted FP/FN by signal
- Per-user (not just per-tenant) accuracy scoping
- Phase 155 dashboard UI
- Per-label Prometheus gauges

---

*Discussion log generated: 2026-04-20*
