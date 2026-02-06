/**
 * VoltAgent Observability Export
 *
 * Exports observability hooks, Prometheus metrics, and utilities.
 *
 * VoltOps Production Setup:
 * Set these environment variables for automatic cloud telemetry:
 * - VOLTAGENT_PUBLIC_KEY=pk_your_key
 * - VOLTAGENT_SECRET_KEY=sk_your_key
 *
 * @see https://voltagent.dev/docs/observability/developer-console/
 */

// Agent execution hooks
export {
  createObservabilityHooks,
  createProductionHooks,
  type ObservabilityOptions,
  type AgentMetrics,
  type HitlPendingAction,
  type DisposableHooks,
  type ToolMetrics,
} from './hooks';

// HITL (Human-in-the-Loop) observability
export {
  createHitlObservability,
  type HitlMetrics,
  type HitlObservabilityOptions,
} from './hooks';

// Learning/Feedback observability
export {
  createLearningObservability,
  createLearningHooks,
  calculateConfidenceBoost,
  updateLearningProfile,
  getAdjustedConfidence,
  LEARNING_CONFIG,
  type ActionFeedback,
  type LearningProfile,
  type LearningMetrics,
  type LearningObservabilityOptions,
} from './learning';

// Prometheus metrics (VOLT-04: Prometheus metrics exposure)
export {
  AI_METRICS,
  AI_METRICS_PROVIDERS,
  AI_METRIC_NAMES,
} from './metrics';
