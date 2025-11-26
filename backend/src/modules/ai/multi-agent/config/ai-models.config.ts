/**
 * AI Model Configuration for Multi-Agent System
 *
 * All settings are configurable via .env file:
 *
 * # Default models
 * AI_MODEL_SIMPLE=mistral-small-latest        # For classification, labeling
 * AI_MODEL_MEDIUM=mistral-small-latest        # For extraction, smart replies
 * AI_MODEL_COMPLEX=mistral-medium-latest      # For composition, reasoning
 *
 * # Rate limits
 * AI_RATE_LIMIT_RPM=60                        # Requests per minute
 * AI_RATE_LIMIT_TPM=100000                    # Tokens per minute
 *
 * # Queue settings
 * AI_QUEUE_CONCURRENCY=5                      # Concurrent jobs
 * AI_QUEUE_RATE_LIMIT=10                      # Jobs per second
 */

export interface AIModelConfig {
  /** Model ID to use (reads from env if available) */
  model: string;
  /** Temperature setting (0-1, lower = more deterministic) */
  temperature: number;
  /** Maximum tokens in response */
  maxTokens: number;
  /** Description of when to use this model */
  description: string;
  /** Environment variable to override model */
  envKey?: string;
}

/**
 * Get model from environment or use default
 */
function getEnvModel(envKey: string, defaultModel: string): string {
  return process.env[envKey] || defaultModel;
}

/**
 * Model configurations by task type
 * All models can be overridden via environment variables
 */
export const AI_MODELS = {
  // =============================================================================
  // SIMPLE TASKS - Use AI_MODEL_SIMPLE (default: mistral-small-latest)
  // =============================================================================

  /** Intent classification - fast, cheap, simple */
  INTENT_CLASSIFICATION: {
    get model() { return getEnvModel('AI_MODEL_SIMPLE', 'mistral-small-latest'); },
    temperature: 0.1,  // Very low for consistent classification
    maxTokens: 256,    // Short JSON response
    description: 'Classify user intent into categories (EMAIL, CALENDAR, etc.)',
    envKey: 'AI_MODEL_SIMPLE',
  } as AIModelConfig,

  /** Email labeling/categorization */
  EMAIL_LABELING: {
    get model() { return getEnvModel('AI_MODEL_SIMPLE', 'mistral-small-latest'); },
    temperature: 0.1,
    maxTokens: 128,
    description: 'Label/categorize emails (important, spam, etc.)',
    envKey: 'AI_MODEL_SIMPLE',
  } as AIModelConfig,

  /** Email summarization (short summaries) */
  EMAIL_SUMMARY_SHORT: {
    get model() { return getEnvModel('AI_MODEL_SIMPLE', 'mistral-small-latest'); },
    temperature: 0.3,
    maxTokens: 256,
    description: 'Generate brief email summaries',
    envKey: 'AI_MODEL_SIMPLE',
  } as AIModelConfig,

  /** Contact extraction from text */
  CONTACT_EXTRACTION: {
    get model() { return getEnvModel('AI_MODEL_SIMPLE', 'mistral-small-latest'); },
    temperature: 0.1,
    maxTokens: 512,
    description: 'Extract contact info from text/email signatures',
    envKey: 'AI_MODEL_SIMPLE',
  } as AIModelConfig,

  /** Simple yes/no or boolean decisions */
  BOOLEAN_DECISION: {
    get model() { return getEnvModel('AI_MODEL_SIMPLE', 'mistral-small-latest'); },
    temperature: 0.0,
    maxTokens: 64,
    description: 'Make simple yes/no decisions',
    envKey: 'AI_MODEL_SIMPLE',
  } as AIModelConfig,

  // =============================================================================
  // MEDIUM TASKS - Use AI_MODEL_MEDIUM (default: mistral-small-latest)
  // =============================================================================

  /** Action parameter extraction */
  ACTION_EXTRACTION: {
    get model() { return getEnvModel('AI_MODEL_MEDIUM', 'mistral-small-latest'); },
    temperature: 0.2,
    maxTokens: 512,
    description: 'Extract action parameters from user requests',
    envKey: 'AI_MODEL_MEDIUM',
  } as AIModelConfig,

  /** Smart reply suggestions */
  SMART_REPLY: {
    get model() { return getEnvModel('AI_MODEL_MEDIUM', 'mistral-small-latest'); },
    temperature: 0.5,
    maxTokens: 512,
    description: 'Generate short reply suggestions',
    envKey: 'AI_MODEL_MEDIUM',
  } as AIModelConfig,

  /** Calendar event extraction */
  EVENT_EXTRACTION: {
    get model() { return getEnvModel('AI_MODEL_MEDIUM', 'mistral-small-latest'); },
    temperature: 0.2,
    maxTokens: 512,
    description: 'Extract event details from natural language',
    envKey: 'AI_MODEL_MEDIUM',
  } as AIModelConfig,

  // =============================================================================
  // COMPLEX TASKS - Use AI_MODEL_COMPLEX (default: mistral-medium-latest)
  // =============================================================================

  /** Full email composition */
  EMAIL_COMPOSITION: {
    get model() { return getEnvModel('AI_MODEL_COMPLEX', 'mistral-medium-latest'); },
    temperature: 0.7,
    maxTokens: 2048,
    description: 'Compose full email drafts',
    envKey: 'AI_MODEL_COMPLEX',
  } as AIModelConfig,

  /** Long-form email summarization */
  EMAIL_SUMMARY_LONG: {
    get model() { return getEnvModel('AI_MODEL_MEDIUM', 'mistral-small-latest'); },
    temperature: 0.4,
    maxTokens: 1024,
    description: 'Generate detailed email thread summaries',
    envKey: 'AI_MODEL_MEDIUM',
  } as AIModelConfig,

  /** General conversational responses */
  CONVERSATION: {
    get model() { return getEnvModel('AI_MODEL_MEDIUM', 'mistral-small-latest'); },
    temperature: 0.7,
    maxTokens: 1024,
    description: 'General chat responses',
    envKey: 'AI_MODEL_MEDIUM',
  } as AIModelConfig,

  /** Web search with context */
  WEB_SEARCH_RESPONSE: {
    get model() { return getEnvModel('AI_MODEL_MEDIUM', 'mistral-small-latest'); },
    temperature: 0.5,
    maxTokens: 1024,
    description: 'Process and respond with web search results',
    envKey: 'AI_MODEL_MEDIUM',
  } as AIModelConfig,

  /** Complex reasoning tasks */
  COMPLEX_REASONING: {
    get model() { return getEnvModel('AI_MODEL_COMPLEX', 'mistral-medium-latest'); },
    temperature: 0.4,
    maxTokens: 2048,
    description: 'Multi-step reasoning and complex analysis',
    envKey: 'AI_MODEL_COMPLEX',
  } as AIModelConfig,
};

