---
status: partial
phase: 150-graph-triage-memory
source: [150-VERIFICATION.md]
started: 2026-04-24T11:15:00.000Z
updated: 2026-04-24T11:15:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. ROADMAP SC-4 — LLM call reduction ≥20% on repeat senders after 30-day warmup
expected: After the kill switch is flipped (`TRIAGE_GRAPH_CONFIDENCE_CUTOFF` dropped below 9999), at least 20% of repeat-sender emails are triaged via graph short-circuit without an LLM call. Measured via Prometheus counter diffs over a 30-day window.
result: [pending — explicitly deferred to Phase 156 observability/E2E validation]

### 2. Kill-switch flip behavior — WR-01 and WR-02 latent divergences
expected: When `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` drops below 9999 and graph-short-circuit fires, the EmailLabel junction table updates correctly (`linkEmailToUserLabels` invoked) and `aiPriority`/`aiLane`/`aiPriorityReason` are set to consistent values (not stale nulls). Operator validates via a single test email before ramping the cutoff.
result: [pending — requires operator to flip the cutoff in a controlled environment. REVIEW findings WR-01 + WR-02 are fix-or-verify items. Recommended: fix WR-01 (link call) + WR-02 (lane/priority policy) in a 150.1 gap-closure phase BEFORE any production cutoff flip.]

### 3. D-04 mirror sync + Landmine §2 cascade end-to-end
expected: Creating a UserLabel creates a mirror GraphNode (`nodeType='label'`). Renaming the label updates the mirror. Deleting/archiving the label hard-deletes the mirror GraphNode AND cascades to any affinity edges targeting it (via `onDelete: Cascade` on GraphEdge.targetId). Confirmed via real-Postgres integration spec OR manual DB inspection.
result: [pending — real-Postgres integration spec deferred to Phase 156 E2E. Static analysis (9 `graphNode.*` calls in labels.service.ts) + WR-03 transaction-boundary orphan risk noted in REVIEW.]

### 4. BullMQ 3AM nightly dispatch ordering
expected: The nightly-affinity-promotion job at cron `0 3 * * *` runs BEFORE nightly-decay-gc (Landmine §5 ordering). Confirmed via BullMQ logs OR the next production 3AM cycle.
result: [pending — static line-number check passes (queue.add line 226 < 240). Runtime order needs one production night to confirm.]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
