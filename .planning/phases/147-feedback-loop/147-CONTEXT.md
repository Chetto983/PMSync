# Phase 147: Close the Feedback Loop - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the existing-but-orphaned `TriageFeedbackService` and `TriageOverrideService` into the live triage pipeline so user corrections influence future classifications. Specifically: (1) capture label corrections when the user changes `aiLabels` on an email, (2) auto-promote consistent corrections into permanent `TriageOverride` rules via a debounced background job, (3) apply matching overrides during `analyzeEmailUnified()` (skipping or hinting the LLM depending on override class), and (4) inject few-shot correction examples into the LLM system prompt for matching senders/domains.

Out of scope (deferred to later v13.0 phases): per-label accuracy profiles (Phase 148), temporal exponential decay (Phase 149 — but the helper extraction in Phase 147 pre-stages it), graph-based memory (Phase 150), dreaming consolidation (Phase 151), wiring `lane_correction` / `urgency_correction` / `followup_dismiss` signal types.

</domain>

<decisions>
## Implementation Decisions

### Correction Capture (LEARN-01)
- **D-01:** **Hybrid capture with intent tagging.** Two write paths feed the same `EmailTriageFeedback` table, but rows carry a `signal` discriminator:
  - **Auto-diff path:** `EmailCrudService.updateEmail()` compares `email.aiLabels` (current) vs `data.aiLabels` (incoming PATCH). If they differ, fire `recordFeedback({ type: 'label_correction', signal: 'edit', ... })`. Classify each diff: removed-AI-suggested-label → likely correction (kept); added-new-personal-label-AI-never-suggested → likely personal organization (excluded from learning consumers); pure reorder → ignored.
  - **Explicit path:** new endpoint `POST /api/emails/:id/correct-triage` body `{ type: 'label_correction', oldValue, newValue }`. Frontend wires a "this should be X" affordance next to AI-assigned labels (NOT next to user-added labels). Fires `recordFeedback({ type: 'label_correction', signal: 'correction', ... })`.
  - Add `signal: 'edit' | 'correction'` column to `EmailTriageFeedback` schema (Prisma migration).
  - **Why:** RLUF arXiv:2505.14946 documents explicit signal as ~0.1% sparse but clean; auto-diff alone matches the documented Gmail Priority Inbox / Notion AI anti-pattern (user-added personal labels poisoning the classifier). Hybrid with intent tagging is the pattern Gmail's classifier uses.
- **D-02:** **Wire only `label_correction` this phase.** The other three FeedbackType enum values (`lane_correction`, `urgency_correction`, `followup_dismiss`) stay in the enum (forward-compatible) but no recordFeedback call sites are added for them. Lane corrections deferred until a "was AI wrong?" disambiguation affordance ships (lane moves conflate "AI wrong" with "I'm busy" per DPO robustness arXiv:2509.02709). Urgency corrections deferred until calibration guardrails exist (per-sender caps, decay) — shipping it without them collapses the priority gradient (Alibaba/Mailbird anti-pattern).

### Auto-Promotion to TriageOverride (LEARN-02)
- **D-03:** **Concentration-ratio promotion rule.** Replace the current flat `SUGGESTION_THRESHOLD = 3` in `TriageFeedbackService.getSuggestions()` with: within all `signal='correction'` rows for a given sender (or domain) in the last 30 days, **≥80% must agree on the same target** AND **≥3 absolute corrections** must exist. `signal='edit'` rows are NOT counted toward promotion (drift-detection only, used in Phase 148).
- **D-04:** **Sender + asymmetric-domain promotion with role-account exclusion.**
  - Sender promotion: ≥3 corrections, ≥80% concentration on the same target.
  - Domain promotion: ≥8 corrections AND from ≥3 distinct senders AND zero contributing senders match RFC 2142 role-account local-parts (`noreply`, `no-reply`, `notifications`, `billing`, `support`, `info`, `admin`, `mailer-daemon`, `postmaster`, `root`, `webmaster`, `hostmaster`, `news`, `marketing`, `sales`, `helpdesk`, `abuse`, `security`).
  - Runtime precedence: sender override always beats domain override (most-specific-wins, matches SpamAssassin / Cisco Talos / Gmail Filters / Outlook Rules pattern).
  - **Why:** The B2B context (boss@acme.com vs noreply@acme.com) makes naive domain promotion the SaneBox documented anti-pattern. Asymmetric thresholds + role-account exclusion is the minimum bar to avoid it.
