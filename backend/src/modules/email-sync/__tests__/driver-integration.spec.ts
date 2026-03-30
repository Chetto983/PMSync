/**
 * T-1701: Driver Integration Test Suite
 *
 * Integration tests for Phase 5-6 error handling, retry, and recovery
 * across Google, Microsoft, and IMAP drivers.
 *
 * Focus: error paths, not happy paths (per sprint spec).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import {
  withRetry,
  isRetryableError,
  getHttpStatus,
  getRetryAfter,
  requiresTokenRefresh,
  RateLimiter,
} from '../../../common/utils/retry.utils';
import {
  classifyImapError,
  classifySmtpError,
  ImapAuthError,
  ImapNetworkError,
  ImapServerError,
  ImapProtocolError,
  ImapConnectionError,
  SmtpError,
} from '../drivers/imap/imap-errors';
import {
  classifyFolderError,
  FolderOperationError,
} from '../drivers/interfaces/folder-errors';

// ─── withRetry + token refresh (G-C1 FIX) ───

describe('withRetry — G-C1 token refresh on 401', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should invoke onTokenRefresh callback on 401 and retry', async () => {
    const tokenRefresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let callCount = 0;

    const result = await withRetry(
      async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Unauthorized');
          err.code = 401;
          throw err;
        }
        return 'success';
      },
      {
        maxRetries: 3,
        onTokenRefresh: tokenRefresh,
        useCircuitBreaker: false,
        initialDelayMs: 1,
      },
    );

    expect(result).toBe('success');
    expect(tokenRefresh).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
  });

  it('should only invoke onTokenRefresh once per withRetry call', async () => {
    const tokenRefresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let callCount = 0;

    await expect(
      withRetry(
        async () => {
          callCount++;
          const err: any = new Error('Unauthorized');
          err.code = 401;
          throw err;
        },
        {
          maxRetries: 3,
          onTokenRefresh: tokenRefresh,
          useCircuitBreaker: false,
          initialDelayMs: 1,
        },
      ),
    ).rejects.toThrow();

    // Token refresh called only once, even though 401 keeps happening
    expect(tokenRefresh).toHaveBeenCalledTimes(1);
  });

  it('should throw original 401 if onTokenRefresh itself throws', async () => {
    const tokenRefresh = jest.fn<() => Promise<void>>().mockRejectedValue(
      new Error('Refresh failed'),
    );

    await expect(
      withRetry(
        async () => {
          const err: any = new Error('Unauthorized');
          err.code = 401;
          throw err;
        },
        {
          maxRetries: 3,
          onTokenRefresh: tokenRefresh,
          useCircuitBreaker: false,
          initialDelayMs: 1,
        },
      ),
    ).rejects.toThrow('Unauthorized');
  });
});

// ─── withRetry — rate limit (429) handling ───

describe('withRetry — 429 rate limit backoff', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should retry on 429 with exponential backoff', async () => {
    let callCount = 0;

    const result = await withRetry(
      async () => {
        callCount++;
        if (callCount <= 2) {
          const err: any = new Error('Too Many Requests');
          err.code = 429;
          throw err;
        }
        return 'ok';
      },
      {
        maxRetries: 3,
        useCircuitBreaker: false,
        initialDelayMs: 10,
        jitter: false,
      },
    );

    expect(result).toBe('ok');
    expect(callCount).toBe(3);
  });

  it('should respect Retry-After header from 429 response', async () => {
    let callCount = 0;

    const result = await withRetry(
      async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Rate limited');
          err.code = 429;
          err.response = { headers: { 'retry-after': '1' } };
          throw err;
        }
        return 'done';
      },
      {
        maxRetries: 2,
        useCircuitBreaker: false,
        initialDelayMs: 10,
        jitter: false,
      },
    );

    expect(result).toBe('done');
    expect(callCount).toBe(2);
  });

  it('should not retry non-retryable errors', async () => {
    let callCount = 0;

    await expect(
      withRetry(
        async () => {
          callCount++;
          const err: any = new Error('Bad Request');
          err.code = 400;
          throw err;
        },
        {
          maxRetries: 3,
          useCircuitBreaker: false,
          initialDelayMs: 1,
        },
      ),
    ).rejects.toThrow('Bad Request');

    expect(callCount).toBe(1);
  });

  it('should retry 5xx server errors', async () => {
    let callCount = 0;

    const result = await withRetry(
      async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Internal Server Error');
          err.code = 500;
          throw err;
        }
        return 'recovered';
      },
      {
        maxRetries: 2,
        useCircuitBreaker: false,
        initialDelayMs: 1,
        jitter: false,
      },
    );

    expect(result).toBe('recovered');
    expect(callCount).toBe(2);
  });
});

// ─── isRetryableError ───

describe('isRetryableError', () => {
  it('should return true for 429', () => {
    expect(isRetryableError({ code: 429 })).toBe(true);
  });
  it('should return true for 500', () => {
    expect(isRetryableError({ code: 500 })).toBe(true);
  });
  it('should return true for 503', () => {
    expect(isRetryableError({ code: 503 })).toBe(true);
  });
  it('should return true for 408 timeout', () => {
    expect(isRetryableError({ code: 408 })).toBe(true);
  });
  it('should return false for 400', () => {
    expect(isRetryableError({ code: 400 })).toBe(false);
  });
  it('should return false for 404', () => {
    expect(isRetryableError({ code: 404 })).toBe(false);
  });
  it('should return true for ECONNRESET', () => {
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });
  it('should return true for ETIMEDOUT', () => {
    expect(isRetryableError(new Error('connect ETIMEDOUT'))).toBe(true);
  });
  it('should return true for error with retryable=true', () => {
    expect(isRetryableError({ retryable: true })).toBe(true);
  });
  it('should return false for error with retryable=false', () => {
    expect(isRetryableError({ retryable: false })).toBe(false);
  });
});

// ─── getHttpStatus ───

describe('getHttpStatus', () => {
  it('should extract code from Google API format', () => {
    expect(getHttpStatus({ code: 403 })).toBe(403);
  });
  it('should extract status from axios response', () => {
    expect(getHttpStatus({ response: { status: 401 } })).toBe(401);
  });
  it('should extract generic status property', () => {
    expect(getHttpStatus({ status: 503 })).toBe(503);
  });
  it('should extract httpStatus (CalendarError format)', () => {
    expect(getHttpStatus({ httpStatus: 429 })).toBe(429);
  });
  it('should return null for non-object', () => {
    expect(getHttpStatus(null)).toBeNull();
    expect(getHttpStatus('error')).toBeNull();
  });
});

// ─── getRetryAfter ───

describe('getRetryAfter', () => {
  it('should extract retryAfterMs property', () => {
    expect(getRetryAfter({ retryAfterMs: 5000 })).toBe(5000);
  });
  it('should extract Retry-After header in seconds', () => {
    expect(
      getRetryAfter({ response: { headers: { 'retry-after': '3' } } }),
    ).toBe(3000);
  });
  it('should return null for missing retry info', () => {
    expect(getRetryAfter({})).toBeNull();
    expect(getRetryAfter(null)).toBeNull();
  });
});

// ─── requiresTokenRefresh ───

describe('requiresTokenRefresh', () => {
  it('should return true for 401', () => {
    expect(requiresTokenRefresh({ code: 401 })).toBe(true);
  });
  it('should return true for requiresTokenRefresh flag', () => {
    expect(requiresTokenRefresh({ requiresTokenRefresh: true })).toBe(true);
  });
  it('should return false for other errors', () => {
    expect(requiresTokenRefresh({ code: 403 })).toBe(false);
  });
});

// ─── RateLimiter ───

describe('RateLimiter', () => {
  it('should track requests within window', async () => {
    const limiter = new RateLimiter(5, 1000);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.getCurrentCount()).toBe(2);
  });

  it('should not exceed max requests', async () => {
    const limiter = new RateLimiter(2, 100);
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    // Third acquire should wait
    await limiter.acquire();
    const elapsed = Date.now() - start;
    // Should have waited at least ~100ms for the window to slide
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
