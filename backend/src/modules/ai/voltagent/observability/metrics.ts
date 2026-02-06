/**
 * AI Prometheus Metrics Definitions
 *
 * Provides Prometheus metric providers for AI operations observability.
 * Uses @willsoto/nestjs-prometheus for NestJS integration.
 *
 * Metrics exposed:
 * - ai_chat_response_duration_seconds: Chat response latency histogram
 * - ai_first_token_latency_seconds: Time to first streaming token
 * - ai_rag_query_duration_seconds: RAG retrieval latency histogram
 * - ai_tool_execution_duration_seconds: Tool execution latency histogram
 * - ai_requests_total: Total AI requests counter
 * - ai_errors_total: Total AI errors counter
 * - ai_tokens_total: Total tokens processed counter
 * - ai_active_conversations: Active conversations gauge
 *
 * @see VOLT-04 in AUDIT.md - Prometheus metrics exposure
 * @see https://github.com/willsoto/nestjs-prometheus
 */
import {
  makeHistogramProvider,
  makeCounterProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';

/**
 * Histogram bucket definitions for latency tracking.
 *
 * LATENCY_BUCKETS: General AI operations (50ms to 60s)
 * - Covers typical LLM response times including streaming
 * - Extended range for complex multi-tool operations
 *
 * RAG_BUCKETS: RAG-specific operations (10ms to 2.5s)
 * - Tighter range for database/vector queries
 * - Enables detection of slow retrieval bottlenecks
 *
 * FIRST_TOKEN_BUCKETS: Streaming latency (100ms to 5s)
 * - Measures time-to-first-token for user perception
 * - Critical for UX responsiveness metrics
 */
const LATENCY_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];
const RAG_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
const FIRST_TOKEN_BUCKETS = [0.1, 0.25, 0.5, 1, 2, 5];

/**
 * AI Metric Providers
 *
 * Each provider creates a Prometheus metric that can be injected
 * into services via @InjectMetric decorator.
 */
export const AI_METRICS = {
  /**
   * Chat response duration histogram
   *
   * Labels:
   * - agent: Agent type (Supervisor, Actions, Intelligence)
   * - model: LLM model used (mistral-medium, mistral-large, etc.)
   * - status: success | error
   * - intent: Detected intent (email_search, schedule, etc.)
   */
  chatDuration: makeHistogramProvider({
    name: 'ai_chat_response_duration_seconds',
    help: 'AI chat response duration from request to complete response',
    labelNames: ['agent', 'model', 'status', 'intent'],
    buckets: LATENCY_BUCKETS,
  }),

  /**
   * Time to first token histogram (streaming only)
   *
   * Labels:
   * - agent: Agent type
   * - model: LLM model used
   */
  firstTokenLatency: makeHistogramProvider({
    name: 'ai_first_token_latency_seconds',
    help: 'Time to first token in streaming response',
    labelNames: ['agent', 'model'],
    buckets: FIRST_TOKEN_BUCKETS,
  }),

  /**
   * RAG query duration histogram
   *
   * Labels:
   * - source: RAG source (emails, contacts, deadlines, followups, actions, memories)
   * - status: success | error
   */
  ragDuration: makeHistogramProvider({
    name: 'ai_rag_query_duration_seconds',
    help: 'RAG retrieval query duration',
    labelNames: ['source', 'status'],
    buckets: RAG_BUCKETS,
  }),

  /**
   * Tool execution duration histogram
   *
   * Labels:
   * - tool: Tool name (send_email, search_memory, etc.)
   * - status: success | error
   */
  toolDuration: makeHistogramProvider({
    name: 'ai_tool_execution_duration_seconds',
    help: 'Tool execution duration by tool name',
    labelNames: ['tool', 'status'],
    buckets: LATENCY_BUCKETS,
  }),

  /**
   * Total AI requests counter
   *
   * Labels:
   * - type: Request type (chat, stream, rag, tool)
   * - status: success | error
   */
  requestsTotal: makeCounterProvider({
    name: 'ai_requests_total',
    help: 'Total AI requests by type',
    labelNames: ['type', 'status'],
  }),

  /**
   * Total AI errors counter
   *
   * Labels:
   * - operation: Operation that failed (chat, rag, tool)
   * - error_type: Error classification (rate_limit, timeout, api_error, internal)
   */
  errorsTotal: makeCounterProvider({
    name: 'ai_errors_total',
    help: 'Total AI errors by type',
    labelNames: ['operation', 'error_type'],
  }),

  /**
   * Total tokens processed counter
   *
   * Labels:
   * - tenant: Tenant ID (for multi-tenant usage tracking)
   * - model: LLM model used
   * - type: prompt | completion
   */
  tokensTotal: makeCounterProvider({
    name: 'ai_tokens_total',
    help: 'Total tokens processed by tenant and model',
    labelNames: ['tenant', 'model', 'type'],
  }),

  /**
   * Active conversations gauge
   *
   * Labels:
   * - tenant: Tenant ID
   */
  activeConversations: makeGaugeProvider({
    name: 'ai_active_conversations',
    help: 'Number of active AI conversations',
    labelNames: ['tenant'],
  }),

  /**
   * Rate limit hits counter
   *
   * Labels:
   * - tenant: Tenant ID
   * - model: LLM model that hit rate limit
   */
  rateLimitHits: makeCounterProvider({
    name: 'ai_rate_limit_hits_total',
    help: 'Total rate limit hits by tenant',
    labelNames: ['tenant', 'model'],
  }),
};

/**
 * All metric providers as an array for NestJS module registration.
 *
 * Usage in module:
 * ```typescript
 * import { AI_METRICS_PROVIDERS } from './observability/metrics';
 *
 * @Module({
 *   providers: [...AI_METRICS_PROVIDERS],
 * })
 * ```
 */
export const AI_METRICS_PROVIDERS = Object.values(AI_METRICS);

/**
 * Metric names for @InjectMetric decorator.
 * Use these constants to avoid typos in injection.
 *
 * Usage:
 * ```typescript
 * import { AI_METRIC_NAMES } from './observability/metrics';
 *
 * @InjectMetric(AI_METRIC_NAMES.CHAT_DURATION)
 * private readonly chatDuration: Histogram<string>
 * ```
 */
export const AI_METRIC_NAMES = {
  CHAT_DURATION: 'ai_chat_response_duration_seconds',
  FIRST_TOKEN_LATENCY: 'ai_first_token_latency_seconds',
  RAG_DURATION: 'ai_rag_query_duration_seconds',
  TOOL_DURATION: 'ai_tool_execution_duration_seconds',
  REQUESTS_TOTAL: 'ai_requests_total',
  ERRORS_TOTAL: 'ai_errors_total',
  TOKENS_TOTAL: 'ai_tokens_total',
  ACTIVE_CONVERSATIONS: 'ai_active_conversations',
  RATE_LIMIT_HITS: 'ai_rate_limit_hits_total',
} as const;
