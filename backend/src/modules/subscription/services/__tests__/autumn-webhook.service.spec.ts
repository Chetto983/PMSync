/**
 * AutumnWebhookService unit tests
 * Direct instantiation with mocked dependencies (no DI needed).
 */
import { AutumnWebhookService } from '../autumn-webhook.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { AutumnWebhookPayload } from '../../dto/subscription.dto';

const mockSubscriptionService = {
  updatePlan: jest.fn().mockResolvedValue({}),
  updateStatus: jest.fn().mockResolvedValue({}),
};

const mockBillingAlertService = {
  sendAlertIfNeeded: jest.fn().mockResolvedValue(true),
};

const mockCostProtectionService = {
  checkAndAlert: jest.fn().mockResolvedValue(undefined),
};

const mockRedisLock = {
  setNX: jest.fn().mockResolvedValue(true),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(undefined),
};

describe('AutumnWebhookService', () => {
  let service: AutumnWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: setNX returns true (new event)
    mockRedisLock.setNX.mockResolvedValue(true);

    service = new AutumnWebhookService(
      mockSubscriptionService as any,
      mockBillingAlertService as any,
      mockCostProtectionService as any,
      mockRedisLock as any,
      mockConfigService as any,
    );
  });

  describe('processEvent - customer.products.updated', () => {
    it('upgrade scenario calls updatePlan + updateStatus(ACTIVE)', async () => {
      const payload: AutumnWebhookPayload = {
        type: 'customer.products.updated',
        data: {
          customer_id: 'tenant-123',
          scenario: 'upgrade',
          product_id: 'prod_pro',
          product_name: 'Professional',
        },
      };

      // Configure plan mapping
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'AUTUMN_PLAN_MAPPING') {
          return JSON.stringify({ prod_pro: 'PROFESSIONAL' });
        }
        return undefined;
      });

      // Re-create service with updated config
      service = new AutumnWebhookService(
        mockSubscriptionService as any,
        mockBillingAlertService as any,
        mockCostProtectionService as any,
        mockRedisLock as any,
        mockConfigService as any,
      );

      await service.processEvent('svix-id-1', payload);

      expect(mockRedisLock.setNX).toHaveBeenCalledWith(
        'webhook:autumn:svix-id-1',
        86_400_000,
      );
      expect(mockSubscriptionService.updatePlan).toHaveBeenCalledWith(
        'tenant-123',
        SubscriptionPlan.PROFESSIONAL,
      );
      expect(mockSubscriptionService.updateStatus).toHaveBeenCalledWith(
        'tenant-123',
        SubscriptionStatus.ACTIVE,
      );
    });

    it('past_due scenario calls updateStatus(PAST_DUE)', async () => {
      const payload: AutumnWebhookPayload = {
        type: 'customer.products.updated',
        data: {
          customer_id: 'tenant-456',
          scenario: 'past_due',
        },
      };

      await service.processEvent('svix-id-2', payload);

      expect(mockSubscriptionService.updateStatus).toHaveBeenCalledWith(
        'tenant-456',
        SubscriptionStatus.PAST_DUE,
      );
      expect(mockSubscriptionService.updatePlan).not.toHaveBeenCalled();
    });

    it('cancel scenario logs info without calling updateStatus', async () => {
      const payload: AutumnWebhookPayload = {
        type: 'customer.products.updated',
        data: {
          customer_id: 'tenant-789',
          scenario: 'cancel',
        },
      };

      await service.processEvent('svix-id-3', payload);

      // Cancel is handled by SubscriptionLifecycleService daily check
      expect(mockSubscriptionService.updateStatus).not.toHaveBeenCalled();
      expect(mockSubscriptionService.updatePlan).not.toHaveBeenCalled();
    });
  });

  describe('processEvent - idempotency', () => {
    it('duplicate svix-id (setNX returns false) skips processing', async () => {
      mockRedisLock.setNX.mockResolvedValue(false);

      const payload: AutumnWebhookPayload = {
        type: 'customer.products.updated',
        data: {
          customer_id: 'tenant-123',
          scenario: 'upgrade',
          product_id: 'prod_pro',
        },
      };

      await service.processEvent('duplicate-id', payload);

      expect(mockRedisLock.setNX).toHaveBeenCalledWith(
        'webhook:autumn:duplicate-id',
        86_400_000,
      );
      expect(mockSubscriptionService.updatePlan).not.toHaveBeenCalled();
      expect(mockSubscriptionService.updateStatus).not.toHaveBeenCalled();
      expect(mockCostProtectionService.checkAndAlert).not.toHaveBeenCalled();
    });
  });

  describe('processEvent - balances.limit_reached', () => {
    it('calls costProtectionService.checkAndAlert', async () => {
      const payload: AutumnWebhookPayload = {
        type: 'balances.limit_reached',
        data: {
          customer_id: 'tenant-limit',
          feature_id: 'ai-calls',
          balance: 0,
          limit: 500,
        },
      };

      await service.processEvent('svix-id-limit', payload);

      expect(mockCostProtectionService.checkAndAlert).toHaveBeenCalledWith(
        'tenant-limit',
      );
    });
  });

  describe('processEvent - unknown event type', () => {
    it('logs warning and returns without error', async () => {
      const payload = {
        type: 'unknown.event.type' as any,
        data: {
          customer_id: 'tenant-unknown',
        },
      };

      // Should not throw
      await expect(
        service.processEvent('svix-id-unknown', payload),
      ).resolves.toBeUndefined();

      // Should not call any service methods
      expect(mockSubscriptionService.updatePlan).not.toHaveBeenCalled();
      expect(mockSubscriptionService.updateStatus).not.toHaveBeenCalled();
      expect(mockCostProtectionService.checkAndAlert).not.toHaveBeenCalled();
    });
  });

  describe('processEvent - expired scenario', () => {
    it('expired sets plan to FREE and status to CANCELED', async () => {
      const payload: AutumnWebhookPayload = {
        type: 'customer.products.updated',
        data: {
          customer_id: 'tenant-expired',
          scenario: 'expired',
        },
      };

      await service.processEvent('svix-id-expired', payload);

      expect(mockSubscriptionService.updatePlan).toHaveBeenCalledWith(
        'tenant-expired',
        SubscriptionPlan.FREE,
      );
      expect(mockSubscriptionService.updateStatus).toHaveBeenCalledWith(
        'tenant-expired',
        SubscriptionStatus.CANCELED,
      );
    });
  });
});
