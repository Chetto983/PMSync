/**
 * Google Provider Error Hierarchy
 *
 * T-0505: Typed errors for Google Calendar + Contacts providers.
 * Each error type maps to a specific recovery action.
 *
 * Hierarchy:
 *   GoogleProviderError (base)
 *   ├── GoogleAuthError (token expired, revoked, insufficient scope)
 *   ├── GoogleRateLimitError (429, quota exceeded)
 *   ├── GoogleSyncError (sync token expired, partial sync failure)
 *   └── GoogleApiError (generic API error with code/message)
 */

/** Recovery actions the caller should take */
export type GoogleErrorRecovery =
  | 'reauth'           // User must re-authenticate (revoked/expired token)
  | 'retry'            // Retryable after delay
  | 'retry_with_backoff' // Retryable with exponential backoff
  | 'full_resync'      // Discard sync token, do full sync
  | 'skip'             // Non-critical, skip and continue
  | 'fail'             // Non-recoverable, report to user

export class GoogleProviderError extends Error {
  public readonly provider = 'google' as const;
  public readonly retryable: boolean;
  public readonly recovery: GoogleErrorRecovery;
  public readonly httpStatus?: number;
  public readonly cause?: Error;

  constructor(
    message: string,
    public readonly errorType: string,
    options: {
      retryable?: boolean;
      recovery: GoogleErrorRecovery;
      httpStatus?: number;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'GoogleProviderError';
    this.retryable = options.retryable ?? false;
    this.recovery = options.recovery;
    this.httpStatus = options.httpStatus;
    this.cause = options.cause;
    Error.captureStackTrace?.(this, GoogleProviderError);
  }

  toStructuredLog(): Record<string, unknown> {
    return {
      errorType: this.errorType,
      provider: this.provider,
      retryable: this.retryable,
      recovery: this.recovery,
      httpStatus: this.httpStatus,
      message: this.message,
    };
  }
}

/**
 * Authentication errors: token expired, revoked, insufficient scope
 */
export class GoogleAuthError extends GoogleProviderError {
  public readonly authReason: 'token_expired' | 'token_revoked' | 'insufficient_scope';

  constructor(
    reason: 'token_expired' | 'token_revoked' | 'insufficient_scope',
    message?: string,
    cause?: Error,
  ) {
    const defaultMessages: Record<string, string> = {
      token_expired: 'Google refresh token has expired. User must re-authenticate.',
      token_revoked: 'Google access has been revoked by user. Please reconnect.',
      insufficient_scope: 'Google permissions insufficient. Please reconnect with required scopes.',
    };

    super(message || defaultMessages[reason], `auth_${reason}`, {
      retryable: false,
      recovery: 'reauth',
      httpStatus: reason === 'insufficient_scope' ? 403 : 401,
      cause,
    });
    this.name = 'GoogleAuthError';
    this.authReason = reason;
  }
}

/**
 * Rate limit / quota errors: 429, daily quota exceeded
 */
export class GoogleRateLimitError extends GoogleProviderError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs?: number, message?: string, cause?: Error) {
    super(
      message || `Google API rate limit exceeded. Retry after ${retryAfterMs ?? 60000}ms.`,
      'rate_limit',
      {
        retryable: true,
        recovery: 'retry_with_backoff',
        httpStatus: 429,
        cause,
      },
    );
    this.name = 'GoogleRateLimitError';
    this.retryAfterMs = retryAfterMs ?? 60000;
  }

  /** Create from Retry-After header value (seconds) */
  static fromRetryAfterHeader(headerValue: string, cause?: Error): GoogleRateLimitError {
    const seconds = parseInt(headerValue, 10);
    const ms = isNaN(seconds) ? 60000 : seconds * 1000;
    return new GoogleRateLimitError(ms, undefined, cause);
  }
}

/**
 * Sync token errors: expired sync token, delta link invalidated
 */
export class GoogleSyncError extends GoogleProviderError {
  public readonly syncReason: 'sync_token_expired' | 'partial_failure' | 'sync_failed';

  constructor(
    reason: 'sync_token_expired' | 'partial_failure' | 'sync_failed',
    message?: string,
    cause?: Error,
  ) {
    const recoveryMap: Record<string, GoogleErrorRecovery> = {
      sync_token_expired: 'full_resync',
      partial_failure: 'retry',
      sync_failed: 'fail',
    };

    super(
      message || `Google sync error: ${reason}`,
      `sync_${reason}`,
      {
        retryable: reason !== 'sync_failed',
        recovery: recoveryMap[reason],
        httpStatus: reason === 'sync_token_expired' ? 410 : undefined,
        cause,
      },
    );
    this.name = 'GoogleSyncError';
    this.syncReason = reason;
  }
}

/**
 * Generic Google API error with HTTP code
 */
export class GoogleApiError extends GoogleProviderError {
  public readonly apiCode?: string;

  constructor(
    httpStatus: number,
    message: string,
    apiCode?: string,
    cause?: Error,
  ) {
    const retryable = httpStatus >= 500 || httpStatus === 408;
    const recovery: GoogleErrorRecovery = retryable ? 'retry' : 'fail';

    super(message, 'api_error', { retryable, recovery, httpStatus, cause });
    this.name = 'GoogleApiError';
    this.apiCode = apiCode;
  }

  /** Create from a Google API GaxiosError */
  static fromGaxiosError(error: unknown): GoogleApiError {
    const err = error as {
      response?: { status?: number; data?: { error?: { message?: string; code?: string } } };
      message?: string;
      code?: string | number;
    };

    const status = err.response?.status ?? (typeof err.code === 'number' ? err.code : 500);
    const message = err.response?.data?.error?.message || err.message || 'Unknown Google API error';
    const apiCode = err.response?.data?.error?.code || (typeof err.code === 'string' ? err.code : undefined);

    // Route to specific error subclasses
    if (status === 401) {
      return new GoogleApiError(401, message, apiCode, error instanceof Error ? error : undefined);
    }
    if (status === 429) {
      return new GoogleApiError(429, message, apiCode, error instanceof Error ? error : undefined);
    }

    return new GoogleApiError(status, message, apiCode, error instanceof Error ? error : undefined);
  }
}

/** Type guard */
export function isGoogleProviderError(error: unknown): error is GoogleProviderError {
  return error instanceof GoogleProviderError;
}

/** Index export */
export { GoogleProviderError as default };
