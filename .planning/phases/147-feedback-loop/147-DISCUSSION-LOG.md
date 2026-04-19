# Phase 147: Close the Feedback Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered and the research that backed each lock.

**Date:** 2026-04-19
**Phase:** 147-feedback-loop
**Areas discussed:** Correction capture point, "Confidence > 80%" interpretation, Override application timing, Few-shot example selection strategy, Auto-promotion trigger, Label→override mapping, Phase 149 pre-staging
**Mode:** interactive (no flags)
**Research probes:** 4 deep web-research agents spawned during discussion (user requested "deep search 2026 best practice" on most decisions)

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Correction capture point | Where does recordFeedback() get called? | ✓ |
| "Confidence > 80%" meaning | Concrete promotion rule | ✓ |
| Override application timing | Pre-LLM short-circuit vs hint vs post-hoc | ✓ |
| Few-shot selection strategy | Which corrections injected into LLM prompt | ✓ |

**User's choice:** All four areas selected (multiselect).

---

## Area 1: Correction Capture Point

### Question 1a: Where should correction capture happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-diff in updateEmail | Single chokepoint compares old vs new aiLabels | |
| Explicit endpoint only | POST /correct-triage with explicit intent | |
| Both: diff + explicit | Hybrid | |
| Hybrid + intent tagging (post-research, recommended) | Auto-diff + explicit, signal column distinguishes | ✓ |

**User's first reply:** "deep search online best 2026 pratice" — triggered research probe.

**Research findings (cited inline in CONTEXT.md):** Hybrid (C) but with intent tagging is the only design that survives the documented Gmail Priority Inbox / Notion AI / SaneBox anti-patterns. Auto-diff alone is the documented poisoning failure mode (user adding personal label → "AI was wrong").

Sources: Aberdeen et al. Gmail Priority Inbox paper, Notion AI feedback design (eesel/Braintrust), RLUF arXiv:2505.14946, DPO-PRO arXiv:2509.02709.

**Final user pick (post-research):** Hybrid + intent tagging.

### Question 1b: Which correction types fire recordFeedback this phase? (multiselect)

| Option | Description | Selected |
|--------|-------------|----------|
| label_correction | aiLabels diff | ✓ |
| followup_dismiss | User dismisses follow-up | (research recommended; user did not pick) |
| urgency_correction | aiUrgency diff | |
| lane_correction | aiLane diff | |

**User's first reply:** "deep search online 2026 pratice" — triggered research probe.

