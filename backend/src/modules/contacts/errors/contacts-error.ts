/**
 * Contacts Error Types
 *
 * Industrial-grade error handling with structured error types,
 * proper error codes, and recovery hints.
 */

/**
 * Error codes for contacts operations
 */
export enum ContactsErrorCode {
    // Provider errors
    PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
    PROVIDER_NOT_SUPPORTED = 'PROVIDER_NOT_SUPPORTED',
    PROVIDER_AUTH_FAILED = 'PROVIDER_AUTH_FAILED',
    PROVIDER_TOKEN_EXPIRED = 'PROVIDER_TOKEN_EXPIRED',

    // Contact errors
    CONTACT_NOT_FOUND = 'CONTACT_NOT_FOUND',
    CONTACT_VALIDATION_FAILED = 'CONTACT_VALIDATION_FAILED',
    CONTACT_DUPLICATE = 'CONTACT_DUPLICATE',
    CONTACT_MISSING_ID = 'CONTACT_MISSING_ID',

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
    SYNC_LOCK_FAILED = 'SYNC_LOCK_FAILED',

    // Import errors
    IMPORT_FAILED = 'IMPORT_FAILED',
    VCARD_PARSE_FAILED = 'VCARD_PARSE_FAILED',

    // Generic errors
    OPERATION_FAILED = 'OPERATION_FAILED',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    TENANT_MISMATCH = 'TENANT_MISMATCH',
}

/**
 * Base contacts error with structured information
 */
export class ContactsError extends Error {
    public readonly code: ContactsErrorCode;
    public readonly provider?: 'google' | 'microsoft';
    public readonly httpStatus?: number;
    public readonly retryable: boolean;
    public readonly retryAfterMs?: number;
    public readonly cause?: Error;
    public readonly context?: Record<string, unknown>;

    constructor(
        message: string,
        code: ContactsErrorCode,
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
        this.name = 'ContactsError';
        this.code = code;
        this.provider = options?.provider;
        this.httpStatus = options?.httpStatus;
        this.retryable = options?.retryable ?? false;
        this.retryAfterMs = options?.retryAfterMs;
        this.cause = options?.cause;
        this.context = options?.context;

        Error.captureStackTrace?.(this, ContactsError);
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
     * Create an error for missing contact ID
     */
    static missingContactId(provider: 'google' | 'microsoft'): ContactsError {
        return new ContactsError(
            `${provider} API returned contact without ID`,
            ContactsErrorCode.CONTACT_MISSING_ID,
            {
                provider,
                httpStatus: 500,
                retryable: false,
            },
        );
    }

    /**
     * Create a rate limit error from API response
     */
    static rateLimited(
        provider: 'google' | 'microsoft',
        retryAfterMs = 60000,
    ): ContactsError {
        return new ContactsError(
            `${provider} API rate limit exceeded. Retry after ${retryAfterMs}ms`,
            ContactsErrorCode.API_RATE_LIMITED,
            {
                provider,
                httpStatus: 429,
                retryable: true,
                retryAfterMs,
            },
        );
    }

    /**
     * Create sync in progress error
     */
    static syncInProgress(providerId: string): ContactsError {
        return new ContactsError(
            `Contact sync already in progress for provider ${providerId}`,
            ContactsErrorCode.SYNC_IN_PROGRESS,
            {
                httpStatus: 409,
                retryable: true,
                retryAfterMs: 30000,
                context: { providerId },
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
    ): ContactsError {
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
            return ContactsError.rateLimited(provider, retryAfterMs);
        }

        // Quota exceeded
        if (status === 403 && message.toLowerCase().includes('quota')) {
            return new ContactsError(
                `${provider} API quota exceeded: ${message}`,
                ContactsErrorCode.API_QUOTA_EXCEEDED,
                { provider, httpStatus: 403, retryable: false },
            );
        }

        // Auth failures
        if (status === 401) {
            return new ContactsError(
                `${provider} authentication failed: ${message}`,
                ContactsErrorCode.PROVIDER_AUTH_FAILED,
                { provider, httpStatus: 401, retryable: true },
            );
        }

        // Not found
        if (status === 404) {
            return new ContactsError(
                `${provider} contact not found: ${message}`,
                ContactsErrorCode.CONTACT_NOT_FOUND,
                { provider, httpStatus: 404, retryable: false },
            );
        }

        // Server errors are retryable
        if (status && status >= 500) {
            return new ContactsError(
                `${provider} API error during ${operation}: ${message}`,
                ContactsErrorCode.API_UNAVAILABLE,
                {
                    provider,
                    httpStatus: status,
                    retryable: true,
                    retryAfterMs: 5000,
                },
            );
        }

        // Default error
        return new ContactsError(
            `${provider} ${operation} failed: ${message}`,
            ContactsErrorCode.OPERATION_FAILED,
            {
                provider,
                httpStatus: status,
                retryable: status ? status >= 500 : false,
            },
        );
    }
}

/**
 * Check if an error is a ContactsError
 */
export function isContactsError(error: unknown): error is ContactsError {
    return error instanceof ContactsError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableContactsError(error: unknown): boolean {
    if (isContactsError(error)) {
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
