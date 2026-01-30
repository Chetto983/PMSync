/**
 * AI Verification Metrics Type Definitions
 *
 * Shared types for all AI verification tests.
 */

// ============================================================================
// QUALITY METRICS
// ============================================================================

export interface ClassificationMetrics {
  accuracy: number;           // (TP+TN)/(TP+TN+FP+FN)
  precision: number;          // TP/(TP+FP)
  recall: number;             // TP/(TP+FN)
  f1Score: number;            // 2*(P*R)/(P+R)
  confusionMatrix: number[][]; // [actual][predicted]
  perClassPrecision: Record<string, number>;
  perClassRecall: Record<string, number>;
}

export interface RetrievalMetrics {
  ndcgAt10: number;           // Normalized DCG at k=10
  mrr: number;                // Mean Reciprocal Rank
  mapAt10: number;            // Mean Average Precision at k=10
  recallAt10: number;         // Recall at k=10
  precisionAt10: number;      // Precision at k=10
}

export interface GenerationMetrics {
  bleuScore: number;          // n-gram overlap
  rougeL: number;             // LCS-based F1
  bertScore: number;          // Semantic similarity
  humanRating: number;        // 1-5 scale
}

// ============================================================================
// TIME METRICS
// ============================================================================

export interface LatencyMetrics {
  p50: number;                // Median
  p75: number;                // 75th percentile
  p90: number;                // 90th percentile
  p95: number;                // 95th percentile
  p99: number;                // 99th percentile
  mean: number;               // Average
  min: number;                // Minimum
  max: number;                // Maximum
  count: number;              // Sample count
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  tokensPerSecond: number;
  itemsPerSecond: number;
  bytesPerSecond: number;
}

export interface TTFTMetrics {
  ttftP50: number;            // Time to First Token - median
  ttftP95: number;            // Time to First Token - 95th
  ttftP99: number;            // Time to First Token - 99th
  streamLatency: number;      // Time between tokens
}

// ============================================================================
// COST METRICS
// ============================================================================

export interface CostMetrics {
  costPer1000Emails: number;
  costPer1000Queries: number;
  embeddingCostPerMillion: number;
  llmCostPerMillion: number;
  totalCost: number;
  cacheHitSavings: number;
  projectedMonthlyCost: number;
}

// ============================================================================
// COMPONENT-SPECIFIC METRICS
// ============================================================================

export interface IntentClassificationResult {
  classification: ClassificationMetrics;
  latency: LatencyMetrics;
  bilingualAccuracy: {
    en: number;
    it: number;
    mixed: number;
  };
  typoRobustness: number;     // Accuracy drop with typos
}

export interface EmbeddingServiceResult {
  cacheHitRate: number;
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  cost: CostMetrics;
  qualityCosine: number;      // Semantic quality
  circuitBreakerEvents: number;
}

export interface RAGRetrievalResult {
  emailRetrieval: RetrievalMetrics;
  contactRetrieval: RetrievalMetrics;
  crossSourceFusion: RetrievalMetrics;
  memoryFirstRate: number;    // % of times memory is in top 3
  latency: LatencyMetrics;
  corpusSize: number;
}

export interface EmailInsightsResult {
  summary: GenerationMetrics;
  sentiment: ClassificationMetrics;
  priority: RetrievalMetrics;
  smartReply: GenerationMetrics;
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  cost: CostMetrics;
}

export interface EmailTriageResult {
  categoryAccuracy: number;
  junkPrecision: number;
  urgentRecall: number;
  batchMetrics: {
    avgBatchSize: number;
    maxBatchSize: number;
    duplicatesFound: number;
  };
  costProtection: {
    batchLimitRespected: boolean;
    timeWindowRespected: boolean;
    junkSkipped: number;
  };
  latency: LatencyMetrics;
  cost: CostMetrics;
}

export interface AgentOrchestrationResult {
  routingAccuracy: number;
  toolSelectionPrecision: number;
  multiStepCompletion: number;
  contextPreservation: number;
  concurrentCapacity: number;
  ttft: TTFTMetrics;
  latency: LatencyMetrics;
  tokenUsage: {
    avgInputTokens: number;
    avgOutputTokens: number;
    avgTotalTokens: number;
  };
}

export interface HITLWorkflowResult {
  approvalRouting: number;
  timeoutHandling: number;
  rejectionLogging: number;
  escalationAccuracy: number;
  auditTrailCompleteness: number;
  latency: LatencyMetrics;
}

export interface SecurityGuardsResult {
  pii: {
    emailRecall: number;
    ssnRecall: number;
    apiKeyRecall: number;
    phoneRecall: number;
    falsePositiveRate: number;
  };
  promptInjection: {
    blockRate: number;
    falsePositiveRate: number;
  };
  latency: LatencyMetrics;
}

// ============================================================================
// INDUSTRIAL BENCHMARKS
// ============================================================================

export const INDUSTRIAL_BENCHMARKS = {
  // Accuracy benchmarks
  intentAccuracy: { superhuman: 0.95, gmail: 0.92, outlook: 0.88, target: 0.92 },
  triageAccuracy: { superhuman: 0.95, gmail: 0.92, outlook: 0.88, target: 0.90 },
  sentimentAccuracy: { bestInClass: 0.90, average: 0.85, target: 0.88 },

  // Retrieval benchmarks
  ragNDCG: { superhuman: 0.92, gmail: 0.85, outlook: 0.78, target: 0.85 },
  contactMRR: { bestInClass: 0.85, average: 0.75, target: 0.80 },

  // Latency benchmarks (ms)
  ttftP95: { superhuman: 300, gmail: 800, outlook: 1200, target: 600 },
  searchP95: { superhuman: 500, gmail: 1000, outlook: 1500, target: 800 },
  intentP99: { bestInClass: 0.5, average: 2.0, target: 1.0 },

  // Cache benchmarks
  cacheHitRate: { optimal: 0.70, good: 0.60, minimum: 0.50, target: 0.60 },

  // Cost benchmarks ($/1K)
  costPer1KEmails: { optimal: 0.30, good: 0.50, acceptable: 1.00, target: 0.50 },
  costPer1KQueries: { optimal: 0.05, good: 0.10, acceptable: 0.20, target: 0.10 },

  // Generation benchmarks
  summaryRougeL: { stateOfArt: 0.52, good: 0.45, acceptable: 0.40, target: 0.45 },
  smartReplyBLEU: { stateOfArt: 0.50, good: 0.40, acceptable: 0.35, target: 0.40 },
} as const;

// ============================================================================
// SCORE THRESHOLDS
// ============================================================================

export const SCORE_THRESHOLDS = {
  BEST_IN_CLASS: 90,
  ABOVE_AVERAGE: 80,
  AVERAGE: 70,
  BELOW_AVERAGE: 60,
  CRITICAL: 50,
} as const;

export type IndustrialRank = 'BEST_IN_CLASS' | 'ABOVE' | 'AVERAGE' | 'BELOW';

export function getIndustrialRank(score: number): IndustrialRank {
  if (score >= SCORE_THRESHOLDS.BEST_IN_CLASS) return 'BEST_IN_CLASS';
  if (score >= SCORE_THRESHOLDS.ABOVE_AVERAGE) return 'ABOVE';
  if (score >= SCORE_THRESHOLDS.AVERAGE) return 'AVERAGE';
  return 'BELOW';
}
