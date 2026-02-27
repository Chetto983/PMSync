/**
 * Typed error hierarchy for Mistral API errors.
 *
 * Extends AiError from the AI module. Callers can catch specific
 * error subclasses without knowing raw SDK error shapes.
 */
import { AiError, AiErrorCode } from '../ai/errors';

export class MistralRateLimitError extends AiError {
  constructor(retryAfterMs?: number) {
    super('Mistral rate limit exceeded', AiErrorCode.RATE_LIMITED, {
      provider: 'mistral',
      retryable: true,
      context: { retryAfterMs },
    });
    this.name = 'MistralRateLimitError';
  }
}

export class MistralAuthError extends AiError {
  constructor() {
    super('Mistral API key invalid or expired', AiErrorCode.AUTH_FAILED, {
      provider: 'mistral',
      retryable: false,
    });
    this.name = 'MistralAuthError';
  }
}

export class MistralTimeoutError extends AiError {
  constructor(timeoutMs?: number) {
    super(
      `Mistral request timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`,
      AiErrorCode.PROVIDER_TIMEOUT,
      {
        provider: 'mistral',
        retryable: true,
        context: { timeoutMs },
      },
    );
    this.name = 'MistralTimeoutError';
  }
}

export class MistralModelNotFoundError extends AiError {
  constructor(modelId: string) {
    super(`Mistral model not found: ${modelId}`, AiErrorCode.PROVIDER_ERROR, {
      provider: 'mistral',
      retryable: false,
      context: { modelId },
    });
    this.name = 'MistralModelNotFoundError';
  }
}
