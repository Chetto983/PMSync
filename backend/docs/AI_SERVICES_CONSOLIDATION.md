> **✅ COMPLETED & ARCHIVED**: This document has been consolidated into [AI_ROADMAP_MASTER.md](./AI_ROADMAP_MASTER.md)
> Phase 1 (Unified LLM Call) is COMPLETE. See master roadmap for current status.

# AI Services Consolidation Roadmap

## Executive Summary

**Problem**: Multiple separate LLM calls for email analysis when ONE unified call would suffice.

**Current State** (WASTEFUL):
```
triageEmail()
├── calculatePriority() → 1 LLM call
└── categorizeEmail()   → 1 LLM call
TOTAL: 2 LLM calls per email triage
```

**Target State** (EFFICIENT):
```
triageEmail()
└── analyzeEmailUnified() → 1 LLM call returning ALL:
    ├── summary
    ├── sentiment/tone
    ├── priority/urgency
    ├── labels/categories
    ├── keyTopics
    ├── escalationRisk
    └── smartReplies (optional)
```

**Savings**: 50%+ reduction in LLM API calls, faster triage, lower costs.

---

## Current LLM Call Map

| Method | LLM Calls | Output |
|--------|-----------|--------|
| `summarizeEmail()` | 1 | summary string |
| `generateSmartReplies()` | 1 | reply suggestions[] |
| `categorizeEmail()` | 1 | labels[] |
| `analyzeSentiment()` | 1 | sentiment object |
| `calculatePriority()` | 1 | priority object |
| `analyzeEmail()` | 1 | comprehensive (but NOT used by triage!) |

**Problem in `email-triage.service.ts:181-184`:**
```typescript
// 2 SEPARATE LLM CALLS when 1 would suffice!
const [priorityResult, labels] = await Promise.all([
  this.emailInsights.calculatePriority(tenantId, emailId, locale),
  this.emailInsights.categorizeEmail(tenantId, emailId, locale),
]);
```

---

## EmailAnalysis Schema (Already Exists!)

```prisma
model EmailAnalysis {
  id               String        @id
  emailId          String
  tenantId         String
  priority         EmailPriority @default(NORMAL)     // ✅ Use this!
  category         EmailCategory @default(OTHER)      // ✅ Use this!
  sentiment        Sentiment     @default(NEUTRAL)    // ✅ Use this!
  summary          String?                             // ✅ Use this!
  keyPoints        String[]      @default([])         // ✅ Use this!
  hasDeadline      Boolean       @default(false)
  needsFollowUp    Boolean       @default(false)
  suggestedActions Json          @default("[]")       // For smart replies
  processedAt      DateTime
  latencyMs        Int
}
```

**Current `analyzeEmail()` problem**: Stuffs everything into `suggestedActions` JSON instead of using proper typed fields!

---

## Implementation Plan

### Phase 1: Create Unified Analysis Method

**File**: `email-insights.service.ts`

**New Method**: `analyzeEmailUnified()`

```typescript
interface UnifiedEmailAnalysis {
  // Required fields
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  tone: string;
  priority: 1 | 2 | 3 | 4 | 5; // 1=highest
  urgency: 'critical' | 'high' | 'medium' | 'low';
  labels: string[]; // Max 3, from user's allowed labels
  keyTopics: string[];
  escalationRisk: boolean;

  // Optional fields
  hasDeadline: boolean;
  deadlineDate?: Date;
  needsFollowUp: boolean;
  smartReplies?: string[]; // 3 quick reply suggestions

  // Metadata
  confidence: number; // 0-1
  reasoning: string;
}
```

### Phase 2: Create Unified Prompt

**Prompt Requirements:**
1. Return ALL fields in ONE JSON response
2. Use user's allowed labels (dynamic)
3. Include few-shot examples
4. Structured XML input for email content

**Example Prompt Structure:**
```xml
<task>Analyze this email and return a comprehensive JSON analysis</task>

<email>
  <from>{sender}</from>
  <to>{recipients}</to>
  <subject>{subject}</subject>
  <date>{date}</date>
  <body>{body}</body>
</email>

<allowed_labels>{user's custom labels}</allowed_labels>

<output_format>
{
  "summary": "2-3 sentence summary",
  "sentiment": "positive|neutral|negative",
  "tone": "formal|casual|urgent|friendly",
  "priority": 1-5,
  "urgency": "critical|high|medium|low",
  "labels": ["max", "3", "labels"],
  "keyTopics": ["topic1", "topic2"],
  "escalationRisk": true|false,
  "hasDeadline": true|false,
  "deadlineDate": "ISO date or null",
  "needsFollowUp": true|false,
  "smartReplies": ["Quick reply 1", "Quick reply 2", "Quick reply 3"],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}
</output_format>
```