**Research recommendation:** Wire `label_correction` (weight 1.0) + `followup_dismiss` (weight 1.0, scoped to follow-up head only). Defer `lane_correction` (noisy: AI-wrong vs I'm-busy conflation) and `urgency_correction` (no UI + boy-who-cried-wolf calibration risk).

Sources: Gmail Priority Inbox, Superhuman Auto Labels 2025, OpenClaw-RL arXiv:2603.10165, Mem0 ECAI 2025 arXiv:2504.19413, DPO performance-gap arXiv:2505.19770, Alibaba product-insights urgency anti-pattern.

**Final user pick (post-research):** `label_correction` only. (User chose tighter scope than research recommendation; noted in CONTEXT D-02. Other enum values stay for future phases.)

---

## Area 2: "Confidence > 80%" Interpretation

### Question 2a: How should "confidence > 80%" translate into a concrete rule?

| Option | Description | Selected |
|--------|-------------|----------|
| Concentration ratio | ≥80% of corrections agree on same target, ≥3 absolute | ✓ |
| Acceptance ratio | Of all triages, ≥80% corrected | |
| Absolute count, drop 80% framing | Keep flat count | |
| Concentration AND minimum support | Stricter: ≥5 + 2 distinct days | |

**User's pick:** Concentration ratio.

### Question 2b: Granularity (sender vs domain)?

| Option | Description | Selected |
|--------|-------------|----------|
| Sender first, fall back to domain | Hierarchical | (research-refined version selected below) |
| Sender only | Cleanest | |
| Domain only (current) | | |
| Both, independent | Conflict-prone | |

**User's first reply:** "deep search online best 2026 pratice" — triggered research probe.

**Research findings:** Option A (sender-first + domain-fallback) is the only design that survives the B2B `boss@acme.com` vs `noreply@acme.com` problem documented as the SaneBox failure mode. Refinements: asymmetric thresholds (sender ≥3, domain ≥8 + ≥3 distinct senders), RFC 2142 role-account exclusion (noreply, no-reply, notifications, billing, support, info, admin, etc.), runtime sender-beats-domain precedence (Gmail / Outlook / Spamhaus pattern).

Sources: Aberdeen et al. Gmail Priority Inbox, Microsoft Outlook Rules docs, Hey Screener docs, SaneBox training docs (anti-pattern), Superhuman Auto Labels 2025, Spamhaus DBL FAQ, RFC 2142.

**Final user pick:** Sender + asymmetric domain (research-refined). Domain auto-promotion is NOT gated by tenant opt-in this phase — sender-first + role-exclusion + ≥3-distinct-senders considered sufficient safety.

---

## Area 3: Override Application Timing

### Question 3: Where in the pipeline does applyOverrides() run?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-LLM hint + post-LLM enforcement | Hint, then forcibly enforce | (subset selected via routing) |
| Pre-LLM short-circuit | Skip LLM entirely | (subset selected via routing) |
| Post-LLM enforcement only | LLM blind, overwrite after | |
| Hybrid A+B routed by override class (post-research) | Mute → short-circuit, visible → hint+enforce | ✓ |

**User's first reply:** "deep search online best 2026 ratice" — triggered research probe.

**Research findings:** Pure C (post-hoc only) is "the worst of all worlds" — wastes LLM cycles AND breaks reasoning-field coherence (LLM writes "critical urgency" while we forcibly override to "system-alerts" — looks broken). The right answer is route by override destructiveness:
- Muting overrides (`always-system-alert`, `never-follow-up`) → short-circuit (B)
- Visible overrides (`always-important`, `always-customer-vip`, `always-review-later`) → pre-LLM hint + post-LLM enforce (A)

Plus: persist a `triageSource: 'rule' | 'llm' | 'llm+rule'` enum on EmailAnalysis for UI provenance chip and Phase 148 eval stratification.

Sources: Anthropic "Building effective agents" (Dec 2024), LangGraph conditional edges docs, Pydantic AI validators, Mistral function-calling guide, Berkeley Function-Calling Leaderboard, Microsoft Responsible AI guidance, NIST AI RMF Playbook, SaneBox docs, Superhuman help docs, Microsoft Outlook Focused Inbox docs.

**Final user pick (post-research):** Hybrid A+B routed by override class.

---

## Area 4: Few-Shot Selection Strategy

### Question 4a: Which corrections get selected for few-shot injection?

| Option | Description | Selected |
|--------|-------------|----------|
| Sender first, fall back to domain, recency-weighted | | ✓ |
| Most frequent target for domain | | |
| Hybrid: sender-recent + domain-frequent | | |

**User's pick:** Sender first, fall back to domain, recency-weighted. (Ranking refinement made in 4b after research.)

### Question 4b: Prompt budget?

| Option | Description | Selected |
|--------|-------------|----------|
| Carve from triage_context | LABEL_RULES 60%, triage_context 20%, CORRECTIONS 20% | |
| Carve from LABEL_RULES | LABEL_RULES 50%, triage_context 40%, CORRECTIONS 10% | |
| Add fourth slice and grow cap | 4600 → 5200 | |
| 55/25/20 split + hard cap 3 examples (post-research) | LABEL_RULES 55%, triage_context 25%, CORRECTIONS 20% | ✓ |

**User's first reply:** "deep search online best 2026 ptatice" — triggered research probe.

**Research findings:** Variant of A — demote triage_context to 25% (not 20%), keep LABEL_RULES at 55%, give CORRECTIONS 20% (~920 chars). Don't grow the 4600 cap (latency + prefix-cache invalidation). Hard cap 3 examples (Few-shot Dilemma arXiv:2509.13196: small models collapse above ~3 examples). Place CORRECTIONS LAST in prompt (RoPE recency bias amplifies — "Lost in the Middle" Liu et al. TACL 2024).

Ranking refinement: pure recency causes flip-flop oscillation when user corrects A→B→A. Use `frequency × recency_decay` (14-day half-life) instead. The 14-day constant intentionally pre-stages Phase 149 (Temporal Decay) — Phase 149 swaps the constant into a configurable helper without touching call sites.

Sources: arXiv:2509.13196 (Few-shot Dilemma), Shuntaro Okuma 2026 (Few-Shot Collapse), Liu et al. TACL 2024 (Lost in the Middle), arXiv:2307.03172, Anthropic Effective Context Engineering, Mistral cookbook, Mem0 arXiv:2504.19413, PromptHub Few-Shot Prompting Guide, arXiv:2501.10868 (Structured Outputs Benchmark), arXiv:2504.02052 (Real-world LLMapps).

**Final user pick:** 55/25/20 split + hard cap 3 examples + frequency × recency_decay ranking.

---

## Area 5: Secondary Defaults Batch

### Question 5a: Auto-promotion trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Daily BullMQ cron | One global cron, fan out to tenants | |
| Inline after every recordFeedback() | Synchronous | |
| Admin-triggered only | Manual | |
| Debounced event + daily safety-net cron (post-research) | 5min debounce + 4:17am safety net + admin force | ✓ |

**User's first reply:** "deep search online best SaaS scalibility 2026 pratice" — triggered research probe.

**Research findings:** Hybrid pattern is industry standard. Inline = promotion thrash + ~3000 unnecessary DB queries/day at 1000 users (Microsoft Background Jobs anti-pattern). Pure daily cron = up to 18h delay between user correcting and override taking effect. Per-tenant repeatable BullMQ schedulers explode at 10K+ tenants (Neurobyte/BullMQ docs).

Right answer: debounced primary (5-min delay + dedup window via BullMQ `deduplication.ttl`) + safety-net global cron at `'17 4 * * *'` (deliberately off-cluster — existing PMSync crons cluster on `0 3 * * *` which IS the documented thundering-herd risk per Aonnis). Idempotency guard skips if last promoted < 5min ago. Admin force endpoint kept for support.

Codebase-specific finding from research: existing `scheduled-jobs.queue.ts` already uses global-with-tenant-fan-out pattern (DATA_CLEANUP, EMAIL_RETENTION, LEAD_FEATURE_COMPUTE, CONTACT_PURGE) — Phase 147 follows this precedent.

Sources: BullMQ Job Schedulers docs, BullMQ Repeat Strategies / Repeat options docs, Better Stack BullMQ scaling guide, Neurobyte "BullMQ at Scale", Microsoft Well-Architected Background Jobs, Aonnis Thundering Herds, DEV Jitter Backoff, Hasura Scheduled Triggers, Verraes Passage of Time Event, Acorel Composite Cron Jobs.

**Final user pick:** Debounced event + daily safety-net cron.

### Question 5b: Label-correction → TriageOverride mapping?

| Option | Description | Selected |
|--------|-------------|----------|
| Label corrections feed few-shot only, NOT auto-promoted | No schema change | ✓ |
| Extend TriageOverride schema with always-label:<name> | Schema migration | |
| Map label → nearest lane via heuristic | Lossy | |

**User's pick:** Few-shot only, no schema change. Cleanest separation; defers schema question to a later phase when `lane_correction` also wires.

### Question 5c: Phase 149 pre-staging?

| Option | Description | Selected |
|--------|-------------|----------|
| Extract weightCorrection(age) helper now | Cheap insurance | ✓ |
| Hard-code 30-day cutoff, refactor in P149 | More churn later | |

**User's pick:** Extract helper now in `backend/src/modules/ai/utils/triage-correction-weight.ts`.

---

## Claude's Discretion (per CONTEXT.md)

- Exact Prisma migration SQL (use `npx prisma migrate dev` per CLAUDE.md MANDATORY workflow).
- Whether auto-diff classification logic lives inline in `EmailCrudService.updateEmail()` or in a new `triage-correction-classifier.ts` helper.
- Exact BullMQ queue name and Worker file naming for the new `'promote-overrides'` queue.
- Frontend "this should be X" affordance UX (dropdown vs modal vs inline).
- Whether the override hint goes immediately before LABEL_RULES or after triage_context in the system prompt.

## Deferred Ideas (per CONTEXT.md)

- `lane_correction`, `urgency_correction`, `followup_dismiss` wiring (schema-ready, no callers this phase).
- `always-label:<name>` TriageOverride schema extension (deferred until accuracy data justifies it).
- Per-tenant cron scheduling in tenant-local time (rejected per research — scheduler explosion at scale).
- Tenant settings toggle to opt out of domain auto-promotion (rejected — sender-first + role-exclusion considered sufficient).
- No spikes/sketches exist for this phase.

---

*Generated 2026-04-19 from interactive discussion + 4 research probes.*
