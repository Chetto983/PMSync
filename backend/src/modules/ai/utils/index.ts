/**
 * AI Module Utilities
 * 
 * Re-exports resilience utilities for shared use.
 */

// Re-export core utilities from common/utils (consolidated location)
export {
    CircuitBreaker,
    CircuitBreakerOpenError,
    CircuitState,
    circuitBreakerRegistry,
    type CircuitBreakerConfig,
    type CircuitBreakerStats,
} from '../../../common/utils/circuit-breaker.utils';

export {
    withRetry,
    makeRetryable,
    Retryable,
    RateLimiter,
    type RetryOptions,
} from '../../../common/utils/retry.utils';

import { circuitBreakerRegistry, type CircuitBreakerConfig } from '../../../common/utils/circuit-breaker.utils';
import { RateLimiter } from '../../../common/utils/retry.utils';

/**
 * Default circuit breaker config for AI operations
 */
const aiCircuitBreakerConfig: Partial<CircuitBreakerConfig> = {
    failureThreshold: 3, // Lower threshold for AI as failures are often expensive/slow
    resetTimeoutMs: 60000,
    successThreshold: 2,
    failureWindowMs: 120000,
};

/**
 * Get or create a circuit breaker for AI provider operations
 */
export function getAiCircuitBreaker(
    provider: 'mistral' | 'openai' | 'anthropic',
    operation: string = 'default',
) {
    const name = `ai-${provider}-${operation}`;
    return circuitBreakerRegistry.get(name, {
        name,
        ...aiCircuitBreakerConfig,
    });
}

/**
 * Rate limiter for embedding generation
 * Mistral Embedding API limit: 12 req/sec (updated 2026-01-28)
 */
export const embeddingRateLimiter = new RateLimiter(
    12, // 12 requests (matches Mistral tier limit)
    1000, // per 1 second (burst protection)
);
