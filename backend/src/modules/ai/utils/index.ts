/**
 * AI Module Utilities
 * 
 * Re-exports resilience utilities for shared use.
 */

// Re-export core utilities from calendar module (shared location)
export {
    CircuitBreaker,
    CircuitBreakerOpenError,
    CircuitState,
    circuitBreakerRegistry,
    type CircuitBreakerConfig,
    type CircuitBreakerStats,
} from '../../calendar/utils/circuit-breaker';

export {
    withRetry,
    makeRetryable,
    Retryable,
    RateLimiter,
    type RetryOptions,
} from '../../calendar/utils/retry';

import { circuitBreakerRegistry, type CircuitBreakerConfig } from '../../calendar/utils/circuit-breaker';
import { RateLimiter } from '../../calendar/utils/retry';

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
 * Mistral Embedding API limit: typically 5-10 concurrent requests depending on tier
 */
export const embeddingRateLimiter = new RateLimiter(
    10, // 10 requests
    1000, // per 1 second (burst protection)
);
