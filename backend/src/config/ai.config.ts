import { registerAs } from '@nestjs/config';

/**
 * AI Configuration for PMSync
 *
 * Centralizes all AI-related configuration to avoid hardcoded values
 * throughout the codebase. All values can be overridden via environment
 * variables.
 *
 * Usage:
 *   import { ConfigService } from '@nestjs/config';
 *   const model = this.configService.get<string>('ai.mistral.defaultModel');
 */
export default registerAs('ai', () => ({
  // ===========================================
  // Model Configuration
  // ===========================================
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    defaultModel: process.env.AI_DEFAULT_MODEL || 'mistral-small-latest',
    routerModel: process.env.AI_ROUTER_MODEL || 'mistral-small-latest',
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'mistral-embed',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048', 10),
  },

  // ===========================================
  // Model Tiers (cost optimization)
  // ===========================================
  models: {
    /** Simple tasks: classification, labeling */
    simple: process.env.AI_MODEL_SIMPLE || 'mistral-small-latest',
    /** Medium tasks: extraction, smart replies, summaries */
    medium: process.env.AI_MODEL_MEDIUM || 'mistral-small-latest',
    /** Complex tasks: composition, complex reasoning */
    complex: process.env.AI_MODEL_COMPLEX || 'mistral-medium-latest',
  },

  // ===========================================
  // Memory Configuration
  // ===========================================
  memory: {
    /** Maximum messages in conversation history */
    maxHistoryLength: parseInt(process.env.AI_MAX_HISTORY || '50', 10),
    /** Session TTL in seconds (default 1 hour) */
    sessionTTLSeconds: parseInt(process.env.AI_SESSION_TTL || '3600', 10),
    /** Number of messages to trim when history exceeds max */
    fifoTrimSize: parseInt(process.env.AI_FIFO_TRIM || '10', 10),
  },

  // ===========================================
  // HITL (Human-in-the-Loop) Configuration
  // ===========================================
  hitl: {
    /** Default auto-approve threshold (0.0 - 1.0) */
    defaultAutoApproveThreshold: parseFloat(process.env.AI_AUTO_APPROVE_THRESHOLD || '0.9'),
    /** Hours until pending action expires */
    actionExpirationHours: parseInt(process.env.AI_ACTION_EXPIRATION || '24', 10),
    /** Maximum pending actions per user */
    maxPendingActionsPerUser: parseInt(process.env.AI_MAX_PENDING_ACTIONS || '50', 10),
  },

  // ===========================================
  // Learning Configuration
  // ===========================================
  learning: {
    /** Minimum feedback samples before adjusting confidence */
    minSamplesForAdjustment: parseInt(process.env.AI_MIN_LEARNING_SAMPLES || '5', 10),
    /** Maximum confidence boost from positive feedback */
    confidenceBoostMax: parseFloat(process.env.AI_CONFIDENCE_BOOST_MAX || '0.15'),
    /** Maximum confidence penalty from negative feedback */
    confidencePenaltyMax: parseFloat(process.env.AI_CONFIDENCE_PENALTY_MAX || '0.2'),
    /** Decay factor for old feedback (0.0 - 1.0) */
    learningDecayFactor: parseFloat(process.env.AI_LEARNING_DECAY || '0.95'),
  },

  // ===========================================
  // Rate Limiting
  // ===========================================
  rateLimit: {
    /** Requests per minute per user */
    requestsPerMinute: parseInt(process.env.AI_RATE_LIMIT_RPM || '30', 10),
    /** Requests per day per user */
    requestsPerDay: parseInt(process.env.AI_RATE_LIMIT_RPD || '1000', 10),
    /** Maximum concurrent AI requests */
    concurrentRequests: parseInt(process.env.AI_CONCURRENT_LIMIT || '3', 10),
  },

  // ===========================================
  // Feature Flags
  // ===========================================
  features: {
    smartRepliesEnabled: process.env.AI_SMART_REPLIES !== 'false',
    summarizationEnabled: process.env.AI_SUMMARIZATION !== 'false',
    schedulingEnabled: process.env.AI_SCHEDULING !== 'false',
    contactDedupeEnabled: process.env.AI_CONTACT_DEDUPE !== 'false',
    proactiveInsightsEnabled: process.env.AI_PROACTIVE === 'true', // Off by default
  },

  // ===========================================
  // Email Agent Configuration
  // ===========================================
  emailAgent: {
    /** Maximum smart reply suggestions */
    maxSmartReplies: parseInt(process.env.AI_MAX_SMART_REPLIES || '3', 10),
    /** Maximum summary length in characters */
    summaryMaxLength: parseInt(process.env.AI_SUMMARY_MAX_LENGTH || '500', 10),
    /** Default tone for smart replies */
    defaultTone: process.env.AI_DEFAULT_TONE || 'formal',
  },

  // ===========================================
  // Calendar Agent Configuration
  // ===========================================
  calendarAgent: {
    /** Maximum suggested time slots */
    maxSuggestedSlots: parseInt(process.env.AI_MAX_CALENDAR_SLOTS || '5', 10),
    /** Business hours start (24h format) */
    businessHoursStart: parseInt(process.env.AI_BUSINESS_START || '9', 10),
    /** Business hours end (24h format) */
    businessHoursEnd: parseInt(process.env.AI_BUSINESS_END || '17', 10),
    /** Default meeting duration in minutes */
    defaultMeetingDuration: parseInt(process.env.AI_DEFAULT_MEETING_DURATION || '60', 10),
  },

  // ===========================================
  // Contacts Agent Configuration
  // ===========================================
  contactsAgent: {
    /** Similarity threshold for duplicate detection (0.0 - 1.0) */
    dedupeThreshold: parseFloat(process.env.AI_DEDUPE_THRESHOLD || '0.7'),
    /** Maximum merge suggestions to return */
    maxMergeSuggestions: parseInt(process.env.AI_MAX_MERGE_SUGGESTIONS || '10', 10),
  },

  // ===========================================
  // Embedding Configuration
  // ===========================================
  embeddings: {
    /** Maximum characters per embedding chunk */
    maxCharsPerChunk: parseInt(process.env.AI_MAX_CHARS_PER_CHUNK || '12000', 10),
    /** Maximum embedding dimension (Mistral default: 1024) */
    maxDimension: parseInt(process.env.AI_MAX_EMBEDDING_DIM || '4096', 10),
    /** Cache TTL for query embeddings in seconds */
    queryCacheTTL: parseInt(process.env.AI_QUERY_CACHE_TTL || '3600', 10),
  },
}));
