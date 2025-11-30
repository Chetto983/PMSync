/**
 * VoltAgent Observability Export
 *
 * Exports observability hooks and utilities.
 *
 * VoltOps Production Setup:
 * Set these environment variables for automatic cloud telemetry:
 * - VOLTAGENT_PUBLIC_KEY=pk_your_key
 * - VOLTAGENT_SECRET_KEY=sk_your_key
 *
 * @see https://voltagent.dev/docs/observability/developer-console/
 */

export {
  createObservabilityHooks,
  createProductionHooks,
  type ObservabilityOptions,
  type AgentMetrics,
} from './hooks';
