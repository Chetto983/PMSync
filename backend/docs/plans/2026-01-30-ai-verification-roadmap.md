# AI Verification Roadmap - Real LLM & Real Data Testing

**Created**: 2026-01-30
**Status**: DRAFT
**Rule**: NO MOCKS, NO JEST - Real tests only

---

## Executive Summary

This roadmap defines comprehensive verification of all AI functionality using:
- **Real LLM calls** (Mistral API)
- **Real email data** (user's actual inbox)
- **Real embeddings** (pgvector)
- **Production-grade metrics** with industrial benchmarks

---

## 1. METRICS FRAMEWORK

### 1.1 Quality Score Metrics

| Metric | Formula | Target | Industrial Benchmark |
|--------|---------|--------|---------------------|
| **Accuracy** | (TP+TN)/(TP+TN+FP+FN) | >90% | Gmail: 92%, Superhuman: 95% |
| **Precision** | TP/(TP+FP) | >85% | Gmail: 88%, Outlook: 82% |
| **Recall** | TP/(TP+FN) | >85% | Gmail: 85%, Superhuman: 92% |
| **F1 Score** | 2*(P*R)/(P+R) | >85% | Industry avg: 86% |
| **MRR** (Mean Reciprocal Rank) | 1/rank of first correct | >0.8 | Search engines: 0.75-0.85 |
| **NDCG@10** (Normalized DCG) | DCG/IDCG at k=10 | >0.85 | RAG systems: 0.80-0.90 |
| **BLEU Score** (text generation) | n-gram overlap | >0.4 | GPT-4: 0.45, Claude: 0.48 |
| **ROUGE-L** (summarization) | LCS-based F1 | >0.5 | State-of-art: 0.52 |

### 1.2 Time/Latency Metrics

| Metric | Definition | Target | Industrial Benchmark |
|--------|------------|--------|---------------------|
| **TTFT** (Time To First Token) | First token latency | <500ms | Superhuman: 300ms, Gmail: 800ms |
| **P50 Latency** | Median response time | <1s | Superhuman: 500ms |
| **P95 Latency** | 95th percentile | <3s | Industry: 2-5s |
| **P99 Latency** | 99th percentile | <5s | Industry: 5-10s |
| **Throughput** | Requests/second | >50 RPS | Production: 100-500 RPS |
| **Token/sec** | Generation speed | >30 tok/s | Mistral: 40 tok/s |
| **Queue Wait** | Time in queue | <100ms | Acceptable: <500ms |
| **Cache Hit Rate** | Cache hits/total | >60% | Target: 50-70% cost savings |

### 1.3 Cost Metrics

| Metric | Definition | Target | Industrial Benchmark |
|--------|------------|--------|---------------------|
| **$/1K emails** | Cost per 1000 emails processed | <$0.50 | Industry: $0.30-$1.00 |
| **$/1K queries** | Cost per 1000 AI queries | <$0.10 | With caching: $0.05-$0.15 |
| **Embedding $/M tokens** | Mistral embedding cost | $0.10 | OpenAI: $0.13, Mistral: $0.10 |
| **LLM $/M tokens** | Mistral small cost | $0.03 in, $0.11 out | GPT-4: $30 in, $60 out |

### 1.4 Industrial Score Benchmarks

| System | Email Triage Accuracy | Search Relevance | Response Time | Smart Reply Quality |
|--------|----------------------|------------------|---------------|---------------------|
| **Superhuman** | 95% | 0.92 NDCG | 300ms P50 | 4.5/5 user rating |
| **Gmail** | 92% | 0.85 NDCG | 800ms P50 | 4.0/5 user rating |
| **Outlook** | 88% | 0.78 NDCG | 1200ms P50 | 3.8/5 user rating |
| **Spark** | 90% | 0.80 NDCG | 600ms P50 | 4.2/5 user rating |
| **MailAgent Target** | **>93%** | **>0.88 NDCG** | **<500ms P50** | **>4.3/5** |

---

## 2. COMPONENT TEST MATRIX

### 2.1 Intent Classification

**File**: `nlp/intent-classifier.service.ts`, `voltagent/services/nlp-intent-classifier.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| EN intent accuracy | Accuracy | >92% | 500 labeled samples |
| IT intent accuracy | Accuracy | >90% | 500 labeled samples |
| Typo robustness | Accuracy drop | <5% | Introduce 10% typos |
| Classification latency | P99 | <1ms | 1000 sequential calls |
| Bilingual mixed | F1 Score | >88% | Mixed EN/IT queries |

**Test Script**: `scripts/test-intent-classification.ts`
```typescript
// Test structure
interface IntentTestResult {
  totalSamples: number;
  accuracy: number;
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1: Record<string, number>;
  confusionMatrix: number[][];
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
}
```

### 2.2 Email Insights (Summarization, Sentiment, Priority)

**File**: `services/email-insights.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Summary quality | ROUGE-L | >0.45 | 100 emails with human summaries |
| Sentiment accuracy | Accuracy | >88% | 200 labeled emails |
| Priority ranking | NDCG@10 | >0.85 | 100 ranked email sets |
| Smart reply relevance | Human rating | >4.0/5 | 50 emails, 3 replies each |
| Batch processing | Throughput | >20 emails/s | 500 email batch |
| Single email latency | P95 | <2s | 100 sequential calls |

**Test Script**: `scripts/test-email-insights.ts`
```typescript
interface InsightsTestResult {
  summaryRougeL: number;
  sentimentAccuracy: number;
  priorityNDCG: number;
  smartReplyRating: number;
  throughputEmailsPerSec: number;
  latencyP50: number;
  latencyP95: number;
  costPer1000Emails: number;
}
```

### 2.3 Email Triage (Auto-categorization)

**File**: `services/email-triage.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Category accuracy | Accuracy | >90% | 500 pre-labeled emails |
| Junk detection | Precision | >95% | 200 spam + 200 legit |
| Urgent detection | Recall | >92% | 100 urgent emails |
| Cost protection | Max batch | =20 | Verify batch limits |
| Duplicate prevention | Rate | 0% | Re-triage same emails |
| Batch latency | P95 | <10s for 20 | 20-email batches |

**Test Script**: `scripts/test-email-triage.ts`
```typescript
interface TriageTestResult {
  categoryAccuracy: number;
  junkPrecision: number;
  urgentRecall: number;
  avgBatchSize: number;
  duplicatesFound: number;
  batchLatencyP95: number;
  costPer1000Triaged: number;
}
```

### 2.4 RAG & Semantic Search

**File**: `voltagent/rag/unified-retriever.ts`, `services/knowledge-base.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Email retrieval | NDCG@10 | >0.85 | 100 query-email pairs |
| Contact retrieval | MRR | >0.80 | 50 "who is X" queries |
| Cross-source fusion | NDCG@10 | >0.82 | 50 multi-source queries |
| Memory-first ordering | Position | Top 3 | 30 memory queries |
| Semantic similarity | Cosine sim | >0.75 | 100 paraphrase pairs |
| Retrieval latency | P95 | <800ms | 200 queries |
| 1000+ doc corpus | NDCG@10 | >0.80 | Large corpus test |

**Test Script**: `scripts/test-rag-retrieval.ts`
```typescript
interface RAGTestResult {
  emailNDCG: number;
  contactMRR: number;
  fusionNDCG: number;
  memoryFirstRate: number;
  semanticSimilarity: number;
  latencyP50: number;
  latencyP95: number;
  corpusSize: number;
}
```

### 2.5 Embedding Service

**File**: `services/embeddings.service.ts`, `services/embedding/embedding-provider.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Cache hit rate | Rate | >60% | 1000 queries, 40% repeated |
| Embedding quality | Cosine sim | >0.85 | Paraphrase pairs |
| Batch throughput | Items/sec | >50 | 500 item batch |
| Rate limit compliance | Errors | 0 | Burst 100 requests |
| Circuit breaker | Recovery | <60s | Simulate failures |
| Cost per 1M tokens | Cost | <$0.12 | Track actual cost |

**Test Script**: `scripts/test-embedding-service.ts`
```typescript
interface EmbeddingTestResult {
  cacheHitRate: number;
  qualityCosine: number;
  batchThroughput: number;
  rateLimitErrors: number;
  circuitBreakerRecovery: number;
  costPer1MTokens: number;
  totalEmbeddingsGenerated: number;
}
```

### 2.6 Agent Orchestration

**File**: `voltagent/agents/unified.agent.ts`, `voltagent/services/agent-pool.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Task routing accuracy | Accuracy | >95% | 100 diverse queries |
| Tool selection | Precision | >90% | 100 action queries |
| Multi-step completion | Success | >85% | 50 complex workflows |
| Concurrent sessions | Throughput | >10 | 10 parallel sessions |
| Context preservation | Accuracy | >95% | 20 multi-turn convos |
| TTFT (streaming) | P95 | <600ms | 100 streaming requests |

**Test Script**: `scripts/test-agent-orchestration.ts`
```typescript
interface AgentTestResult {
  routingAccuracy: number;
  toolSelectionPrecision: number;
  multiStepSuccess: number;
  concurrentThroughput: number;
  contextAccuracy: number;
  ttftP50: number;
  ttftP95: number;
  avgTokensPerResponse: number;
}
```

### 2.7 Email Actions (Send, Reply, Forward)

**File**: `voltagent/services/executors/email-executor.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Send success rate | Rate | 100% | 20 test emails |
| Reply threading | Accuracy | 100% | 10 reply chains |
| Forward completeness | Rate | 100% | 10 forwards |
| Concurrent sends | Success | 100% | 5 parallel sends |
| Rollback on failure | Rate | 100% | Simulate failures |
| Draft composition | BLEU | >0.35 | 30 draft generations |

**Test Script**: `scripts/test-email-executor.ts`
```typescript
interface EmailExecutorTestResult {
  sendSuccessRate: number;
  replyThreadingAccuracy: number;
  forwardCompleteness: number;
  concurrentSuccessRate: number;
  rollbackSuccessRate: number;
  draftBLEU: number;
  avgSendLatency: number;
}
```

### 2.8 Calendar Intelligence

**File**: `voltagent/services/calendar-conflict.service.ts`, `voltagent/services/focus-time.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Conflict detection | Recall | >98% | 100 overlapping events |
| Timezone handling | Accuracy | 100% | 20 cross-TZ events |
| Focus time protection | Rate | >95% | 30 focus block tests |
| Available slot finding | Precision | >90% | 50 slot queries |
| Meeting prep quality | Rating | >4.0/5 | 20 meeting preps |

**Test Script**: `scripts/test-calendar-intelligence.ts`
```typescript
interface CalendarTestResult {
  conflictRecall: number;
  timezoneAccuracy: number;
  focusProtectionRate: number;
  slotFindingPrecision: number;
  meetingPrepRating: number;
  avgLatency: number;
}
```

### 2.9 CRM & Relationship Intelligence

**File**: `voltagent/services/relationship-intelligence.service.ts`, `voltagent/services/attention-score.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Stale contact detection | Recall | >90% | 100 contacts, 30 stale |
| Relationship scoring | Correlation | >0.8 | Human-ranked contacts |
| Attention score ranking | NDCG@10 | >0.85 | 50 priority rankings |
| VIP detection | Precision | >95% | 30 VIP contacts |
| Response time tracking | Accuracy | >95% | 100 email threads |

**Test Script**: `scripts/test-crm-intelligence.ts`
```typescript
interface CRMTestResult {
  staleDetectionRecall: number;
  relationshipCorrelation: number;
  attentionNDCG: number;
  vipPrecision: number;
  responseTimeAccuracy: number;
}
```

### 2.10 HITL Approval Workflow

**File**: `voltagent/services/hitl.service.ts`, `voltagent/services/approval-workflow.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Approval routing | Accuracy | 100% | 30 approval requests |
| Timeout handling | Behavior | Correct | 10 timeout scenarios |
| Rejection logging | Completeness | 100% | 20 rejections |
| Escalation triggers | Accuracy | 100% | 10 escalation cases |
| Audit trail | Completeness | 100% | 50 workflow instances |

**Test Script**: `scripts/test-hitl-workflow.ts`
```typescript
interface HITLTestResult {
  routingAccuracy: number;
  timeoutHandled: number;
  rejectionsLogged: number;
  escalationsTriggered: number;
  auditTrailComplete: number;
  avgApprovalLatency: number;
}
```

### 2.11 Security & PII Detection

**File**: `guards/pii-detection-sentinel.service.ts`, `guards/prompt-guard-sentinel.service.ts`

| Test Case | Metric | Target | Method |
|-----------|--------|--------|--------|
| Email PII detection | Recall | >98% | 100 emails with PII |
| SSN detection | Recall | >99% | 50 SSN patterns |
| API key detection | Recall | >95% | 30 API key patterns |
| Prompt injection block | Recall | >95% | 50 injection attempts |
| False positive rate | Rate | <5% | 200 clean samples |

**Test Script**: `scripts/test-security-guards.ts`
```typescript
interface SecurityTestResult {
  emailPiiRecall: number;
  ssnRecall: number;
  apiKeyRecall: number;
  injectionBlockRate: number;
  falsePositiveRate: number;
}
```

---

## 3. TEST EXECUTION PHASES

### Phase 1: Component Isolation (Week 1)
| Day | Component | Scripts | Expected Duration |
|-----|-----------|---------|-------------------|
| 1 | Intent Classification | `test-intent-classification.ts` | 2h |
| 1 | PII/Security Guards | `test-security-guards.ts` | 2h |
| 2 | Embedding Service | `test-embedding-service.ts` | 3h |
| 2 | Cache Pre-warming | `test-cache-prewarming.ts` | 1h |
| 3 | Email Insights | `test-email-insights.ts` | 4h |
| 3 | Email Triage | `test-email-triage.ts` | 3h |
| 4 | RAG Retrieval | `test-rag-retrieval.ts` | 4h |
| 5 | Calendar Intelligence | `test-calendar-intelligence.ts` | 3h |
| 5 | CRM Intelligence | `test-crm-intelligence.ts` | 3h |

### Phase 2: Integration Testing (Week 2)
| Day | Workflow | Scripts | Expected Duration |
|-----|----------|---------|-------------------|
| 1 | Agent Orchestration | `test-agent-orchestration.ts` | 4h |
| 2 | Email Executor E2E | `test-email-executor.ts` | 4h |
| 3 | HITL Workflow E2E | `test-hitl-workflow.ts` | 4h |
| 4 | Full Chat Flow | `test-full-chat-flow.ts` | 6h |
| 5 | Multi-tenant Isolation | `test-multi-tenant.ts` | 4h |

### Phase 3: Load & Scale Testing (Week 3)
| Day | Scenario | Scripts | Expected Duration |
|-----|----------|---------|-------------------|
| 1 | 100 concurrent users | `load-test-concurrent.ts` | 4h |
| 2 | 10,000 email corpus | `load-test-corpus.ts` | 6h |
| 3 | 1,000 RAG queries/min | `load-test-rag.ts` | 4h |
| 4 | Cost optimization | `test-cost-tracking.ts` | 4h |
| 5 | Failure recovery | `test-circuit-breakers.ts` | 4h |

### Phase 4: Production Validation (Week 4)
| Day | Scenario | Scripts | Expected Duration |
|-----|----------|---------|-------------------|
| 1-2 | Shadow traffic (10%) | `shadow-traffic.ts` | 16h |
| 3-4 | A/B comparison | `ab-comparison.ts` | 16h |
| 5 | Metric aggregation | `generate-report.ts` | 4h |

---

## 4. SCORE AGGREGATION

### Final Score Calculation

```typescript
interface AIVerificationScore {
  // Quality Scores (40% weight)
  intentAccuracy: number;        // Target: >92%
  emailInsightsRougeL: number;   // Target: >0.45
  ragNDCG: number;               // Target: >0.85
  triageAccuracy: number;        // Target: >90%

  // Performance Scores (30% weight)
  ttftP95: number;               // Target: <600ms
  searchLatencyP95: number;      // Target: <800ms
  cacheHitRate: number;          // Target: >60%
  throughputRPS: number;         // Target: >50

  // Reliability Scores (20% weight)
  executorSuccessRate: number;   // Target: 100%
  circuitBreakerRecovery: number; // Target: <60s
  hitlAccuracy: number;          // Target: 100%

  // Cost Efficiency (10% weight)
  costPer1000Emails: number;     // Target: <$0.50
  embeddingCostSavings: number;  // Target: >50%

  // OVERALL SCORE
  overallScore: number;          // Target: >85/100
  industrialRank: 'BELOW' | 'AVERAGE' | 'ABOVE' | 'BEST_IN_CLASS';
}
```

### Industrial Ranking Thresholds

| Score Range | Rank | Description |
|-------------|------|-------------|
| 90-100 | BEST_IN_CLASS | Superhuman-level (top 5%) |
| 80-89 | ABOVE | Better than Gmail (top 20%) |
| 70-79 | AVERAGE | Industry standard |
| <70 | BELOW | Needs improvement |

---

## 5. TEST DATA REQUIREMENTS

### Minimum Data Sets

| Data Type | Quantity | Source | Notes |
|-----------|----------|--------|-------|
| Labeled emails | 500 | Manual annotation | Categories, sentiment, priority |
| Paraphrase pairs | 100 | Generated + verified | For semantic similarity |
| Intent samples | 500 EN + 500 IT | Manual annotation | All intent types |
| PII samples | 200 | Synthetic | Emails, SSNs, API keys |
| Injection attempts | 50 | Security corpus | Known attack patterns |
| Calendar events | 200 | Real + synthetic | With conflicts |
| Contact relationships | 100 | Real data | With interaction history |

### Data Preparation Scripts

```bash
# Generate test data sets
npx ts-node scripts/generate-test-data.ts

# Import labeled data
npx ts-node scripts/import-labeled-emails.ts data/labeled-emails.json

# Create synthetic PII data
npx ts-node scripts/generate-pii-samples.ts
```

---

## 6. EXECUTION COMMANDS

### Run All Tests

```bash
# Full verification suite
npx ts-node scripts/run-ai-verification.ts --all

# Component-specific
npx ts-node scripts/run-ai-verification.ts --component intent
npx ts-node scripts/run-ai-verification.ts --component embedding
npx ts-node scripts/run-ai-verification.ts --component rag
npx ts-node scripts/run-ai-verification.ts --component triage

# Load tests
npx ts-node scripts/run-ai-verification.ts --load --concurrent 100

# Generate report
npx ts-node scripts/generate-ai-report.ts --output docs/reports/
```

### CI/CD Integration

```yaml
# .github/workflows/ai-verification.yml
name: AI Verification Suite
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6 AM
  workflow_dispatch:

jobs:
  ai-verification:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run AI Verification
        env:
          MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
        run: |
          npx ts-node scripts/run-ai-verification.ts --all
          npx ts-node scripts/generate-ai-report.ts
      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: ai-verification-report
          path: docs/reports/
```

---

## 7. SUCCESS CRITERIA

### Must Pass (Blocking)
- [ ] Intent classification accuracy >90%
- [ ] PII detection recall >95%
- [ ] Email executor success rate 100%
- [ ] TTFT P95 <1000ms
- [ ] Cache hit rate >50%

### Should Pass (Warning)
- [ ] RAG NDCG >0.80
- [ ] Triage accuracy >88%
- [ ] CRM relationship correlation >0.75
- [ ] Cost per 1000 emails <$0.75

### Nice to Have (Informational)
- [ ] Superhuman-level latency (<500ms P50)
- [ ] ROUGE-L >0.50
- [ ] Overall score >90

---

## 8. MONITORING DASHBOARD

### Key Metrics to Track

```typescript
// Prometheus metrics
ai_intent_classification_accuracy
ai_email_insights_latency_seconds{quantile="0.95"}
ai_rag_retrieval_ndcg
ai_triage_accuracy
ai_embedding_cache_hit_ratio
ai_executor_success_total
ai_cost_per_1000_emails
ai_overall_score
```

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Intent accuracy | <88% | <80% |
| TTFT P95 | >800ms | >1500ms |
| Cache hit rate | <50% | <30% |
| Executor success | <99% | <95% |
| Cost per 1K | >$0.75 | >$1.00 |

---

## Appendix: Industrial Benchmark Sources

1. **Superhuman** - https://superhuman.com/blog/engineering
2. **Gmail AI** - Google AI Blog publications
3. **Microsoft Viva** - Microsoft Research papers
4. **Spark Email** - Public benchmarks
5. **SWE-Bench** - AI coding benchmarks (reference for LLM quality)
6. **MTEB** - Massive Text Embedding Benchmark

---

*Document generated: 2026-01-30*
*Next review: After Phase 1 completion*
