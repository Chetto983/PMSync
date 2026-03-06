/**
 * Unit tests for HttpMetricsInterceptor (OBS-02).
 *
 * Verifies that the interceptor:
 * - Calls startTimer on entry and ends it with route/status on success
 * - Decrements in-flight gauge on success and error
 * - Uses 'unmatched' label for routes without req.route
 * - Ends timer with error status code on error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register } from 'prom-client';
import { of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from '../http-metrics.interceptor';

// Clear prom-client registry between tests to avoid "already registered"
beforeEach(() => {
  register.clear();
});

function createMocks() {
  const endTimer = vi.fn();
  const duration = {
    startTimer: vi.fn().mockReturnValue(endTimer),
  };
  const inFlight = {
    inc: vi.fn(),
    dec: vi.fn(),
  };
  const interceptor = new HttpMetricsInterceptor(
    duration as any,
    inFlight as any,
  );
  return { interceptor, duration, inFlight, endTimer };
}

function createExecutionContext(overrides: {
  method?: string;
  route?: { path: string } | undefined;
  statusCode?: number;
}) {
  const req = {
    method: overrides.method ?? 'GET',
    route: overrides.route,
  };
  const res = {
    statusCode: overrides.statusCode ?? 200,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

describe('HttpMetricsInterceptor', () => {
  it('should start timer and increment in-flight on intercept', () => {
    const { interceptor, duration, inFlight } = createMocks();
    const ctx = createExecutionContext({ method: 'POST', route: { path: '/api/v1/emails' } });
    const handler = { handle: () => of('result') };

    interceptor.intercept(ctx, handler).subscribe();

    expect(inFlight.inc).toHaveBeenCalledWith({ method: 'POST' });
    expect(duration.startTimer).toHaveBeenCalledWith({ method: 'POST' });
  });

  it('should end timer with route and status on success, and decrement in-flight', () => {
    const { interceptor, inFlight, endTimer } = createMocks();
    const ctx = createExecutionContext({
      method: 'GET',
      route: { path: '/api/v1/users/:id' },
      statusCode: 200,
    });
    const handler = { handle: () => of('ok') };

    interceptor.intercept(ctx, handler).subscribe();

    expect(endTimer).toHaveBeenCalledWith({
      route: '/api/v1/users/:id',
      status_code: '200',
    });
    expect(inFlight.dec).toHaveBeenCalledWith({ method: 'GET' });
  });

  it('should use "unmatched" route label when req.route is undefined', () => {
    const { interceptor, endTimer } = createMocks();
    const ctx = createExecutionContext({ method: 'GET', route: undefined, statusCode: 404 });
    const handler = { handle: () => of('not-found') };

    interceptor.intercept(ctx, handler).subscribe();

    expect(endTimer).toHaveBeenCalledWith({
      route: 'unmatched',
      status_code: '404',
    });
  });

  it('should end timer with error status code on error and decrement in-flight', () => {
    const { interceptor, inFlight, endTimer } = createMocks();
    const ctx = createExecutionContext({ method: 'POST', route: { path: '/api/v1/auth/login' } });
    const error = { status: 401 };
    const handler = { handle: () => throwError(() => error) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        // expected
      },
    });

    expect(endTimer).toHaveBeenCalledWith({
      route: '/api/v1/auth/login',
      status_code: '401',
    });
    expect(inFlight.dec).toHaveBeenCalledWith({ method: 'POST' });
  });

  it('should default to 500 when error has no status', () => {
    const { interceptor, endTimer } = createMocks();
    const ctx = createExecutionContext({ method: 'GET', route: { path: '/api/v1/crash' } });
    const handler = { handle: () => throwError(() => new Error('boom')) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        // expected
      },
    });

    expect(endTimer).toHaveBeenCalledWith({
      route: '/api/v1/crash',
      status_code: '500',
    });
  });
});
