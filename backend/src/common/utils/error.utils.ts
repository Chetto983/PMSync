/**
 * Common error utility functions
 *
 * Provides consistent error message extraction across the application.
 * Used to reduce code duplication (DUP-2) identified in audit.
 */

/**
 * Extract error message from an unknown error type.
 * Safely handles Error objects, strings, and other types.
 *
 * @param error - The caught error, can be any type
 * @returns A string message from the error
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   logger.error(`Operation failed: ${getErrorMessage(error)}`);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}

/**
 * Extract full error details including message and stack (if available).
 * Useful for detailed logging.
 *
 * @param error - The caught error, can be any type
 * @returns Object with message and optional stack
 */
export function getErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
        };
    }
    return {
        message: getErrorMessage(error),
    };
}

// ============================================
// HTTP Error Classification Functions
// CONSOLIDATED from:
// - base-email-sync.service.ts (deleted - was dead code)
// - email-embedding.queue.ts (updated import)
// - provider-error.interceptor.ts (updated import)
// Phase 4 consolidation (2025-01-05)
// ============================================

/**
 * Extract HTTP status code from an error object.
 * Checks multiple common locations where status codes are stored.
 */
function getStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;

    const err = error as Record<string, unknown>;
    const response = err.response as Record<string, unknown> | undefined;

    const possibleStatus =
        err.status ??
        err.statusCode ??
        response?.status ??
        response?.statusCode;

    return typeof possibleStatus === 'number' ? possibleStatus : undefined;
}

/**
 * Check if an error is a rate limit error (HTTP 429).
 *
 * Checks:
 * - HTTP status code 429 (from various locations)
 * - Error message containing 'rate limit', '429', 'too many requests'
 * - Error code 'rate_limit_exceeded'
 *
 * @param error - The error to check
 * @returns True if the error indicates rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
    if (!error) return false;

    // Check status code
    const status = getStatusCode(error);
    if (status === 429) return true;

    // Check error code property
    const errorObj = error as Record<string, unknown>;
    if (errorObj.code === 'rate_limit_exceeded') return true;

    // Check error message (Error instance or plain object with message)
    const message = error instanceof Error
        ? error.message
        : typeof errorObj.message === 'string'
          ? errorObj.message
          : null;

    if (message) {
        const msg = message.toLowerCase();
        return (
            msg.includes('429') ||
            msg.includes('rate limit') ||
            msg.includes('too many requests')
        );
    }

    return false;
}

/**
 * Check if an error is a "not found" error (HTTP 404/410).
 *
 * Checks:
 * - HTTP status code 404 or 410
 * - Error message containing 'not found', '404', 'does not exist', 'deleted'
 *
 * @param error - The error to check
 * @returns True if the error indicates a resource was not found
 */
export function isNotFoundError(error: unknown): boolean {
    if (!error) return false;

    // Check status code
    const status = getStatusCode(error);
    if (status === 404 || status === 410) return true;

    // Check error message
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return (
            msg.includes('not found') ||
            msg.includes('404') ||
            msg.includes('does not exist') ||
            msg.includes('deleted')
        );
    }

    return false;
}

/**
 * Check if an error is a server error (HTTP 5xx).
 *
 * @param error - The error to check
 * @returns True if the error is a server error (500-599)
 */
export function isServerError(error: unknown): boolean {
    const status = getStatusCode(error);
    return typeof status === 'number' && status >= 500 && status < 600;
}

/**
 * Check if an error is a client error (HTTP 4xx).
 *
 * @param error - The error to check
 * @returns True if the error is a client error (400-499)
 */
export function isClientError(error: unknown): boolean {
    const status = getStatusCode(error);
    return typeof status === 'number' && status >= 400 && status < 500;
}
