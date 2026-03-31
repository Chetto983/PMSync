/**
 * Microsoft Provider Error Hierarchy
 *
 * T-0601: Typed errors for Microsoft Calendar + Contacts providers.
 * Each error type maps to a specific recovery action.
 *
 * Hierarchy:
 *   MicrosoftProviderError (base)
 *   ├── MicrosoftAuthError (token expired, consent revoked, interaction required)
 *   ├── MicrosoftRateLimitError (429, throttled)
 *   ├── MicrosoftSyncError (delta link expired, sync state not found)
 *   └── MicrosoftApiError (generic Graph API error with code/message)
 */

/** Recovery actions the caller should take */
export type MicrosoftErrorRecovery =
  | 'reauth'             // User must re-authenticate (revoked/expired token)
  | 'retry'              // Retryable after delay
  | 'retry_with_backoff' // Retryable with exponential backoff
  | 'full_resync'        // Discard delta link, do full sync
  | 'skip'               // Non-critical, skip and continue
  | 'fail';              // Non-recoverable, report to user

export class MicrosoftProviderError extends Error {
  public readonly provider = 'microsoft' as const;
  public readonly retryable: boolean;
  public readonly recovery: MicrosoftErrorRecovery;
  public readonly httpStatus?: number;
  public readonly cause?: Error;

  constructor(
    message: string,
    public readonly errorType: string,
    options: {
      retryable?: boolean;
      recovery: MicrosoftErrorRecovery;
      httpStatus?: number;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'MicrosoftProviderError';
    this.retryable = options.retryable ?? false;
    this.recovery = options.recovery;
    this.httpStatus = options.httpStatus;
    this.cause = options.cause;
    Error.captureStackTrace?.(this, MicrosoftProviderError);
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
 * Authentication errors: token expired, consent revoked, interaction required
 *
 * MSAL error codes mapped:
 *   - invalid_grant / AADSTS700082 → token_expired (refresh token expired)
 *   - consent_required / access_denied → consent_revoked
 *   - interaction_required / AADSTS50076 → interaction_required (MFA/conditional access)
 */
export class MicrosoftAuthError extends MicrosoftProviderError {
  public readonly authReason: 'token_expired' | 'consent_revoked' | 'interaction_required';

  constructor(
    reason: 'token_expired' | 'consent_revoked' | 'interaction_required',
    message?: string,
    cause?: Error,
  ) {
    const defaultMessages: Record<string, string> = {
      token_expired: 'Microsoft refresh token has expired or been revoked. User must re-authenticate.',
      consent_revoked: 'Microsoft app consent has been revoked. Please reconnect with required permissions.',
      interaction_required: 'Microsoft requires additional verification (MFA/conditional access). Please re-authenticate.',
    };

    super(message || defaultMessages[reason], `auth_${reason}`, {
      retryable: false,
      recovery: 'reauth',
      httpStatus: reason === 'consent_revoked' ? 403 : 401,
      cause,
    });
    this.name = 'MicrosoftAuthError';
    this.authReason = reason;
  }

  /** Classify MSAL error into the correct auth reason */
  static fromMsalError(error: unknown): MicrosoftAuthError {
    const err = error as { errorCode?: string; message?: string };
    const errorCode = err.errorCode || '';
    const errorMessage = err.message || '';
    const combined = `${errorCode} ${errorMessage}`.toLowerCase();

    if (combined.includes('consent_required') || combined.includes('access_denied') || combined.includes('insufficient')) {
      return new MicrosoftAuthError('consent_revoked', undefined, error instanceof Error ? error : undefined);
    }

    if (combined.includes('interaction_required') || combined.includes('aadsts50076')) {
      return new MicrosoftAuthError('interaction_required', undefined, error instanceof Error ? error : undefined);
    }

    // Default: treat as token expired (invalid_grant, AADSTS700082, etc.)
    return new MicrosoftAuthError('token_expired', undefined, error instanceof Error ? error : undefined);
  }
}

/**
 * Rate limit / throttle errors: HTTP 429, Graph API throttling
 */
export class MicrosoftRateLimitError extends MicrosoftProviderError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs?: number, message?: string, cause?: Error) {
    super(
      message || `Microsoft Graph API throttled. Retry after ${retryAfterMs ?? 60000}ms.`,
      'rate_limit',
      {
        retryable: true,
        recovery: 'retry_with_backoff',
        httpStatus: 429,
        cause,
      },
    );
    this.name = 'MicrosoftRateLimitError';
    this.retryAfterMs = retryAfterMs ?? 60000;
  }

  /** Create from Retry-After header value (seconds) */
  static fromRetryAfterHeader(headerValue: string, cause?: Error): MicrosoftRateLimitError {
    const seconds = parseInt(headerValue, 10);
    const ms = isNaN(seconds) ? 60000 : seconds * 1000;
    return new MicrosoftRateLimitError(ms, undefined, cause);
  }
}

/**
 * Sync/delta errors: delta link expired (410), syncStateNotFound
 */
export class MicrosoftSyncError extends MicrosoftProviderError {
  public readonly syncReason: 'delta_link_expired' | 'sync_state_not_found' | 'sync_failed';

  constructor(
    reason: 'delta_link_expired' | 'sync_state_not_found' | 'sync_failed',
    message?: string,
    cause?: Error,
  ) {
    const recoveryMap: Record<string, MicrosoftErrorRecovery> = {
      delta_link_expired: 'full_resync',
      sync_state_not_found: 'full_resync',
      sync_failed: 'fail',
    };

    super(
      message || `Microsoft sync error: ${reason}`,
      `sync_${reason}`,
      {
        retryable: reason !== 'sync_failed',
        recovery: recoveryMap[reason],
        httpStatus: reason === 'delta_link_expired' ? 410 : undefined,
        cause,
      },
    );
    this.name = 'MicrosoftSyncError';
    this.syncReason = reason;
  }
}

/**
 * Generic Microsoft Graph API error with HTTP code
 */
export class MicrosoftApiError extends MicrosoftProviderError {
  public readonly graphErrorCode?: string;

  constructor(
    httpStatus: number,
    message: string,
    graphErrorCode?: string,
    cause?: Error,
  ) {
    const retryable = httpStatus >= 500 || httpStatus === 408 || httpStatus === 503 || httpStatus === 504;
    const recovery: MicrosoftErrorRecovery = retryable ? 'retry' : 'fail';

    super(message, 'api_error', { retryable, recovery, httpStatus, cause });
    this.name = 'MicrosoftApiError';
    this.graphErrorCode = graphErrorCode;
  }

  /** Create from a Graph SDK error */
  static fromGraphError(error: unknown): MicrosoftApiError {
    const err = error as {
      statusCode?: number;
      code?: string;
      message?: string;
      body?: string | { error?: { code?: string; message?: string } };
    };

    const status = err.statusCode ?? 500;
    let graphCode = err.code;
    let message = err.message || 'Unknown Microsoft Graph API error';

    // Parse body if it's a string
    if (typeof err.body === 'string') {
      try {
        const parsed = JSON.parse(err.body);
        graphCode = graphCode || parsed?.error?.code;
        message = parsed?.error?.message || message;
      } catch { /* ignore parse errors */ }
    } else if (err.body && typeof err.body === 'object') {
      graphCode = graphCode || err.body.error?.code;
      message = err.body.error?.message || message;
    }

    return new MicrosoftApiError(status, message, graphCode, error instanceof Error ? error : undefined);
  }
}

/** Type guard */
export function isMicrosoftProviderError(error: unknown): error is MicrosoftProviderError {
  return error instanceof MicrosoftProviderError;
}
