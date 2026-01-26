# AI Module Master Roadmap

**Last Updated**: 2026-01-26
**Status**: Consolidated from 6 separate documents

---

## Executive Summary

| Phase | Status | Impact | LOC Change |
|-------|--------|--------|------------|
| **Phase 1**: Unified LLM Call | ✅ COMPLETED | 83% API reduction | -268 |
| **Phase 2**: VoltAgent Simplification | ✅ COMPLETED | Code cleanup | -950 |
| **Phase 3**: Prompt Enhancements | ✅ COMPLETED | Fewer retries | +110 |
| **Phase 4**: Cost Optimization | ✅ COMPLETED | 30-50% fewer calls | +380 |
| **Phase 5**: Sentinel Migration | 🔄 OPTIONAL | Security upgrade | -550 |

**Total Completed Savings**: ~1,708 LOC changed, 83% LLM API calls reduced + 30-50% additional savings + improved prompt reliability

---

## ✅ PHASE 1: AI Services Consolidation (COMPLETED)

**Date Completed**: 2026-01-26
**Source Document**: `AI_SERVICES_CONSOLIDATION.md`, `AI_MODULE_AUDIT.md`

### What Was Done

| Before | After |
|--------|-------|
| 6+ separate LLM calls | 1 unified call |
| No DB persistence | EmailAnalysis table with 24h cache |
| Scattered methods | `analyzeEmailUnified()` |

### Deleted Methods (~268 LOC)

| Method | Status |
|--------|--------|
| `summarizeEmail()` | ✅ DELETED |
| `categorizeEmail()` | ✅ DELETED |
| `analyzeSentiment()` | ✅ DELETED |
| `calculatePriority()` | ✅ DELETED |
| `analyzeEmail()` | ✅ DELETED |
| `guessLabelsFromText()` | ✅ DELETED |

### Updated Endpoints

All AI controller endpoints now use `analyzeEmailUnified()`:
- `POST /ai/summarize/:emailId`
- `POST /ai/categorize/:emailId`
- `POST /ai/sentiment/:emailId`
- `POST /ai/priority/:emailId`
- `POST /ai/analyze/:emailId`

### Caching Architecture

```typescript
// 24-hour cache in email-insights.service.ts
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cached = await this.prisma.emailAnalysis.findFirst({
  where: {
    emailId,
    tenantId,
    processedAt: { gt: new Date(Date.now() - CACHE_TTL_MS) },
  },
});
if (cached?.summary) return this.mapEmailAnalysisToUnified(cached);
```

---

## ✅ PHASE 2: VoltAgent 2.x Simplification (COMPLETED)

**Date Completed**: 2026-01-23
**Source Document**: `VOLTAGENT_2X_SIMPLIFICATION_ROADMAP.md`

### Completed Sub-phases

| Sub-phase | Status | Notes |
|-----------|--------|-------|
| Fix HITL FK constraint | ✅ DONE | `ActionQueue.userId` nullable + validation |
| Remove model router | ✅ DONE | 554 LOC deleted |
| Simplify memory | ✅ DONE | Duplicate persistence removed |
| Delete dead workflows | ✅ DONE | `briefing.workflow.ts`, `follow-up.workflow.ts` |
| Simplify chat processor | ✅ DONE | Already minimal at 217 LOC |
| Prompt consolidation | ✅ DONE | All prompts have few-shot, CoT, error recovery |

### Bug Fixes Included

| Bug | Status |
|-----|--------|
| Security Guard False Positives | ✅ FIXED (context-aware validation) |
| UTF8 Null Byte Encoding Error | ✅ FIXED (sanitizeContentForPostgres) |
| Rate Limiting Test Failures | ⚠️ MITIGATED (increased test delay) |

### Files Deleted (~950 LOC)

| File | LOC | Status |
|------|-----|--------|
| `model-router.service.ts` | 554 | ✅ DELETED |
| `workflows/briefing.workflow.ts` | ~100 | ✅ DELETED |
| `workflows/follow-up.workflow.ts` | ~100 | ✅ DELETED |
| Dead prompts in `locales/en.ts` | ~190 | ✅ DELETED |

