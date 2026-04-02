# Sprint 15 — Label-First Resolution Engine & Lane Assignment

| Campo | Valore |
|-------|--------|
| **Phase** | 10 — Label-First Triage |
| **Sprint** | 15 |
| **SP** | 14 |
| **Objective** | Refactor the triage pipeline to enforce label-first ordering: summary → intent → labels (with precedence + contradiction handling) → score (subordinate to labels) → lane assignment |
| **Addresses** | LFT-B1, LFT-B2, LFT-C1 |

---

## Sprint Backlog

### T-1501: Extract label resolution into dedicated service [3 SP] ✅ DONE
- [x] Create `backend/src/modules/ai/services/label-resolution.service.ts` (max 300 lines)
- [ ] Move `resolveLabels()`, `inferLabels()`, `normaliseLabel()` from `email-analysis.service.ts`
- [ ] Add label precedence resolution in this order:
  1. Triage rules match (domain/sender/keyword from T-1404)
  2. User labels with `aiPrompt` (LLM-assigned)
  3. Heuristic inference from email content (keyword matching against user label names)
  4. If zero labels exist for tenant → return empty array (no fallback defaults)
- [ ] Add contradiction resolver:
  - Check `mutuallyExclusiveWith` from label metadata (generic, not hardcoded label names)
  - When two mutually exclusive labels found, keep the one listed first in precedence order
  - Max 3 labels after resolution
- [ ] Add `suppressUrgency` flag propagation: if any selected label has `suppressUrgency: true`, set a flag on the result
- [ ] Handle zero-labels case: if tenant has no labels, skip resolution entirely and return `{ labels: [], suppressUrgency: false }`
- [ ] Register service in AI module, inject into `EmailAnalysisService`
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1502: Refactor normalizeTriageSignals into score-after-labels engine [3 SP] ✅ DONE
- [x] Create `backend/src/modules/ai/services/triage-score.service.ts` (max 250 lines)
- [ ] Move `normalizeTriageSignals()` logic from `email-analysis.service.ts`
- [ ] Rewrite scoring to be label-subordinate (use label metadata, not hardcoded label names):
  - If `suppressUrgency` flag is set → cap urgency to `low`, priority to 4-5
  - If any label has `category: 'workflow'` and `defaultLane: 'action-now'` → floor priority to 1-2
  - If `actionability === 'none'` and no deadline → cap urgency to `medium`
  - If `actionability === 'waiting'` → set urgency to `medium` unless deadline is close
  - If zero labels → use raw LLM signals without label-based adjustments
- [ ] Add explicit `priorityReason` builder:
  - Must reference the strongest signal: label, deadline, sender, escalation
  - Format: `"[Signal]: [reason]"` e.g. `"Customer email: billing inquiry from acme.com"`
  - Max 120 chars
- [ ] Register service in AI module
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1503: Create lane assignment service [2 SP] ✅ DONE
- [x] Create `backend/src/modules/ai/services/lane-assignment.service.ts` (max 150 lines)
- [ ] Implement `assignLane()`:
  - Check primary label's `defaultLane` first
  - If no label default: map from intent + actionability:
    - `actionability=todo` + `urgency>=high` → `action-now`
    - `actionability=waiting` → `waiting-on-reply`
    - Any label with `defaultLane=customer-vip` → `customer-vip`
    - `suppressUrgency=true` + `category=suppression` → `system-alerts` or `review-later`
    - Everything else → `review-later`
  - Override: if `escalationRisk=true` → `action-now` regardless
  - Override: if `hasDeadline=true` and deadline within 48h → `action-now`
- [ ] Return `{ lane, laneReason }` tuple
- [ ] Register service in AI module
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1504: Rewire EmailAnalysisService to use new pipeline [3 SP] ✅ DONE
- [x] Edit `backend/src/modules/ai/services/email-analysis.service.ts`
- [ ] Inject `LabelResolutionService`, `TriageScoreService`, `LaneAssignmentService`
- [ ] Replace inline label/score logic in `analyzeEmailUnified()` with service calls:
  ```
  // 1. LLM call (already exists)
  // 2. Label resolution (new)
  const labelResult = labelResolution.resolve(rawLabels, tenantLabels, triageRules, signals);
  // 3. Score computation (new)
  const scoreResult = triageScore.compute(labelResult, signals, email);
  // 4. Lane assignment (new)
  const laneResult = laneAssignment.assignLane(labelResult, scoreResult, signals);
  ```
- [ ] Update `UnifiedEmailAnalysis` type to include `lane`, `laneReason`, `actionability`
- [ ] Persist `lane`, `intent`, `actionability` to both `Email` and `EmailAnalysis` tables
- [ ] Remove old `normalizeTriageSignals()`, `resolveLabels()`, `inferLabels()` methods
- [ ] Verify with `cd backend && npx tsc --noEmit`
- [ ] Verify file stays under 500 lines after extraction

### T-1505: Update follow-up precision in TriageActionService [2 SP] ✅ DONE
- [x] Edit `backend/src/modules/ai/services/triage-action.service.ts`
- [ ] Use new `actionability` field from analysis:
  - `actionability === 'todo'` → create TODO follow-up
  - `actionability === 'waiting'` → create WAITING_FOR follow-up
  - `actionability === 'none'` → skip follow-up creation entirely
- [ ] Remove the heuristic `shouldCreateFollowUp()` method — replace with actionability check
- [ ] Keep `hasDeadline` as override: always create follow-up if deadline exists
- [ ] Keep `suppressUrgency` check: never create follow-up for suppressed labels unless deadline
- [ ] Verify with `cd backend && npx tsc --noEmit`

### T-1506: Update email triage worker to propagate new fields [1 SP] ✅ DONE
- [x] Find the BullMQ triage worker/job that calls `analyzeEmailUnified()`
- [ ] Ensure new fields (lane, intent, actionability) are passed through to persistence
- [ ] Verify the triage queue still works end-to-end
- [ ] Verify with `cd backend && npx tsc --noEmit`

---

## Dependencies

- Sprint 14 complete (schema fields, label metadata, triage rules)
- **NOTE**: Sprint 16 removes default labels. All services in this sprint MUST handle `tenantLabels: []` (zero labels) gracefully. No hardcoded label name references (no `"Important"`, `"Customer"`, etc.) — use label metadata (`category`, `defaultLane`, `suppressUrgency`) instead.

## Risks

1. Extracting 3 services from `email-analysis.service.ts` in one sprint is high-touch. Test each extraction independently before wiring.
2. Changing the scoring engine will alter triage results for ALL existing emails. Document the behavioral delta.
3. Removing `normalizeTriageSignals()` is a breaking change if anything else calls it. Grep first.
4. **Zero-labels case**: All new services must return sensible defaults when tenant has no labels (no crashes, no empty-string errors).

## Definition of Done

- [ ] `cd backend && npx tsc --noEmit` passes
- [ ] `email-analysis.service.ts` is under 500 lines
- [ ] New services exist: `label-resolution.service.ts`, `triage-score.service.ts`, `lane-assignment.service.ts`
- [ ] Pipeline order is enforced: LLM → labels → score → lane → follow-up
- [ ] `UnifiedEmailAnalysis` includes `lane`, `laneReason`, `actionability`
- [ ] Follow-up creation respects `actionability` field
- [ ] No circular dependencies (verify with `npx madge --circular`)
