/**
 * QuotaGuard unit tests — BTEST-04
 * Pure unit tests — all dependencies are mocked. No DB or Redis required.
 */
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QuotaGuard } from '../quota.guard';

// Helper to build a mock ExecutionContext
function buildMockContext(tenantId: string, locale?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { tenantId },
        headers: locale ? { 'accept-language': locale } : {},
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('QuotaGuard', () => {
  let guard: QuotaGuard;
  let mockReflector: jest.Mocked<Pick<Reflector, 'get'>>;
  let mockSubscriptionService: {
    getOrCreateSubscription: jest.Mock;
    hasFeature: jest.Mock;
  };
  let mockUsageTracking: {
    checkEmailQuota: jest.Mock;
    checkAIQuota: jest.Mock;
  };
  let mockCostProtection: {
    getStatus: jest.Mock;
  };

  beforeEach(() => {
    mockReflector = { get: jest.fn() } as any;

    mockSubscriptionService = {
      getOrCreateSubscription: jest.fn(),
      hasFeature: jest.fn().mockReturnValue(true),
    };

    mockUsageTracking = {
      checkEmailQuota: jest.fn().mockResolvedValue(true),
      checkAIQuota: jest.fn().mockResolvedValue(true),
    };

    mockCostProtection = {
      getStatus: jest.fn().mockResolvedValue({
        isBlocked: false,
        dailyCap: 0.10,
        dailyCost: 0.01,
      }),
    };

    guard = new QuotaGuard(
      mockReflector as any,
      mockSubscriptionService as any,
      mockUsageTracking as any,
      mockCostProtection as any,
    );

    // Default: no @RequiresFeature, no @RequiresQuota decorators
    mockReflector.get.mockReturnValue(null);
  });

  describe('canActivate — subscription status checks', () => {
    it('returns true for an ACTIVE subscription under limits', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'ACTIVE',
        plan: 'FREE',
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
      });
      const context = buildMockContext('tenant-active');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('throws ForbiddenException with SUBSCRIPTION_CANCELED code for CANCELED subscription', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'CANCELED',
        plan: 'FREE',
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
      });
      const context = buildMockContext('tenant-canceled');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'SUBSCRIPTION_CANCELED',
        });
      }
    });

    it('throws ForbiddenException with PAYMENT_PAST_DUE code for PAST_DUE subscription', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'PAST_DUE',
        plan: 'STARTER',
        monthlyEmailLimit: 1000,
        monthlyAICallLimit: 500,
      });
      const context = buildMockContext('tenant-past-due');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'PAYMENT_PAST_DUE',
        });
      }
    });
  });

  describe('canActivate — quota enforcement', () => {
    it('throws ForbiddenException with EMAIL_QUOTA_EXCEEDED when email quota is exhausted', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'ACTIVE',
        plan: 'FREE',
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
      });
      // @RequiresQuota('email') on handler
      mockReflector.get.mockImplementation((key: string) =>
        key === 'quota_type' ? 'email' : null,
      );
      mockUsageTracking.checkEmailQuota.mockResolvedValue(false); // quota exhausted

      const context = buildMockContext('tenant-email-quota');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'EMAIL_QUOTA_EXCEEDED',
        });
      }
    });

    it('throws ForbiddenException with AI_QUOTA_EXCEEDED when AI quota is exhausted', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'ACTIVE',
        plan: 'FREE',
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
      });
      mockReflector.get.mockImplementation((key: string) =>
        key === 'quota_type' ? 'ai' : null,
      );
      mockUsageTracking.checkAIQuota.mockResolvedValue(false); // quota exhausted

      const context = buildMockContext('tenant-ai-quota');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

      try {
        await guard.canActivate(context);
      } catch (err) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'AI_QUOTA_EXCEEDED',
        });
      }
    });

    it('returns true when quota type is "email" and quota is available', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'ACTIVE',
        plan: 'FREE',
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
      });
      mockReflector.get.mockImplementation((key: string) =>
        key === 'quota_type' ? 'email' : null,
      );
      mockUsageTracking.checkEmailQuota.mockResolvedValue(true);

      const context = buildMockContext('tenant-email-ok');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockUsageTracking.checkEmailQuota).toHaveBeenCalledWith('tenant-email-ok', 100);
    });
  });

  describe('canActivate — no @RequiresQuota decorator', () => {
    it('returns true without checking usage when no quota type metadata is set', async () => {
      mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
        status: 'ACTIVE',
        plan: 'FREE',
        monthlyEmailLimit: 100,
        monthlyAICallLimit: 50,
      });
      // Both reflector.get calls return null (no decorators)
      mockReflector.get.mockReturnValue(null);

      const context = buildMockContext('tenant-no-quota-decorator');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockUsageTracking.checkEmailQuota).not.toHaveBeenCalled();
      expect(mockUsageTracking.checkAIQuota).not.toHaveBeenCalled();
    });
  });

  describe('canActivate — missing user', () => {
    it('throws ForbiddenException when user is missing from request', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined, headers: {} }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