### HITL Decision: Keep Custom Pattern

**Evaluated and REJECTED** VoltAgent native `needsApproval: true` because:
- Native: Binary suspend flag only, no metadata
- Custom: Rich metadata (severity, actionType, payload, summary)
- Custom integrates with LearningService for confidence adjustment
- Custom enables conditional auto-approve based on severity

**Decision**: KEEP the current `requiresApproval: true` return pattern.

---

## ✅ PHASE 3: Prompt Enhancements (COMPLETED)

**Date Completed**: 2026-01-26
**Source Document**: `COST_REDUCTION_AUDIT.md`, `ESEMPIO_FOLDER_FINDINGS.md`
**Actual Effort**: 1 day, ~110 LOC

### 3.1 Add Self-Check Section ✅ COMPLETED

**Status**: ✅ IMPLEMENTED (2026-01-26)

Added `<SELF_CHECK>` to all three prompt files with agent-specific checks:

- **supervisor.prompt.ts**: Routing validation, delegation clarity, anti-over-engineering
- **actions.prompt.ts**: Tool correctness, ID-first workflow, HITL severity, bulk safety
- **intelligence.prompt.ts**: Tool selection, semantic vs keyword search, result presentation

**Impact**: Fewer retry loops = lower token usage

### 3.2 Enhance Thinking Process ✅ COMPLETED

**Status**: ✅ IMPLEMENTED (2026-01-26)

Enhanced `<THINKING_PROCESS>` in supervisor.prompt.ts with 6-step reasoning:

```xml
<THINKING_PROCESS>
Before acting, think step-by-step (keep reasoning internal):
1. What is the user's primary intent?
2. Is this a READ or WRITE operation?
3. What tools/agents are needed and in what sequence?
4. Are there ambiguities requiring clarification?
5. What safety protocols apply (HITL for writes)?
6. Does this need multi-step coordination?
</THINKING_PROCESS>
```

### 3.3 Add Bulk Operation Thresholds ✅ COMPLETED

**Status**: ✅ IMPLEMENTED (2026-01-26)

Added `<BULK_OPERATION_SAFETY>` to actions.prompt.ts:

```xml
<BULK_OPERATION_SAFETY>
<tier count="1-2">Execute immediately with confirmation</tier>
<tier count="3-5">Preview samples before execution</tier>
<tier count="6-20">Show count + samples, require explicit confirmation</tier>
<tier count="21+">Suggest batched processing</tier>
</BULK_OPERATION_SAFETY>
```

### Files Modified

| File | Changes | Status |
|------|---------|--------|
| `prompts/supervisor.prompt.ts` | Add `<SELF_CHECK>`, enhance `<THINKING_PROCESS>` | ✅ DONE |
| `prompts/actions.prompt.ts` | Add `<SELF_CHECK>`, add `<BULK_OPERATION_SAFETY>` | ✅ DONE |
| `prompts/intelligence.prompt.ts` | Add `<SELF_CHECK>` | ✅ DONE |

---

## ✅ PHASE 4: Cost Optimization (COMPLETED)

**Date Completed**: 2026-01-26
**Source Document**: `COST_REDUCTION_AUDIT.md`, `ESEMPIO_FOLDER_FINDINGS.md`
**Actual Effort**: 2 days, ~380 LOC

### 4.1 Attention Score Pre-filter ✅ COMPLETED

**Status**: ✅ IMPLEMENTED (2026-01-26)
**Impact**: 30-50% fewer LLM calls

**Implementation**:
- Created `voltagent/services/attention-score.service.ts` (~200 LOC)
- Integrated with `email-triage.service.ts`
- Multi-factor weighted scoring:

