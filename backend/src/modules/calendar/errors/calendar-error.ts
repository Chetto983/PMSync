/**
 * Calendar Error Types
 *
 * Industrial-grade error handling with structured error types,
 * proper error codes, and recovery hints.
 */

/**
 * Error codes for calendar operations
 */
export enum CalendarErrorCode {
    // Provider errors
    PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
    PROVIDER_NOT_SUPPORTED = 'PROVIDER_NOT_SUPPORTED',
    PROVIDER_AUTH_FAILED = 'PROVIDER_AUTH_FAILED',
    PROVIDER_TOKEN_EXPIRED = 'PROVIDER_TOKEN_EXPIRED',
    PROVIDER_TOKEN_REFRESH_FAILED = 'PROVIDER_TOKEN_REFRESH_FAILED',

    // Calendar errors
    CALENDAR_NOT_FOUND = 'CALENDAR_NOT_FOUND',
    CALENDAR_READ_ONLY = 'CALENDAR_READ_ONLY',
    CALENDAR_ACCESS_DENIED = 'CALENDAR_ACCESS_DENIED',

    // Event errors
    EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
    EVENT_CONFLICT = 'EVENT_CONFLICT',
    EVENT_VALIDATION_FAILED = 'EVENT_VALIDATION_FAILED',
    EVENT_CONCURRENT_MODIFICATION = 'EVENT_CONCURRENT_MODIFICATION',

    // API errors
    API_RATE_LIMITED = 'API_RATE_LIMITED',
    API_QUOTA_EXCEEDED = 'API_QUOTA_EXCEEDED',
    API_UNAVAILABLE = 'API_UNAVAILABLE',
    API_TIMEOUT = 'API_TIMEOUT',
    API_INVALID_RESPONSE = 'API_INVALID_RESPONSE',

    // Sync errors
    SYNC_TOKEN_EXPIRED = 'SYNC_TOKEN_EXPIRED',
    SYNC_FAILED = 'SYNC_FAILED',
    SYNC_IN_PROGRESS = 'SYNC_IN_PROGRESS',

    // Webhook errors
    WEBHOOK_VALIDATION_FAILED = 'WEBHOOK_VALIDATION_FAILED',
    WEBHOOK_SUBSCRIPTION_FAILED = 'WEBHOOK_SUBSCRIPTION_FAILED',

    // Generic errors
    OPERATION_FAILED = 'OPERATION_FAILED',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    TENANT_MISMATCH = 'TENANT_MISMATCH',
}

/**
 * Base calendar error with structured information
 */
export class CalendarError extends Error {
    public readonly code: CalendarErrorCode;
    public readonly provider?: 'google' | 'microsoft';
    public readonly httpStatus?: number;
    public readonly retryable: boolean;
    public readonly retryAfterMs?: number;
    public readonly cause?: Error;
    public readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        code: CalendarErrorCode,
        options?: {
            provider?: 'google' | 'microsoft';
            httpStatus?: number;
            retryable?: boolean;
            retryAfterMs?: number;
            cause?: Error;
            context?: Record<string, unknown>;
        },
    ) {
        super(message);
        this.name = 'CalendarError';
        this.code = code;
        this.provider = options?.provider;
        this.httpStatus = options?.httpStatus;
        this.retryable = options?.retryable ?? false;
        this.retryAfterMs = options?.retryAfterMs;
        this.cause = options?.cause;
        this.context = options?.context;

        // Maintains proper stack trace for where error was thrown
        Error.captureStackTrace?.(this, CalendarError);
    }

    /**
     * Convert to JSON for logging
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            provider: this.provider,
            httpStatus: this.httpStatus,
            retryable: this.retryable,
            retryAfterMs: this.retryAfterMs,
            context: this.context,
            stack: this.stack,
        };
    }

    /**
     * Create a rate limit error from API response
     */
    static rateLimited(
        provider: 'google' | 'microsoft',
        retryAfterMs = 60000,
    ): CalendarError {
        return new CalendarError(
            `${provider} API rate limit exceeded. Retry after ${retryAfterMs}ms`,
            CalendarErrorCode.API_RATE_LIMITED,
            {
                provider,
                httpStatus: 429,
                retryable: true,
                retryAfterMs,
            },
        );
    }

    /**
     * Create a concurrent modification error
     */
    static concurrentModification(
        eventId: string,
        expectedVersion: number,
        actualVersion: number,
    ): CalendarError {
        return new CalendarError(
            `Event ${eventId} was modified concurrently. Expected version ${expectedVersion}, got ${actualVersion}`,
            CalendarErrorCode.EVENT_CONCURRENT_MODIFICATION,
            {
                httpStatus: 409,
                retryable: true,
                context: { eventId, expectedVersion, actualVersion },
            },
        );
    }

    /**
     * Create from axios error
     */
    static fromAxiosError(
        error: unknown,
        provider: 'google' | 'microsoft',
        operation: string,
    ): CalendarError {
        const axiosError = error as {
            response?: {
                status?: number;
                headers?: Record<string, string>;
                data?: { error?: { message?: string } };
            };
            message?: string;
        };

        const status = axiosError.response?.status;
        const message = axiosError.response?.data?.error?.message || axiosError.message || 'Unknown error';

        // Rate limiting
        if (status === 429) {
            const retryAfter = axiosError.response?.headers?.['retry-after'];
            const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
            return CalendarError.rateLimited(provider, retryAfterMs);
        }

        // Quota exceeded
        if (status === 403 && message.toLowerCase().includes('quota')) {
            return new CalendarError(
                `${provider} API quota exceeded: ${message}`,
                CalendarErrorCode.API_QUOTA_EXCEEDED,
                { provider, httpStatus: 403, retryable: false },
            );
        }

        // Auth failures
        if (status === 401) {
            return new CalendarError(
                `${provider} authentication failed: ${message}`,
                CalendarErrorCode.PROVIDER_AUTH_FAILED,
                { provider, httpStatus: 401, retryable: true },
            );
        }

        // Not found
        if (status === 404) {
            return new CalendarError(
                `${provider} resource not found: ${message}`,
                CalendarErrorCode.EVENT_NOT_FOUND,
                { provider, httpStatus: 404, retryable: false },
            );
        }

        // Conflict
        if (status === 409) {
            return new CalendarError(
                `${provider} conflict: ${message}`,
                CalendarErrorCode.EVENT_CONFLICT,
                { provider, httpStatus: 409, retryable: true },
            );
        }

        // Sync token expired (Google returns 410 Gone)
        if (status === 410) {
            return new CalendarError(
                `${provider} sync token expired`,
                CalendarErrorCode.SYNC_TOKEN_EXPIRED,
                { provider, httpStatus: 410, retryable: true },
            );
        }

        // Server errors are retryable
        if (status && status >= 500) {
            return new CalendarError(
                `${provider} API error during ${operation}: ${message}`,
                CalendarErrorCode.API_UNAVAILABLE,
                {
                    provider,
                    httpStatus: status,
                    retryable: true,
                    retryAfterMs: 5000,
                },
            );
        }

        // Default error
        return new CalendarError(
            `${provider} ${operation} failed: ${message}`,
            CalendarErrorCode.OPERATION_FAILED,
            {
                provider,
                httpStatus: status,
                retryable: status ? status >= 500 : false,
            },
        );
    }
}

/**
 * Check if an error is a CalendarError
 */
export function isCalendarError(error: unknown): error is CalendarError {
    return error instanceof CalendarError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
    if (isCalendarError(error)) {
        return error.retryable;
    }

    // Check for network errors or timeouts
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('socket hang up')
    );
}