/**
 * Default model to use if task type not specified
 */
export const DEFAULT_MODEL = AI_MODELS.CONVERSATION;

/**
 * Get model config for a specific task
 */
export function getModelConfig(taskType: keyof typeof AI_MODELS): AIModelConfig {
  return AI_MODELS[taskType] || DEFAULT_MODEL;
}

/**
 * Rate limit configuration - reads from environment
 * Set in .env:
 *   AI_RATE_LIMIT_RPM=60      # Requests per minute
 *   AI_RATE_LIMIT_TPM=100000  # Tokens per minute
 */
export function getRateLimits() {
  return {
    requestsPerMinute: parseInt(process.env.AI_RATE_LIMIT_RPM || '60', 10),
    tokensPerMinute: parseInt(process.env.AI_RATE_LIMIT_TPM || '100000', 10),
  };
}

/**
 * Queue configuration - reads from environment
 * Set in .env:
 *   AI_QUEUE_CONCURRENCY=5    # Max concurrent jobs
 *   AI_QUEUE_RATE_LIMIT=10    # Jobs per second
 */
export function getQueueConfig() {
  return {
    concurrency: parseInt(process.env.AI_QUEUE_CONCURRENCY || '5', 10),
    rateLimit: parseInt(process.env.AI_QUEUE_RATE_LIMIT || '10', 10),
  };
}

/**
 * Get default model from environment
 */
export function getDefaultModel() {
  return process.env.AI_DEFAULT_MODEL || 'mistral-small-latest';
}