- **D-05a:** **Label corrections feed few-shot only — NOT auto-promoted to TriageOverride.** The existing `TriageOverride.action` enum is lane-shaped (`always-important`, `always-review-later`, etc.); label corrections target labels. No schema extension this phase. LEARN-02 success criterion is satisfied via the few-shot path (D-09): consistent label corrections steer the next LLM call. When `lane_correction` wires later, lane-correction concentration WILL auto-promote to `TriageOverride` (the existing enum shape fits). This keeps Phase 147 schema migration scope minimal (only adds `signal` column, `triageSource` enum, no enum-value additions).
- **D-06:** **Debounced event + daily safety-net cron for promotion.** Three trigger paths, all idempotent:
  1. **Debounced (primary):** every `recordFeedback()` enqueues `'promote-overrides'` to a new BullMQ queue with `delay: 5 * 60 * 1000` and BullMQ `deduplication.id = 'promote:' + tenantId, ttl: 5 * 60 * 1000`. A burst of 20 corrections collapses to one promotion run 5min after the last correction.
  2. **Safety-net cron:** add `TRIAGE_PROMOTION_SAFETY_NET` to `ScheduledJobType` in `scheduled-jobs.queue.ts` at cron `'17 4 * * *'` (deliberately off-cluster — existing crons cluster on `0 3 * * *` which is a documented thundering-herd risk, do NOT add to that cluster). Handler: `SELECT DISTINCT tenant_id FROM email_triage_feedback WHERE created_at > now() - interval '24 hours'`, fan out one `'promote-overrides'` job per tenant with `Math.random() * 60_000` ms jitter.
  3. **Admin force:** `POST /api/admin/ai/triage/promote-suggestions` (TenantGuard + SuperAdminGuard). Useful for support and Phase 156 E2E benchmarks.
  - Idempotency: handler stores `lastPromotedAt` per tenant (Redis key `triage:last-promoted:{tenantId}` with 1h TTL); skip run if last < 5min ago.

### Override Application Timing (overrides influence next triage)
- **D-07:** **Hybrid A+B override application, routed by override class.**
  - **Muting overrides** (`always-system-alert`, `never-follow-up`): pre-LLM short-circuit. `EmailTriageService.triageEmail()` calls `TriageOverrideService.applyOverrides()` BEFORE `analyzeEmailUnified()`. If matched, write `{ aiLane: 'system-alerts', aiLabels: [], summary: null, smartReplies: null, isAutoTriaged: true, autoTriagedAt: now, triageSource: 'rule' }` directly and skip the LLM call. `never-follow-up` separately suppresses the post-triage hook.
  - **Visible overrides** (`always-important`, `always-review-later`, `always-customer-vip`): pre-LLM hint + post-LLM enforcement. Inject `<USER_OVERRIDE>From {pattern}: user has marked as {action} — honor this</USER_OVERRIDE>` into the system prompt as the LAST instruction line (RoPE recency bias amplifies). Run LLM normally to populate `summary`, `urgency`, `sentiment`, `smartReplies`, `keyTopics`. After parse, forcibly set `aiLane = ACTION_TO_LANE[override.action]` regardless of LLM output. Set `triageSource: 'llm+rule'`.
  - Pure-LLM path (no override matched): unchanged. Set `triageSource: 'llm'`.
