> **📋 ARCHIVED**: This document has been consolidated into [AI_ROADMAP_MASTER.md](./AI_ROADMAP_MASTER.md)
> See Phase 3 (Prompt Enhancements) and Phase 4 (Cost Optimization) for implementation status.

# AI Cost Reduction Audit

**Date**: 2026-01-26
**Purpose**: Audit MailAgent AI module against ESEMPIO_FOLDER_FINDINGS.md patterns

---

## Executive Summary

| Category | Opportunity | Status | Est. LLM Savings |
|----------|-------------|--------|------------------|
| **Pre-filter** | Attention Score System | ❌ NOT IMPLEMENTED | 30-50% fewer calls |
| **Tokenization** | Incremental Re-summarization | ❌ NOT IMPLEMENTED | 60-80% token reduction |
| **Regex** | Role Pattern Classification | ❌ NOT IMPLEMENTED | 100% (no LLM) |
| **Prompts** | Self-check Section | ❌ MISSING | Fewer retries |
| **Prompts** | Thinking Process | ⚠️ PARTIAL | Fewer wrong calls |
| **Prompts** | Bulk Thresholds | ❌ MISSING | Better UX |
| **Caching** | Unified LLM Call | ✅ DONE | 50% API reduction |
| **Caching** | 24h DB Cache | ✅ DONE | ~90% repeat calls |

**Estimated Annual Savings**: 40-60% LLM API costs if all implemented

---

## 1. What's Already Done (Completed)

### 1.1 Unified LLM Call Pattern ✅

**Status**: COMPLETED (2026-01-26)

```typescript
// email-insights.service.ts
analyzeEmailUnified() → Single call returns ALL:
├── summary
├── sentiment/tone
├── priority/urgency
├── labels/categories
├── keyTopics
├── escalationRisk
└── smartReplies (optional)
```

**Savings**: 6+ calls → 1 call = **~83% reduction per analysis**

### 1.2 Database Caching ✅

**Status**: COMPLETED (EmailAnalysis table with 24h TTL)

```typescript
// Cache check before LLM call
const cached = await this.prisma.emailAnalysis.findFirst({
  where: {
    emailId,
    tenantId,
    processedAt: { gt: new Date(Date.now() - CACHE_TTL_MS) },
  },
});
if (cached?.summary) return this.mapEmailAnalysisToUnified(cached);
```

**Savings**: ~90% repeat analysis requests skipped

### 1.3 Prompt Quality ⚠️ Partial

| Pattern | supervisor.prompt.ts | actions.prompt.ts | intelligence.prompt.ts |
|---------|---------------------|-------------------|----------------------|
| XML Structure | ✅ | ✅ | ✅ |
| Few-shot Examples | ✅ | ✅ | ✅ |
| Chain-of-thought | ✅ | ❌ | ❌ |
| Error Recovery | ✅ | ✅ | ✅ |
| **Self-check** | ❌ | ❌ | ❌ |
| **Thinking Process** | ⚠️ basic | ❌ | ❌ |
| **Bulk Thresholds** | N/A | ❌ | N/A |

---

## 2. High-Impact Missing Features (P0)

### 2.1 Attention Score Pre-filter

**Source**: `email-agent-main/triage_agent.py`

**Problem**: Every incoming email triggers full LLM analysis even if it's low-priority spam.

**Solution**: Pre-filter using weighted scoring BEFORE LLM call:

```typescript
// Proposed: attention-score.service.ts
const weights = {
  senderImportance: 0.25,  // VIP vs unknown sender
  categorySignals: 0.30,   // Keywords indicating action needed
  urgencyIndicators: 0.20, // Time-sensitive terms
  recency: 0.15,           // How recent
  threadContext: 0.10,     // Ongoing conversation
};

// Only call LLM if score > 0.3
if (attentionScore < 0.3) {
  // Auto-archive or defer analysis
  return { triageDecision: 'auto_archive', llmCalled: false };
}
```

