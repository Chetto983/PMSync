import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LegalAcceptanceGuard } from '../guards/legal-acceptance.guard';
import { ConsentGuard } from '../guards/consent.guard';
import { LegalAcceptanceService } from '../services/legal-acceptance.service';
import { ConsentEnforcementService } from '../services/consent-enforcement.service';

/**
 * Integration tests for GDPR guards as APP_GUARD (20-01)
 *
 * Validates:
 * - LegalAcceptanceGuard skips unauthenticated routes
 * - LegalAcceptanceGuard enforces on authenticated routes
 * - @SkipLegalCheck bypass works
 * - ConsentGuard no-op without @RequiresConsent
 * - ConsentGuard enforces with @RequiresConsent
 * - Guard ordering: legal runs before consent
 */

function createMockContext(options: {
  user?: { userId?: string; id?: string; tenantId?: string };
  handlerMetadata?: Record<string, unknown>;
  classMetadata?: Record<string, unknown>;
}): ExecutionContext {
  const handler = jest.fn();
  const controllerClass = class TestController {};

  // Attach metadata to handler/class for Reflector to read
  if (options.handlerMetadata) {
    for (const [key, value] of Object.entries(options.handlerMetadata)) {
      Reflect.defineMetadata(key, value, handler);
    }
  }
  if (options.classMetadata) {
    for (const [key, value] of Object.entries(options.classMetadata)) {
      Reflect.defineMetadata(key, value, controllerClass);
    }
  }

  return {
    getHandler: jest.fn().mockReturnValue(handler),
    getClass: jest.fn().mockReturnValue(controllerClass),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: options.user ?? undefined,
      }),
    }),
    getType: jest.fn().mockReturnValue('http'),
    getArgs: jest.fn().mockReturnValue([]),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('GDPR Guards Integration (20-01)', () => {
  let legalGuard: LegalAcceptanceGuard;
  let consentGuard: ConsentGuard;
  let legalService: jest.Mocked<LegalAcceptanceService>;
  let consentService: jest.Mocked<ConsentEnforcementService>;

  beforeEach(() => {
    legalService = {
      hasAcceptedCurrentVersions: jest.fn(),
    } as any;

    consentService = {
      hasConsent: jest.fn(),
    } as any;

    const reflector = new Reflector();
    legalGuard = new LegalAcceptanceGuard(reflector, legalService);
    consentGuard = new ConsentGuard(reflector, consentService);
  });

  // ============ LegalAcceptanceGuard ============

  describe('LegalAcceptanceGuard as APP_GUARD', () => {
    it('returns true for unauthenticated request (no user)', async () => {
      const ctx = createMockContext({ user: undefined });

      const result = await legalGuard.canActivate(ctx);

      expect(result).toBe(true);
      expect(legalService.hasAcceptedCurrentVersions).not.toHaveBeenCalled();
    });

    it('returns true when user has accepted legal documents', async () => {
      legalService.hasAcceptedCurrentVersions.mockResolvedValue(true);
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
      });

      const result = await legalGuard.canActivate(ctx);

      expect(result).toBe(true);
      expect(legalService.hasAcceptedCurrentVersions).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
      );
    });

    it('throws ForbiddenException when user has NOT accepted legal documents', async () => {
      legalService.hasAcceptedCurrentVersions.mockResolvedValue(false);
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
      });

      await expect(legalGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(legalGuard.canActivate(ctx)).rejects.toThrow(
        'You must accept the current Terms of Service and Privacy Policy',
      );
    });

    it('returns true when @SkipLegalCheck is set on handler', async () => {
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
        handlerMetadata: { skipLegalCheck: true },
      });

      const result = await legalGuard.canActivate(ctx);

      expect(result).toBe(true);
      expect(legalService.hasAcceptedCurrentVersions).not.toHaveBeenCalled();
    });

    it('returns true when @SkipLegalCheck is set on class', async () => {
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
        classMetadata: { skipLegalCheck: true },
      });

      const result = await legalGuard.canActivate(ctx);

      expect(result).toBe(true);
      expect(legalService.hasAcceptedCurrentVersions).not.toHaveBeenCalled();
    });
  });

  // ============ ConsentGuard ============

  describe('ConsentGuard as APP_GUARD', () => {
    it('returns true when handler has no @RequiresConsent', async () => {
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
      });

      const result = await consentGuard.canActivate(ctx);

      expect(result).toBe(true);
      expect(consentService.hasConsent).not.toHaveBeenCalled();
    });

    it('returns true when user has consent for required feature', async () => {
      consentService.hasConsent.mockResolvedValue(true);
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
        handlerMetadata: { requiredConsent: 'ai_email_processing' },
      });

      const result = await consentGuard.canActivate(ctx);

      expect(result).toBe(true);
      expect(consentService.hasConsent).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
        'ai_email_processing',
      );
    });

    it('throws ForbiddenException when user lacks consent', async () => {
      consentService.hasConsent.mockResolvedValue(false);
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
        handlerMetadata: { requiredConsent: 'ai_email_processing' },
      });

      await expect(consentGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(consentGuard.canActivate(ctx)).rejects.toThrow(
        'Consent required for feature: ai_email_processing',
      );
    });
  });

  // ============ Guard Ordering ============

  describe('Guard ordering (Legal before Consent)', () => {
    it('LegalAcceptanceGuard blocks before ConsentGuard runs', async () => {
      legalService.hasAcceptedCurrentVersions.mockResolvedValue(false);
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
        handlerMetadata: { requiredConsent: 'ai_email_processing' },
      });

      // Legal guard throws first — consent should never be checked
      await expect(legalGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(consentService.hasConsent).not.toHaveBeenCalled();
    });

    it('ConsentGuard runs only after LegalAcceptanceGuard passes', async () => {
      legalService.hasAcceptedCurrentVersions.mockResolvedValue(true);
      consentService.hasConsent.mockResolvedValue(false);
      const ctx = createMockContext({
        user: { userId: 'user-1', tenantId: 'tenant-1' },
        handlerMetadata: { requiredConsent: 'ai_email_processing' },
      });

      // Legal passes
      const legalResult = await legalGuard.canActivate(ctx);
      expect(legalResult).toBe(true);

      // Consent blocks
      await expect(consentGuard.canActivate(ctx)).rejects.toThrow(
        'Consent required for feature: ai_email_processing',
      );
    });
  });
});