- **D-08:** **Add `triageSource` enum to EmailAnalysis schema.** Values: `'llm' | 'rule' | 'llm+rule'`. Persisted on `EmailAnalysis` table for UI provenance chip ("Routed by your rule: acme.com → Important") and for Phase 148 eval-pipeline stratification (separate accuracy metrics for rule-bypassed vs LLM-classified emails). Frontend renders the chip when `triageSource !== 'llm'`. Prisma migration adds the column.

### Few-Shot Correction Injection into LLM Prompt
- **D-09a:** **Selection scope: sender first, fall back to domain.** Pull `signal='correction'` rows for the email's sender address. If <2 sender corrections exist, top up from corrections at the parent domain (deduped by target label). Symmetric with D-04 promotion granularity.
- **D-09b:** **Ranking: `frequency × recency_decay` per (scope, target-label) pair.** Rank by `count × Math.exp(-age_days / 14)`, descending. The 14-day half-life intentionally pre-stages Phase 149 (Temporal Decay) — Phase 149 swaps this constant into a config-driven helper without touching call sites. NOT pure recency (PromptHub: pure recency causes flip-flop oscillation when user corrects A→B→A).
- **D-09c:** **Hard cap: max 3 examples, each truncated to 80 chars** (post `sanitizeForLLM`). Few-shot collapse documented above 3 examples on small models (arXiv:2509.13196: Gemma 7B 77.9% → 39.9% accuracy when over-prompted).
- **D-09d:** **Placement: LAST in system prompt** (after LABEL_RULES, after triage_context, after the override hint from D-07). RoPE recency bias amplifies the rightmost slice — this is intentional, the corrections are the freshest user-specific signal.
- **D-10:** **Prompt budget rebalance.** Update `EmailAnalysisService.buildAnalyzeSystemPrompt()`:
  - LABEL_RULES: 60% → **55%** (~2530 chars) — stays largest, this is user's explicit teaching surface.
  - triage_context: 40% → **25%** (~1150 chars) — static rules are documented as lowest-leverage slice (Anthropic context-engineering guidance).
  - **CORRECTIONS: new 20%** (~920 chars) — dynamic per-sender signal.
  - **Keep** `MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600`. Do NOT grow the cap (latency + prefix-cache invalidation).
  - Update `triage-prompt-budget.test.ts` assertions accordingly.
- **D-11:** **Few-shot example format.** One line per example, `<CORRECTIONS>` block:
  ```
  <CORRECTIONS>
  - From {sender_or_domain}: AI suggested "{old}" → user corrected to "{new}" (×{count})
  </CORRECTIONS>
  ```
  Copy `buildTaggedPromptSection` helper pattern from existing `buildLabelPromptBlock`.