**Impact**: 30-50% fewer LLM calls for low-priority emails
**Effort**: ~200 LOC (new service)
**Files**: `voltagent/services/attention-score.service.ts` (CREATE)

### 2.2 Incremental Re-summarization

**Source**: `Zero-staging/brain.fallback.prompts.ts`

**Problem**: `ConversationCompactionService` re-processes ENTIRE conversation each time.

**Current** (wasteful):
```typescript
// Re-summarizes all messages from scratch
const allMessages = await getConversationMessages(conversationId);
const summary = await llm.summarize(allMessages); // Full context each time
```

**Proposed** (efficient):
```typescript
// Only summarize NEW messages, preserve existing summary
const existingSummary = conversation.summary;
const newMessages = getMessagesSince(lastSummarizedAt);

if (newMessages.length === 0) return existingSummary;

const updatedSummary = await llm.call(`
  <existing_summary>${existingSummary}</existing_summary>
  <new_messages>${newMessages}</new_messages>
  Update the summary by integrating new messages. Preserve prior details.
`);
```

**Impact**: 60-80% token reduction for thread summaries
**Effort**: ~80 LOC (modify existing service)
**Files**: `voltagent/services/conversation-compaction.service.ts`

### 2.3 Role Pattern Classification (Regex-Based)

**Source**: `email-agent-main/relationship_intelligence.py`

**Problem**: LLM called to classify contact roles when regex would work.

**Current** (uses LLM):
```typescript
// RelationshipIntelligenceService makes LLM call for role classification
const role = await llm.classify(contactInfo);
```

**Proposed** (regex - no LLM):
```typescript
const ROLE_PATTERNS: Record<string, RegExp> = {
  board: /board|director|chairman|chairperson|trustee/i,
  investor: /investor|investment|venture|partner\b|vc\b|angel/i,
  customer: /customer|client|user|subscriber|buyer/i,
  advisor: /advisor|consultant|coach|mentor/i,
  vendor: /vendor|supplier|provider|contractor/i,
  team: /team|colleague|coworker|employee|staff/i,
  executive: /ceo|cto|cfo|coo|president|vp|chief/i,
};

function classifyRole(jobTitle: string, company: string): string {
  const text = `${jobTitle} ${company}`.toLowerCase();
  for (const [role, pattern] of Object.entries(ROLE_PATTERNS)) {
    if (pattern.test(text)) return role;
  }
  return 'other';
}
```

**Impact**: 100% savings (no LLM needed for role classification)
**Effort**: ~100 LOC (extend existing service)
**Files**: `voltagent/services/relationship-intelligence.service.ts`

---

## 3. Medium-Impact Missing Features (P1)

### 3.1 Self-Check Section in Prompts

**Source**: All system prompts in `system-prompts-collection`

**Problem**: Agents sometimes make wrong tool calls on first attempt, requiring retries.

**Solution**: Add self-check section to all prompts:

```xml
<self_check>
Before finalizing response:
1. Did I use the correct tool for this operation?
2. Did I search for the entity ID before attempting a write operation?
3. Is the response actionable and helpful?
4. Did I follow the HITL workflow for destructive actions?
5. Am I avoiding unnecessary explanations?
</self_check>
```

**Impact**: Fewer retry loops = lower token usage
**Effort**: ~30 LOC (add to 3 prompts)
**Files**: `prompts/*.prompt.ts`

### 3.2 Thinking Process Section

**Source**: `Zero-staging/prompts.ts` (AiChatPrompt)

**Problem**: SupervisorAgent has basic CoT but not structured thinking process.

**Current** (basic):
```xml
<CHAIN_OF_THOUGHT>
Before delegating, think step-by-step:
1. Is this READ or WRITE operation?
...
</CHAIN_OF_THOUGHT>
```

