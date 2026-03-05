import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConsentGuard } from '../guards/consent.guard';
import { ConsentEnforcementService } from '../services/consent-enforcement.service';

/**
 * Unit tests for ConsentGuard (CONS-02)
 *
 * Proves:
 * - CONS-02: Guard blocks requests when consent is missing
 * - CONS-02: Guard allows requests when consent is granted
 * - Guard skips when no @RequiresConsent decorator
 */

function createMockExecutionContext(user?: {
  userId?: string;
  id?: string;
  tenantId?: string;
}): ExecutionContext {
  return {
    getHandler: jest.fn().mockReturnValue(() => {}),
    getClass: jest.fn().mockReturnValue(class TestController {}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: user ?? undefined,
      }),
    }),
    getType: jest.fn().mockReturnValue('http'),
    getArgs: jest.fn().mockReturnValue([]),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('ConsentGuard', () => {
  let guard: ConsentGuard;
  let reflector: jest.Mocked<Reflector>;
  let consentEnforcementService: jest.Mocked<ConsentEnforcementService>;

  beforeEach(() => {
    reflector = {
      get: jest.fn(),
    } as any;

    consentEnforcementService = {
      hasConsent: jest.fn(),
    } as any;

    guard = new ConsentGuard(reflector, consentEnforcementService);
  });

  it('returns true when no @RequiresConsent decorator on handler', async () => {
    reflector.get.mockReturnValue(undefined);
    const context = createMockExecutionContext({ userId: 'user-1', tenantId: 'tenant-1' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(consentEnforcementService.hasConsent).not.toHaveBeenCalled();
  });

  it('returns true when hasConsent returns true', async () => {
    reflector.get.mockReturnValue('ai_smart_replies');
    consentEnforcementService.hasConsent.mockResolvedValue(true);
    const context = createMockExecutionContext({ userId: 'user-1', tenantId: 'tenant-1' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(consentEnforcementService.hasConsent).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'ai_smart_replies',
    );
  });

  it('throws ForbiddenException when hasConsent returns false', async () => {
    reflector.get.mockReturnValue('ai_smart_replies');
    consentEnforcementService.hasConsent.mockResolvedValue(false);
    const context = createMockExecutionContext({ userId: 'user-1', tenantId: 'tenant-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Consent required for feature: ai_smart_replies',
    );
  });

  it('extracts userId and tenantId from request.user', async () => {
    reflector.get.mockReturnValue('ai_summarization');
    consentEnforcementService.hasConsent.mockResolvedValue(true);
    const context = createMockExecutionContext({
      userId: 'extracted-user',
      tenantId: 'extracted-tenant',
    });

    await guard.canActivate(context);

    expect(consentEnforcementService.hasConsent).toHaveBeenCalledWith(
      'extracted-user',
      'extracted-tenant',
      'ai_summarization',
    );
  });

  it('returns true (skips) when user is missing from request (APP_GUARD pre-auth pass-through)', async () => {
    // ConsentGuard runs as both APP_GUARD (global) and controller-level.
    // When running as APP_GUARD, request.user is not yet set because
    // JwtAuthGuard hasn't executed. Guard must return true to let the
    // controller-level instance re-check after authentication.
    reflector.get.mockReturnValue('ai_smart_replies');
    const context = createMockExecutionContext(undefined);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    // Should NOT call consentEnforcementService — no user to check
    expect(consentEnforcementService.hasConsent).not.toHaveBeenCalled();
  });
});
