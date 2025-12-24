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