**Proposed** (enhanced):
```xml
<thinking_process>
Before acting, think step-by-step:
1. What is the user's primary intent?
2. Is this a READ or WRITE operation?
3. What tools are needed and in what sequence?
4. Are there ambiguities requiring clarification?
5. What safety protocols apply?
Keep reasoning internal - never expose to user.
</thinking_process>
```

**Impact**: Better first-attempt accuracy
**Effort**: ~30 LOC
**Files**: `prompts/supervisor.prompt.ts`

### 3.3 Bulk Operation Thresholds

**Source**: `Zero-staging/prompts.ts` (AiChatPrompt)

**Problem**: ActionsAgent treats all bulk operations the same regardless of count.

**Solution**: Add tiered safety thresholds:

```xml
<bulk_operation_safety>
<thresholds>
  <tier count="1-2">Execute immediately with confirmation message</tier>
  <tier count="3-5">Preview samples before execution</tier>
  <tier count="6-20">Show count + samples, require explicit confirmation</tier>
  <tier count="21+">Suggest batched processing with checkpoints</tier>
</thresholds>
<destructive_actions>
  Always require explicit "confirm" or "yes" for:
  - Permanent deletion
  - Moving to trash/archive
  - Bulk label modifications
</destructive_actions>
</bulk_operation_safety>
```

**Impact**: Better UX, fewer mistakes with bulk ops
**Effort**: ~50 LOC
**Files**: `prompts/actions.prompt.ts`, `hitl.service.ts`

---

## 4. Implementation Priority

### Phase 1: Prompt Enhancements (1 day, ~110 LOC)

| Task | File | LOC |
|------|------|-----|
| Add `<self_check>` to all prompts | `*.prompt.ts` | ~30 |
| Enhance `<thinking_process>` | `supervisor.prompt.ts` | ~30 |
| Add bulk thresholds | `actions.prompt.ts` | ~50 |

### Phase 2: Pre-filter System (2 days, ~200 LOC)

| Task | File | LOC |
|------|------|-----|
| Create AttentionScoreService | `attention-score.service.ts` (NEW) | ~150 |
| Integrate with email-triage | `email-triage.service.ts` | ~30 |
| Add config for thresholds | `voltagent.module.ts` | ~20 |

### Phase 3: Optimization (2 days, ~180 LOC)

| Task | File | LOC |
|------|------|-----|
| Incremental re-summarization | `conversation-compaction.service.ts` | ~80 |
| Role pattern classification | `relationship-intelligence.service.ts` | ~100 |

---

## 5. Estimated ROI

### Current Monthly Cost (Hypothetical)
- 10,000 emails analyzed/month
- 6 LLM calls per email (before consolidation) → 60,000 calls
- $0.01 per call → **$600/month**

### After Full Implementation

| Optimization | Reduction | Calls Saved | Monthly Savings |
|--------------|-----------|-------------|-----------------|
| Unified LLM call | 83% | 50,000 | $500 |
| 24h DB cache | 90% | 9,000 | $90 |
| Attention pre-filter | 40% | 400 | $4 |
| Incremental summarization | 70% | ~200 | $2 |
| Role regex | 100% | ~100 | $1 |
| Prompt improvements | 20% | ~100 | $1 |

**Estimated Total Savings**: ~$598/month (99.7% reduction)

*Note: Already achieved ~83% with unified LLM call. Additional optimizations provide marginal but important improvements.*

---

## 6. Verification Checklist

After implementation:

```bash
# Type check
npm run type-check

# Test attention scoring
npx ts-node scripts/test-attention-score.ts

# Test incremental summarization
npx ts-node scripts/test-incremental-summary.ts

# Verify role classification
npx ts-node scripts/test-role-patterns.ts
```

---

## References

- [ESEMPIO_FOLDER_FINDINGS.md](./ESEMPIO_FOLDER_FINDINGS.md)
- [AI_MODULE_AUDIT.md](./AI_MODULE_AUDIT.md)
- [AI_SERVICES_CONSOLIDATION.md](./AI_SERVICES_CONSOLIDATION.md)
