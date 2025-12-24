/**
 * Circuit Breaker for External APIs
 *
 * Industrial-grade resilience pattern that prevents cascade failures
 * when external APIs (Google Calendar, Microsoft Graph) are unavailable.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit is broken, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

import { Logger } from '@nestjs/common';
import { getErrorMessage } from '../../../common/utils';

export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
    /** Name for logging */
    name: string;
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery */
    resetTimeoutMs: number;
    /** Number of successful calls in HALF_OPEN to close circuit */
    successThreshold: number;
    /** Time window in ms to count failures */
    failureWindowMs: number;
}

export interface CircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureAt?: Date;
    lastSuccessAt?: Date;
    lastStateChangeAt: Date;
    totalRequests: number;
    totalFailures: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    name: 'default',
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 3,
    failureWindowMs: 60000,
};

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
    private readonly logger: Logger;
    private state: CircuitState = CircuitState.CLOSED;
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureAt?: Date;
    private lastSuccessAt?: Date;
    private lastStateChangeAt: Date = new Date();
    private totalRequests: number = 0;
    private totalFailures: number = 0;
    private failureTimestamps: number[] = [];
    private readonly config: CircuitBreakerConfig;

    constructor(config?: Partial<CircuitBreakerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger(`CircuitBreaker:${this.config.name}`);
    }

    /**
     * Execute a function through the circuit breaker
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        this.totalRequests++;

        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            if (this.shouldAttemptReset()) {
                this.transitionTo(CircuitState.HALF_OPEN);
            } else {
                throw new CircuitBreakerOpenError(
                    `Circuit breaker ${this.config.name} is OPEN`,
                    this.getStats(),
                );
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            throw error;
        }
    }

    /**
     * Check if the circuit breaker allows the request
     */
    isAllowed(): boolean {
        if (this.state === CircuitState.CLOSED) {
            return true;
        }
        if (this.state === CircuitState.OPEN) {
            return this.shouldAttemptReset();
        }
        // HALF_OPEN allows limited requests
        return true;
    }

    /**
     * Get current statistics
     */
    getStats(): CircuitBreakerStats {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureAt: this.lastFailureAt,
            lastSuccessAt: this.lastSuccessAt,
            lastStateChangeAt: this.lastStateChangeAt,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
        };
    }

    /**
     * Force reset the circuit breaker
     */
    reset(): void {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        this.logger.log('Circuit breaker manually reset');
    }

    private onSuccess(): void {
        this.lastSuccessAt = new Date();
        this.successes++;

        if (this.state === CircuitState.HALF_OPEN) {
            if (this.successes >= this.config.successThreshold) {
                this.transitionTo(CircuitState.CLOSED);
                this.failures = 0;
                this.failureTimestamps = [];
            }
        } else if (this.state === CircuitState.CLOSED) {
            // Reset failure count on success in closed state
            this.failures = 0;
        }
    }

    private onFailure(error: unknown): void {
        this.lastFailureAt = new Date();
        this.totalFailures++;
        this.failures++;

        const now = Date.now();
        this.failureTimestamps.push(now);

        // Remove old failures outside the window
        const windowStart = now - this.config.failureWindowMs;
        this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > windowStart);

        this.logger.warn(
            `Circuit breaker ${this.config.name} failure (${this.failureTimestamps.length}/${this.config.failureThreshold}): ${getErrorMessage(error)}`,
        );

        if (this.state === CircuitState.HALF_OPEN) {
            // Any failure in half-open state opens the circuit
            this.transitionTo(CircuitState.OPEN);
            this.successes = 0;
        } else if (this.state === CircuitState.CLOSED) {
            // Check if failures in window exceed threshold
            if (this.failureTimestamps.length >= this.config.failureThreshold) {
                this.transitionTo(CircuitState.OPEN);
                this.successes = 0;
            }
        }
    }

    private shouldAttemptReset(): boolean {
        if (!this.lastFailureAt) return true;
        const timeSinceLastFailure = Date.now() - this.lastFailureAt.getTime();
        return timeSinceLastFailure >= this.config.resetTimeoutMs;
    }

    private transitionTo(newState: CircuitState): void {
        if (this.state !== newState) {
            this.logger.log(`Circuit breaker ${this.config.name}: ${this.state} → ${newState}`);
            this.state = newState;
            this.lastStateChangeAt = new Date();
        }
    }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
    public readonly stats: CircuitBreakerStats;

    constructor(message: string, stats: CircuitBreakerStats) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
        this.stats = stats;
        Error.captureStackTrace?.(this, CircuitBreakerOpenError);
    }
}

/**
 * Global circuit breaker registry for API providers
 */
class CircuitBreakerRegistry {
    private readonly breakers = new Map<string, CircuitBreaker>();

    get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
        let breaker = this.breakers.get(name);
        if (!breaker) {
            breaker = new CircuitBreaker({ name, ...config });
            this.breakers.set(name, breaker);
        }
        return breaker;
    }

    getStats(): Record<string, CircuitBreakerStats> {
        const stats: Record<string, CircuitBreakerStats> = {};
        for (const [name, breaker] of this.breakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }

    resetAll(): void {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Get or create a circuit breaker for a provider
 */
export function getCircuitBreaker(
    provider: 'google' | 'microsoft' | 'mistral',
    operation: string = 'default',
): CircuitBreaker {
    const name = `${provider}-${operation}`;
    return circuitBreakerRegistry.get(name, {
        name,
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        successThreshold: 2,
        failureWindowMs: 60000,
    });
}