### Phase 149 Pre-staging
- **D-12:** **Extract `weightCorrection(ageDays: number): number` helper now.** Phase 147 implementation: `return ageDays <= 30 ? 1 : 0` (matches today's flat 30-day TTL semantics for promotion). The few-shot ranking in D-09b uses `Math.exp(-ageDays / 14)` directly — note this divergence is intentional: Phase 149 unifies both behind the helper. Place the helper in `backend/src/modules/ai/utils/triage-correction-weight.ts` (new file). Both call sites in this phase import from it; Phase 149 swaps the implementation.

### Claude's Discretion
- Exact Prisma migration SQL (use `npx prisma migrate dev --name 147_feedback_loop_signal_and_triagesource` per CLAUDE.md MANDATORY workflow — NEVER `prisma db push` against production per memory `feedback_never_db_push_production`).
- Whether to put the auto-diff classification logic (`removed_ai_label` vs `added_new_label` vs `pure_reorder`) inline in `EmailCrudService.updateEmail()` or extract a `triage-correction-classifier.ts` helper. Either is acceptable as long as the classification result is the value of the `signal` column written to `EmailTriageFeedback`.
- Exact BullMQ queue name and Worker file naming for the new `'promote-overrides'` queue — follow patterns in existing `backend/src/common/services/scheduled-jobs.queue.ts` and existing `backend/src/common/workers/base.worker.ts`.
- Frontend "this should be X" affordance UX: dropdown, modal, inline edit — follow existing label-edit patterns in `frontend/src/components` (whichever is closest to existing AI-result UX).
- Whether the override hint (D-07 visible-override path) goes immediately before LABEL_RULES or after triage_context. Either works — researcher/planner picks based on coherence with the existing prompt-skeleton structure in `t.insights.analyzeUnified.systemPrompt`.

### Folded Todos
None — this discussion did not surface backlog items to fold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 147 — Existing Triage Services (must read)
- `backend/src/modules/ai/services/triage-feedback.service.ts` — `recordFeedback`, `getSuggestions`. Currently orphaned, MUST stay backward-compatible (existing callers: zero, but the public shape may be re-used by Phase 148).
- `backend/src/modules/ai/services/triage-override.service.ts` — `applyOverrides`, `addOverride`, `removeOverride`. Currently orphaned in the triage path; this phase wires `applyOverrides` into `EmailTriageService`.
- `backend/src/modules/ai/services/triage-learning.service.ts` — implicit signal pipeline (Redis-buffered reply/archive/flag). NOT touched by Phase 147 but useful context for what "feedback" already exists in another channel.
- `backend/src/modules/ai/controllers/triage-overrides.controller.ts` — existing CRUD surface for manual overrides. Phase 147 adds POST /promote-suggestions admin endpoint here OR in a new admin controller (Claude's discretion).

### Phase 147 — LLM Triage Pipeline (must read)
- `backend/src/modules/ai/services/email-triage.service.ts` — `triageEmail()` is where pre-LLM short-circuit (D-07 muting overrides) lives. Currently lines ~263–344.
- `backend/src/modules/ai/services/email-analysis.service.ts` — `analyzeEmailUnified()` (~lines 56–233), `buildAnalyzeSystemPrompt()` (~lines 274–314), `buildLabelPromptBlock()` (~lines 316–358). The hint injection (D-07 visible overrides) goes into `buildAnalyzeSystemPrompt`. The CORRECTIONS slice (D-09 to D-11) is added here.
- `backend/src/modules/ai/services/triage-rule.service.ts` — `buildTriageContext()` is where the 25% slice budget gets enforced.
- `backend/src/modules/ai/services/email-insights.service.ts` — thin wrapper around `analyzeEmailUnified` (no changes expected, listed for completeness).
- `backend/src/modules/ai/utils/prompt-sanitizer.ts` — `sanitizeForLLM`, `wrapUserContent`, `truncatePromptLine`, `buildTaggedPromptSection`. CORRECTIONS block uses `buildTaggedPromptSection`.
- `backend/src/modules/ai/locales/en.ts`, `it.ts` — `t.insights.analyzeUnified.systemPrompt(allowedLabelsText, labelPromptBlock, triageContext)` template signature must extend to `(allowedLabelsText, labelPromptBlock, triageContext, correctionsBlock, overrideHint)`. Translations in BOTH locales.

### Phase 147 — Capture Wiring (must read)
- `backend/src/modules/email/services/email-crud.service.ts` lines 200–280 — `updateEmail()` is where the auto-diff (D-01 auto path) lives.
- `backend/src/modules/email/controllers/email-actions.controller.ts` lines ~230–250 — PATCH route signature for the auto-diff trigger.

### Phase 147 — Background Jobs (must read)
- `backend/src/common/services/scheduled-jobs.queue.ts` — add `TRIAGE_PROMOTION_SAFETY_NET` enum value + cron entry. Existing crons cluster on `0 3 * * *` — DO NOT add to that minute (D-06 uses `'17 4 * * *'`).
- `backend/src/common/workers/base.worker.ts` — pattern for the new `'promote-overrides'` queue worker.
- `backend/src/common/config/queue.config.ts` — shared connection singletons + QUEUE_NAMES registry. New queue name must be registered.

### Phase 147 — Prisma Schema (must read)
- `backend/prisma/schema.prisma` lines 2542–2571 — `TriageOverride` and `EmailTriageFeedback` models. Phase 147 migration adds:
  - `EmailTriageFeedback.signal` String column (default `'edit'`).
  - `EmailAnalysis.triageSource` String column (nullable initially, then default `'llm'` after backfill).
- `backend/prisma/migrations/` — every schema change is a migration per CLAUDE.md "Prisma schema changes (MANDATORY migration workflow)".

### Phase 147 — Tests (must read)
- `backend/src/modules/ai/services/__tests__/triage-prompt-budget.test.ts` — assertions need updating for the 55/25/20 split.
- `backend/src/modules/ai/services/__tests__/triage-rule.service.spec.ts` — context-budget computation tests.

### Roadmap & Milestone
- `.planning/milestones/v13.0-ROADMAP.md` §"Phase 147" — success criteria source of truth (LEARN-01, LEARN-02).
- `.planning/milestones/v13.0-ROADMAP.md` §"Design Decisions" — "BullMQ crons for dreaming phases" decision (D-06 honors this).

### Project Constraints (must read)
- `CLAUDE.md` §"NEVER RUN `prisma db push` OR ANY DESTRUCTIVE DB COMMAND" — schema changes use `npx prisma migrate dev`, period.
- `CLAUDE.md` §"Multi-tenant rule" — every new query MUST filter by `tenantId`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TriageFeedbackService.recordFeedback()` and `getSuggestions()` — already implemented, just orphaned. Phase 147 wires consumers around them; only the promotion-rule body of `getSuggestions` changes (D-03/D-04 concentration math).
- `TriageOverrideService.applyOverrides()` — already returns the right `OverrideResult` shape with `lane`, `suppressFollowUp`, matched `override`. Phase 147 just calls it from `EmailTriageService.triageEmail()`.
- `buildTaggedPromptSection` helper — used for `<LABEL_RULES>`. Reuse for `<CORRECTIONS>` and `<USER_OVERRIDE>` blocks.
- `ScheduledJobType` enum + `SCHEDULED_JOB_PATTERNS` cron registry — established pattern for global daily jobs with tenant fan-out. Add `TRIAGE_PROMOTION_SAFETY_NET` to both.
- `BaseWorker` pattern (post-Phase 146 RAM-harden) — uses shared worker connection, must be honored by the new `'promote-overrides'` worker.
- `extractDomain()` helper in `triage-feedback.service.ts:128` — reuse for domain extraction; consider promoting to `backend/src/modules/ai/utils/email-address.ts` if Phase 147 adds more sender/domain logic (Claude's discretion).
- Existing `ACTION_TO_LANE` map in `triage-override.service.ts:37` — reuse in D-07 visible-override post-LLM enforcement to translate `override.action` to lane.

### Established Patterns
- **Translations:** AI prompts live in `backend/src/modules/ai/locales/{en,it}.ts` under `insights.analyzeUnified.systemPrompt`. New CORRECTIONS block label and override-hint label both need en + it translations.
- **Cache invalidation:** `EmailAnalysisService.invalidateCache(tenantId, emailIds)` already exists. After auto-promotion creates a new override, invalidate cached analyses for emails matching the override's pattern so the next triage runs with the new override applied (call site: end of promotion handler).
- **Multi-tenant queries:** every new query in this phase MUST include `tenantId` (CLAUDE.md hard rule).
- **Prisma retry (P2002, P2034):** `addOverride()` already uses `upsert` for safe concurrent writes — promotion job MUST use the same upsert path, never raw insert.
- **Sanitizer pipeline:** all user-provided content (sender addresses, label names) feeding the LLM prompt MUST go through `sanitizeForLLM`. CORRECTIONS examples include sender addresses → sanitize per-line.
- **PII redaction:** `EmailAnalysisService.redactPii()` runs on email content before LLM. CORRECTIONS examples include sender addresses (PII) — redact OR truncate-domain to avoid leaking emails to the LLM. Decision: redact via existing `piiDetection.detect` for the `From` field in the example string.

### Integration Points
- `EmailCrudService.updateEmail()` ↔ `TriageFeedbackService.recordFeedback()` — new fire-and-forget call after the transaction commits, NEVER inside the transaction (don't couple feedback persistence to the email update).
- `EmailTriageService.triageEmail()` ↔ `TriageOverrideService.applyOverrides()` — new pre-LLM call.
- `EmailAnalysisService.buildAnalyzeSystemPrompt()` ↔ new `TriageCorrectionService.getFewShotExamples(tenantId, sender)` — new service or method extracts sender/domain corrections, ranks per D-09, formats per D-11.
- `scheduled-jobs.queue.ts` ↔ new `'promote-overrides'` BullMQ queue — both safety-net cron and inline debounce enqueue to the same queue/worker.
- `EmailAnalysisService.invalidateCache()` ↔ promotion handler — invalidate after promote so subsequent triages pick up the new override.

</code_context>

<specifics>
## Specific Ideas

- The "deep search 2026 best practice" probes during discussion produced four research reports cited inline above. Sources include: Aberdeen et al. Gmail Priority Inbox paper, Notion AI / Braintrust eval case study, RLUF arXiv:2505.14946, DPO-PRO arXiv:2509.02709, OpenClaw-RL arXiv:2603.10165, Mem0 arXiv:2504.19413, Mem0g graph-memory blog, Anthropic context-engineering guide, "Lost in the Middle" (Liu et al. TACL 2024), "The Few-shot Dilemma" arXiv:2509.13196, BullMQ Job Schedulers docs, Microsoft Background Jobs guidance, RFC 2142 role-account list. Planner can re-fetch any of these via WebSearch if deeper detail is needed but the decisions above are final.
- Sender-beats-domain runtime precedence is already enforceable inside `applyOverrides` by ordering: query sender-type rows first, return on match, then domain-type. No additional code needed for precedence.
- "Auto-diff classification" (D-01) is intentionally simple — no ML, just three rules:
  - if old set contains label X and new set does not → `removed_ai_label`
  - if new set contains label X and old set does not → `added_new_label` (further classified: was X ever in any AI suggestion for this user? if yes → `added_back_correction`, if no → `added_personal_label`)
  - if same set, different order → `pure_reorder` (don't fire `recordFeedback`)
  Only `removed_ai_label` and `added_back_correction` write to `EmailTriageFeedback` with `signal='edit'`.

</specifics>

<deferred>
## Deferred Ideas

- **`lane_correction`, `urgency_correction`, `followup_dismiss` wiring** — schema enum already supports them; adding callers belongs in a future phase that ships the disambiguation/calibration UI (mentioned in D-02 rationale).
- **Schema extension for label-only TriageOverride action** (`always-label:<name>`) — not needed since label corrections feed few-shot only (D-05a). Revisit if Phase 148+ accuracy data shows label-only overrides would beat the few-shot path.
- **Per-tenant cron scheduling in tenant-local time** — Option researched and rejected (per-tenant scheduler explosion at 10K+ tenants per BullMQ Neurobyte writeup). Stays as a global cron with fan-out.
- **Tenant settings toggle to opt out of domain auto-promotion** — flagged as a B2B-conservative option during D-04 discussion but rejected this phase. Sender-first + role-account exclusion + ≥3-distinct-senders is the safety net. Add the opt-out only if Phase 156 E2E benchmarks show domain promotion misfires.
- **Spike/sketch artifacts** — no spikes or sketches exist for this phase, none needed.

</deferred>

---

*Phase: 147-feedback-loop*
*Context gathered: 2026-04-19*