### Phase 3: Update Persistence

**Save to EmailAnalysis using proper fields:**
```typescript
await this.prisma.emailAnalysis.upsert({
  where: { emailId_tenantId: { emailId, tenantId } },
  update: {
    priority: this.mapPriorityToEnum(result.priority),
    category: this.mapLabelsToCategory(result.labels),
    sentiment: this.mapSentimentToEnum(result.sentiment),
    summary: result.summary,
    keyPoints: result.keyTopics,
    hasDeadline: result.hasDeadline,
    deadlineDate: result.deadlineDate,
    needsFollowUp: result.needsFollowUp,
    suggestedActions: { smartReplies: result.smartReplies },
    processedAt: new Date(),
    latencyMs,
  },
  create: { /* same fields */ },
});
```

**Also update Email table:**
```typescript
await this.prisma.email.updateMany({
  where: { id: emailId, tenantId },
  data: {
    aiPriority: result.priority,
    aiPriorityReason: result.reasoning,
    aiLabels: result.labels,
    isAutoTriaged: true,
    autoTriagedAt: new Date(),
  },
});
```

### Phase 4: Update triageEmail()

**Before:**
```typescript
const [priorityResult, labels] = await Promise.all([
  this.emailInsights.calculatePriority(tenantId, emailId, locale),
  this.emailInsights.categorizeEmail(tenantId, emailId, locale),
]);
```

**After:**
```typescript
const analysis = await this.emailInsights.analyzeEmailUnified(tenantId, emailId, locale);
// Everything already persisted, just return result
return {
  emailId,
  success: true,
  aiPriority: analysis.priority,
  aiLabels: analysis.labels,
  summary: analysis.summary,
  sentiment: analysis.sentiment,
  keyTopics: analysis.keyTopics,
  escalationRisk: analysis.escalationRisk,
};
```

### Phase 5: Deprecate Separate Methods

Mark these as deprecated (keep for backward compatibility):
- `summarizeEmail()` → Use `analyzeEmailUnified()`
- `categorizeEmail()` → Use `analyzeEmailUnified()`
- `analyzeSentiment()` → Use `analyzeEmailUnified()`
- `calculatePriority()` → Use `analyzeEmailUnified()`
- `analyzeEmail()` → Use `analyzeEmailUnified()`

---

## Files to Modify

| File | Changes |
|------|---------|
| `email-insights.service.ts` | Add `analyzeEmailUnified()`, deprecate separate methods |
| `voltagent/locales/en.ts` | Add unified analysis prompt |
| `voltagent/locales/it.ts` | Add unified analysis prompt (Italian) |
| `email-triage.service.ts` | Use `analyzeEmailUnified()` instead of 2 calls |
| `email-triage.service.ts` | Update `TriageResult` interface |

---

## Token/Cost Analysis

**Before (per email triage):**
- `calculatePriority`: ~500 tokens
- `categorizeEmail`: ~400 tokens
- **Total**: ~900 tokens, 2 API calls

**After (per email triage):**
- `analyzeEmailUnified`: ~800 tokens
- **Total**: ~800 tokens, 1 API call

**Savings:**
- ~11% token reduction
- **50% API call reduction** (2 → 1)
- Faster response (no parallel overhead)

---

## Agent Integration

VoltAgent agents will receive full analysis:

```typescript
// IntelligenceAgent can now access:
const analysis = await emailInsights.analyzeEmailUnified(tenantId, emailId);

// All fields available for context:
// - analysis.summary → For briefing
// - analysis.sentiment → For tone awareness
// - analysis.priority → For prioritization
// - analysis.labels → For categorization
// - analysis.keyTopics → For RAG context
// - analysis.escalationRisk → For urgent alerts
// - analysis.smartReplies → For quick response suggestions
```

---

## Verification

```bash
# Type check
npm run type-check

# Test unified analysis
npx ts-node scripts/test-unified-analysis.ts

# Verify triage uses new method
npx ts-node scripts/test-email-triage.ts
```

---

## Timeline

| Phase | Task | LOC Change |
|-------|------|------------|
| 1 | Create `analyzeEmailUnified()` | +150 |
| 2 | Create unified prompt | +80 |
| 3 | Update persistence | +30 |
| 4 | Update `triageEmail()` | -20, +10 |
| 5 | Deprecate methods | +10 (JSDoc) |

**Net**: ~250 LOC added, 1 LLM call saves 50% API usage