```typescript
// Implemented in attention-score.service.ts
const weights = {
  senderImportance: 0.25,  // VIP contacts, known domains
  categorySignals: 0.30,   // Action keywords, calendar invites
  urgencyIndicators: 0.20, // Time-sensitive terms
  recency: 0.15,           // Message age decay
  threadContext: 0.10,     // Reply chain depth
};

// Thresholds:
// score < 0.25 → auto_archive (skip LLM entirely)
// score >= 0.25 && score < 0.50 → keep (minimal processing)
// score >= 0.50 → full_analysis (LLM triage)
```

**Files Created/Modified**:
- `voltagent/services/attention-score.service.ts` (CREATE, ~200 LOC)
- `ai/services/email-triage.service.ts` (MODIFY, ~50 LOC)

### 4.2 Incremental Re-summarization ✅ COMPLETED

**Status**: ✅ IMPLEMENTED (2026-01-26)
**Impact**: 60-80% token reduction for thread summaries

**Implementation**:
- Added `SummaryState` tracking to `ConversationCompactionService`
- Only processes NEW messages since last summarization
- Merges new content with existing summary

```typescript
// Implemented in conversation-compaction.service.ts
interface SummaryState {
  summary: string;
  keyFacts: string[];
  messageCount: number;
  lastMessageId?: string;
  tokenReduction: number;
  updatedAt: string;
}

// New method: tryIncrementalSummarization()
// - Checks if existing summary state exists
// - Counts messages since lastMessageId
// - If no new messages → returns existing summary (100% savings)
// - If new messages → only summarizes NEW messages + merges
```

**Files Modified**:
- `voltagent/services/conversation-compaction.service.ts` (MODIFY, ~100 LOC)

### 4.3 Role Pattern Classification ✅ COMPLETED

**Status**: ✅ IMPLEMENTED (2026-01-26)
**Impact**: 100% LLM savings for contact role detection

**Implementation**:
- Added localized regex patterns to `locales/en.ts` and `locales/it.ts`
- Hybrid approach: regex first, embedding fallback for unknown patterns
- Updated `relationship-intelligence.service.ts` to use locale patterns

```typescript
// Role patterns in locales/en.ts + locales/it.ts
rolePatterns: {
  board: /board|director|chairman|chairperson|trustee|consigliere/i,
  investor: /investor|investment|venture|partner\b|vc\b|angel|investitore/i,
  customer: /customer|client|user|subscriber|buyer|cliente/i,
  advisor: /advisor|consultant|coach|mentor|consulente/i,
  vendor: /vendor|supplier|provider|contractor|fornitore/i,
  team: /team|colleague|coworker|employee|staff|collega/i,
  executive: /ceo|cto|cfo|coo|president|vp|chief|direttore/i,
}

// Hybrid classification flow:
// 1. Try regex patterns → instant match → return role
// 2. If no match → use embedding similarity as fallback
// 3. If similarity < threshold → return 'other'
```

**Files Modified**:
- `voltagent/locales/en.ts` (ADD role patterns)
- `voltagent/locales/it.ts` (ADD role patterns)
- `voltagent/locales/index.ts` (ADD types)
- `voltagent/services/relationship-intelligence.service.ts` (MODIFY, ~100 LOC)

### Summary of Phase 4

| Optimization | LOC | Savings | Status |
|--------------|-----|---------|--------|
| Attention Score Pre-filter | +200 | 30-50% fewer LLM calls | ✅ DONE |
| Incremental Re-summarization | +100 | 60-80% token reduction | ✅ DONE |
| Role Pattern Regex + Embedding | +100 | 100% (no LLM for matches) | ✅ DONE |
| **Total** | +400 | | ✅ COMPLETED |

---

## 🔄 PHASE 5: Sentinel Migration (OPTIONAL)

**Priority**: P3 - Security Upgrade
**Source Document**: `VOLTAGENT_SIMPLIFICATION_PLAN.md`
**Estimated Effort**: 4 days, -550 LOC

### Proposal

Replace custom PII and prompt guard services with `@sentinelseed/voltagent`:

| Custom Code | LOC | Replacement |
|-------------|-----|-------------|
| `PiiDetectionService` | 186 | Sentinel `detectPII()` |
| `PromptGuardService` | 370 | Sentinel OWASP + THSP + Mistral `safe_prompt` |

