import { registerAs } from '@nestjs/config';

/**
 * AI Configuration for PMSync
 *
 * ONLY contains values that are actually consumed by services.
 * Dead code was removed in audit (2026-01-28).
 *
 * Rate limiting: See rate-limiter.service.ts (reads AI_RATE_LIMIT_* directly)
 * Concurrent limit: MistralService reads AI_CONCURRENT_LIMIT directly
 */
export default registerAs('ai', () => ({
  // ===========================================
  // Model Configuration
  // ===========================================
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'mistral-embed',
  },

  // ===========================================
  // Model Tiers (cost optimization)
  // Used by: mistral.provider.ts
  // ===========================================
  models: {
    /** Simple tasks: classification, labeling, search ($0.1/M) */
    simple: process.env.AI_MODEL_SIMPLE || 'mistral-small-latest',
    /** Medium tasks: supervisor delegation, multi-step (~$0.4/M) */
    medium: process.env.AI_MODEL_MEDIUM || 'mistral-medium-latest',
    /** Complex tasks: code generation, analytics (~$2.7/M) */
    complex: process.env.AI_MODEL_COMPLEX || 'devstral-latest',
    /** Creative tasks: email composition, smart replies ($0.1/M) */
    creative: process.env.AI_MODEL_CREATIVE || 'mistral-small-latest',
  },

  // ===========================================
  // HITL (Human-in-the-Loop) Configuration
  // Used by: hitl.service.ts, voltagent.service.ts
  // ===========================================
  hitl: {
    /** Default auto-approve threshold when user doesn't specify (0.0-1.0) */
    defaultAutoApproveThreshold: parseFloat(process.env.AI_AUTO_APPROVE_THRESHOLD || '0.9'),
    /** Hours until pending action expires (default 24h) */
    actionExpirationHours: parseInt(process.env.AI_ACTION_EXPIRATION || '24', 10),
    /** Maximum pending actions per user (enforced in hitl.service.ts) */
    maxPendingActionsPerUser: parseInt(process.env.AI_MAX_PENDING_ACTIONS || '50', 10),
  },

  // ===========================================
  // Feature Flags (USED)
  // Used by: embedding queues
  // ===========================================
  features: {
    /** Master kill switch - disables ALL AI operations */
    aiEnabled: process.env.DISABLE_AI !== 'true',
    /** Disable only embeddings */
    embeddingsEnabled: process.env.DISABLE_EMBEDDINGS !== 'true',
  },

  // ===========================================
  // Batch API Configuration
  // Used by: batch-indexing.service.ts, email-triage.service.ts
  // ===========================================
  batch: {
    /** Master switch for batch API operations */
    enabled: process.env.MISTRAL_BATCH_ENABLED !== 'false',
    /** Minimum emails to trigger batch embedding (vs real-time) */
    embeddingMinSize: parseInt(process.env.MISTRAL_BATCH_EMBEDDING_MIN_SIZE || '100', 10),
    /** Minimum emails to trigger batch triage (vs real-time) */
    triageMinSize: parseInt(process.env.MISTRAL_BATCH_TRIAGE_MIN_SIZE || '10', 10),
  },
}));
