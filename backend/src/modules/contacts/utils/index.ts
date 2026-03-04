/**
 * Contacts Module Utilities
 *
 * Re-exports resilience utilities from common/utils for shared use.
 * Provides contacts-specific circuit breaker and retry configurations.
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
 * Default circuit breaker config for contacts operations
 */
const contactsCircuitBreakerConfig: Partial<CircuitBreakerConfig> = {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
    failureWindowMs: 60000,
};

/**
 * Get or create a circuit breaker for contacts provider operations
 */
export function getContactsCircuitBreaker(
    provider: 'google' | 'microsoft',
    operation: string = 'default',
) {
    const name = `contacts-${provider}-${operation}`;
    return circuitBreakerRegistry.get(name, {
        name,
        ...contactsCircuitBreakerConfig,
    });
}

/**
 * Provider-specific rate limiters for contacts APIs
 */
export const googleContactsRateLimiter = new RateLimiter(
    100, // 100 requests per 100 seconds (Google People API quota)
    100000,
);

export const microsoftContactsRateLimiter = new RateLimiter(
    60, // 60 requests per minute (conservative for Microsoft Graph)
    60000,
);
