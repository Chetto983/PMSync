import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { AuditLogInterceptor } from '../interceptors/audit-log.interceptor';
import { AuditService } from '../../../common/services/audit.service';

/**
 * Unit tests for AuditLogInterceptor (AUDIT-01)
 *
 * Proves:
 * - AUDIT-01: Authenticated HTTP requests are auto-logged
 * - Unauthenticated requests are skipped
 * - Health/metrics endpoints are excluded
 * - Fire-and-forget: audit errors do not affect response
 */

function createMockAuditService(): jest.Mocked<Pick<AuditService, 'logDataAccess'>> {
  return {
    logDataAccess: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockContext(overrides: {
  user?: any;
  path?: string;
  method?: string;
  params?: Record<string, string>;
  ip?: string;
  className?: string;
}): ExecutionContext {
  const request = {
    user: overrides.user,
    path: overrides.path ?? '/api/v1/emails',
    method: overrides.method ?? 'GET',
    params: overrides.params ?? {},
    ip: overrides.ip ?? '127.0.0.1',
  };

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
    getHandler: jest.fn().mockReturnValue(() => {}),
    getClass: jest.fn().mockReturnValue({
      name: overrides.className ?? 'EmailController',
    }),
    getType: jest.fn().mockReturnValue('http'),
    getArgs: jest.fn().mockReturnValue([request]),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as unknown as ExecutionContext;
}

function createMockCallHandler(returnValue: any = 'response-ok'): CallHandler {
  return {
    handle: jest.fn().mockReturnValue(of(returnValue)),
  };
}

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let auditService: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    auditService = createMockAuditService();
    interceptor = new AuditLogInterceptor(auditService as any);
  });

  it('calls auditService.logDataAccess for authenticated requests', async () => {
    const context = createMockContext({
      user: { userId: 'user-1', tenantId: 'tenant-1' },
      method: 'GET',
      path: '/api/v1/emails',
      params: { id: 'email-42' },
      ip: '10.0.0.5',
      className: 'EmailController',
    });
    const handler = createMockCallHandler();

    const result$ = interceptor.intercept(context, handler);
    await lastValueFrom(result$);

    // Allow microtask to flush the fire-and-forget call
    await new Promise((r) => setTimeout(r, 10));

    expect(auditService.logDataAccess).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      action: 'GET',
      entity: 'EmailController',
      entityId: 'email-42',
      path: '/api/v1/emails',
      ipAddress: '10.0.0.5',
    });
  });

  it('does NOT call auditService.logDataAccess for unauthenticated requests', async () => {
    const context = createMockContext({ user: undefined });
    const handler = createMockCallHandler();

    const result$ = interceptor.intercept(context, handler);
    await lastValueFrom(result$);

    expect(auditService.logDataAccess).not.toHaveBeenCalled();
  });

  it('skips logging for /health path', async () => {
    const context = createMockContext({
      user: { userId: 'user-1', tenantId: 'tenant-1' },
      path: '/health',
    });
    const handler = createMockCallHandler();

    const result$ = interceptor.intercept(context, handler);
    await lastValueFrom(result$);

    expect(auditService.logDataAccess).not.toHaveBeenCalled();
  });

  it('skips logging for /metrics path', async () => {
    const context = createMockContext({
      user: { userId: 'user-1', tenantId: 'tenant-1' },
      path: '/metrics',
    });
    const handler = createMockCallHandler();

    const result$ = interceptor.intercept(context, handler);
    await lastValueFrom(result$);

    expect(auditService.logDataAccess).not.toHaveBeenCalled();
  });

  it('logDataAccess errors do not affect response', async () => {
    auditService.logDataAccess.mockRejectedValue(new Error('Audit DB down'));

    const context = createMockContext({
      user: { userId: 'user-1', tenantId: 'tenant-1' },
      path: '/api/v1/emails',
    });
    const handler = createMockCallHandler('response-value');

    const result$ = interceptor.intercept(context, handler);
    const result = await lastValueFrom(result$);

    // Response still delivered despite audit failure
    expect(result).toBe('response-value');
  });
});