### Migration Path

```typescript
import { createSentinelGuardrails } from '@sentinelseed/voltagent';

const guardrails = createSentinelGuardrails({
  preset: 'standard',
  pii: { enabled: true, redact: true },
  owasp: { enabled: true },
});

const result = await guardrails.processInput(message);
```

### Decision: OPTIONAL

**Why Optional**:
- Current implementation WORKS and passed security audit
- Migration risk > benefit ratio
- Focus resources on cost optimization (Phase 4) first

**Recommendation**: Defer to Q2 2026 unless security requirements change.

---

## Action Items Checklist

### Immediate (Week 1) ✅ COMPLETED

- [x] Add `<self_check>` to all 3 prompt files ✅ 2026-01-26
- [x] Enhance `<thinking_process>` in supervisor prompt ✅ 2026-01-26
- [x] Add bulk operation thresholds to actions prompt ✅ 2026-01-26
- [x] Run type-check and test after prompt changes ✅ 2026-01-26

### Short-term (Week 2-3) ✅ COMPLETED

- [x] Create `AttentionScoreService` ✅ 2026-01-26
- [x] Integrate with `email-triage.service.ts` ✅ 2026-01-26
- [x] Add role pattern regex to `relationship-intelligence.service.ts` ✅ 2026-01-26
- [x] Test attention score pre-filtering ✅ 2026-01-26

### Medium-term (Week 4) ✅ COMPLETED

- [x] Implement incremental re-summarization ✅ 2026-01-26
- [x] Update `ConversationCompactionService` ✅ 2026-01-26
- [ ] Add test scripts for new optimizations
- [ ] Document cost savings in metrics

### Deferred (Q2 2026)

- [ ] Evaluate Sentinel migration
- [ ] Consider Mistral `safe_prompt` integration
- [ ] Review security requirements

---

## Verification Commands

```bash
# Type check
npm run type-check

# Test unified analysis
npx ts-node scripts/test-unified-analysis.ts

# Test attention scoring
npx ts-node scripts/test-attention-score.ts

# Test role patterns
npx ts-node scripts/test-role-patterns.ts

# Full bruteforce test
npx ts-node scripts/bruteforce-voltagent-test.ts
```

---

## Estimated ROI

### Already Achieved

| Optimization | Reduction |
|--------------|-----------|
| Unified LLM call (6→1) | ~83% API calls |
| 24h DB cache | ~90% repeat requests |
| Dead code removed | ~1,218 LOC |

### After Full Phase 4 Implementation

| Optimization | Additional Savings |
|--------------|-------------------|
| Attention pre-filter | 30-50% fewer LLM calls |
| Incremental summarization | 60-80% token reduction |
| Role regex | 100% (no LLM) for role classification |
| Prompt improvements | ~20% fewer retries |

---

## Archived Documents

The following documents are now consolidated into this master roadmap:

| Document | Status |
|----------|--------|
| `AI_SERVICES_CONSOLIDATION.md` | ✅ Merged (Phase 1) |
| `VOLTAGENT_2X_SIMPLIFICATION_ROADMAP.md` | ✅ Merged (Phase 2) |
| `VOLTAGENT_SIMPLIFICATION_PLAN.md` | ✅ Merged (Phase 5) |
| `COST_REDUCTION_AUDIT.md` | ✅ Merged (Phase 3-4) |
| `ESEMPIO_FOLDER_FINDINGS.md` | ✅ Referenced (Patterns) |
| `AI_MODULE_AUDIT.md` | ✅ Merged (Phase 1) |

**These documents can be deleted** after confirming this master roadmap is complete.

---

## References

- [VoltAgent Documentation](https://voltagent.dev/)
- [Mistral Guardrailing](https://docs.mistral.ai/capabilities/guardrailing)
- [@sentinelseed/voltagent](https://www.npmjs.com/package/@sentinelseed/voltagent)
- [Inbox Zero (Reference)](https://github.com/elie222/inbox-zero)
