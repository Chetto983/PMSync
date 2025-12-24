/**
 * AI Module Errors
 * 
 * Standardized error handling for AI operations.
 */

export enum AiErrorCode {
    // Provider errors
    PROVIDER_ERROR = 'PROVIDER_ERROR',
    PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
    PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
    RATE_LIMITED = 'RATE_LIMITED',
    QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
    AUTH_FAILED = 'AUTH_FAILED',
    CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',

    // Input errors
    INVALID_INPUT = 'INVALID_INPUT',
    CONTEXT_TOO_LONG = 'CONTEXT_TOO_LONG',
    PROMPT_BLOCKED = 'PROMPT_BLOCKED', // Security guard

    // Output errors
    EMPTY_RESPONSE = 'EMPTY_RESPONSE',
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    OUTPUT_BLOCKED = 'OUTPUT_BLOCKED', // Security guard

    // Embedding errors
    EMBEDDING_FAILED = 'EMBEDDING_FAILED',
    RAG_FAILED = 'RAG_FAILED',

    // Agent errors
    AGENT_ERROR = 'AGENT_ERROR',
    TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
    WORKFLOW_FAILED = 'WORKFLOW_FAILED',

    // Generic
    INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class AiError extends Error {
    public readonly code: AiErrorCode;
    public readonly provider?: string;
    public readonly retryable: boolean;
    public readonly status?: number;
    public readonly context?: Record<string, unknown>;
    public readonly cause?: Error;

    constructor(
        message: string,
        code: AiErrorCode,
        options?: {
            provider?: string;
            retryable?: boolean;
            status?: number;
            cause?: Error;
            context?: Record<string, unknown>;
        }
    ) {
        super(message);
        this.name = 'AiError';
        this.code = code;
        this.provider = options?.provider;
        this.retryable = options?.retryable ?? false;
        this.status = options?.status;
        this.cause = options?.cause;
        this.context = options?.context;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AiError);
        }
    }

    static fromError(error: unknown, context?: Record<string, unknown>): AiError {
        if (error instanceof AiError) {
            return error;
        }

        const message = error instanceof Error ? error.message : String(error);

        // Check for common provider error patterns
        if (message.includes('timeout') || message.includes('TIMEDOUT')) {
            return new AiError(message, AiErrorCode.PROVIDER_TIMEOUT, { retryable: true, context });
        }

        if (message.includes('rate limit') || message.includes('429')) {
            return new AiError(message, AiErrorCode.RATE_LIMITED, { retryable: true, context });
        }

        if (message.includes('context length') || message.includes('token limit')) {
            return new AiError(message, AiErrorCode.CONTEXT_TOO_LONG, { retryable: false, context });
        }

        return new AiError(message, AiErrorCode.INTERNAL_ERROR, {
            retryable: false,
            cause: error instanceof Error ? error : undefined,
            context
        });
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            provider: this.provider,
            retryable: this.retryable,
            status: this.status,
            context: this.context
        };
    }
}
