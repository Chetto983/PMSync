import { BadRequestException } from '@nestjs/common';
import { ConsentService } from '../services/consent.service';
import {
  CONSENT_FEATURES,
  CURRENT_CONSENT_VERSION,
  FEATURE_TO_PREF_MAP,
} from '../consent.constants';

/**
 * Unit tests for ConsentService (CONS-01, CONS-03)
 *
 * Proves:
 * - CONS-01: Users can view and modify consent per feature
 * - CONS-03: Consent records are immutable and versioned (append-only)
 */

function createMockPrisma() {
  return {
    userConsent: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    userPreferences: {
      update: jest.fn(),
    },
  } as any;
}

describe('ConsentService', () => {
  let service: ConsentService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ConsentService(prisma);
  });

  describe('getCurrentConsents', () => {
    it('returns all 6 features with correct granted state from latest records', async () => {
      const now = new Date();
      prisma.userConsent.findMany.mockResolvedValue([
        { feature: 'ai_smart_replies', granted: true, createdAt: now, version: 1 },
        { feature: 'ai_summarization', granted: false, createdAt: now, version: 1 },
      ]);

      const result = await service.getCurrentConsents('user-1', 'tenant-1');

      expect(result).toHaveLength(6);

      // Features with records use the record's granted state
      const smartReplies = result.find((r) => r.feature === 'ai_smart_replies');
      expect(smartReplies?.granted).toBe(true);
      expect(smartReplies?.lastUpdated).toBe(now);
      expect(smartReplies?.version).toBe(1);

      const summarization = result.find((r) => r.feature === 'ai_summarization');
      expect(summarization?.granted).toBe(false);

      // Prisma called with correct args
      expect(prisma.userConsent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
        distinct: ['feature'],
      });
    });

    it('returns granted: false for features with no consent records', async () => {
      prisma.userConsent.findMany.mockResolvedValue([]);

      const result = await service.getCurrentConsents('user-1', 'tenant-1');

      expect(result).toHaveLength(6);
      for (const state of result) {
        expect(state.granted).toBe(false);
        expect(state.lastUpdated).toBeNull();
        expect(state.version).toBeNull();
      }
    });

    it('includes label, description, and required from feature definitions', async () => {
      prisma.userConsent.findMany.mockResolvedValue([]);

      const result = await service.getCurrentConsents('user-1', 'tenant-1');

      for (const state of result) {
        const featureDef = CONSENT_FEATURES.find((f) => f.id === state.feature);
        expect(featureDef).toBeDefined();
        expect(state.label).toBe(featureDef!.label);
        expect(state.description).toBe(featureDef!.description);
        expect(state.required).toBe(featureDef!.required);
      }
    });
  });

  describe('updateConsent', () => {
    it('creates immutable consent record with correct version, ipAddress, userAgent', async () => {
      const now = new Date();
      prisma.userConsent.create.mockResolvedValue({
        id: 'consent-1',
        feature: 'ai_smart_replies',
        granted: true,
        version: CURRENT_CONSENT_VERSION,
        createdAt: now,
        ipAddress: '192.168.1.1',
        userAgent: 'TestBrowser/1.0',
      });
      prisma.userPreferences.update.mockResolvedValue({});

      const result = await service.updateConsent(
        'user-1',
        'tenant-1',
        'ai_smart_replies',
        true,
        '192.168.1.1',
        'TestBrowser/1.0',
      );

      expect(prisma.userConsent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          tenantId: 'tenant-1',
          feature: 'ai_smart_replies',
          granted: true,
          version: CURRENT_CONSENT_VERSION,
          ipAddress: '192.168.1.1',
          userAgent: 'TestBrowser/1.0',
        },
      });

      expect(result.granted).toBe(true);
      expect(result.feature).toBe('ai_smart_replies');
      expect(result.version).toBe(CURRENT_CONSENT_VERSION);
    });

    it('syncs to UserPreferences when feature has mapping (FEATURE_TO_PREF_MAP)', async () => {
      prisma.userConsent.create.mockResolvedValue({
        feature: 'ai_smart_replies',
        granted: true,
        version: 1,
        createdAt: new Date(),
      });
      prisma.userPreferences.update.mockResolvedValue({});

      await service.updateConsent('user-1', 'tenant-1', 'ai_smart_replies', true);

      expect(prisma.userPreferences.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { [FEATURE_TO_PREF_MAP['ai_smart_replies']]: true },
      });
    });

    it('does NOT sync to UserPreferences when feature has no mapping (email_analytics)', async () => {
      prisma.userConsent.create.mockResolvedValue({
        feature: 'email_analytics',
        granted: true,
        version: 1,
        createdAt: new Date(),
      });

      await service.updateConsent('user-1', 'tenant-1', 'email_analytics', true);

      // email_analytics has no entry in FEATURE_TO_PREF_MAP
      expect(FEATURE_TO_PREF_MAP['email_analytics']).toBeUndefined();
      expect(prisma.userPreferences.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for unknown feature ID', async () => {
      await expect(
        service.updateConsent('user-1', 'tenant-1', 'nonexistent_feature', true),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.userConsent.create).not.toHaveBeenCalled();
    });
  });

  describe('getConsentHistory', () => {
    it('returns records ordered by createdAt desc', async () => {
      const records = [
        { id: '2', feature: 'ai_smart_replies', granted: true, version: 1, createdAt: new Date('2026-02-02'), ipAddress: null },
        { id: '1', feature: 'ai_smart_replies', granted: false, version: 1, createdAt: new Date('2026-02-01'), ipAddress: '1.2.3.4' },
      ];
      prisma.userConsent.findMany.mockResolvedValue(records);

      const result = await service.getConsentHistory('user-1', 'tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
      expect(prisma.userConsent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('filters by feature when provided', async () => {
      prisma.userConsent.findMany.mockResolvedValue([]);

      await service.getConsentHistory('user-1', 'tenant-1', 'ai_smart_replies');

      expect(prisma.userConsent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', tenantId: 'tenant-1', feature: 'ai_smart_replies' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('Immutability proof (CONS-03)', () => {
    it('multiple consent changes for same feature create separate records (not updates)', async () => {
      // First consent change
      prisma.userConsent.create.mockResolvedValueOnce({
        id: 'consent-1',
        feature: 'ai_smart_replies',
        granted: true,
        version: 1,
        createdAt: new Date('2026-01-01'),
      });
      prisma.userPreferences.update.mockResolvedValue({});

      await service.updateConsent('user-1', 'tenant-1', 'ai_smart_replies', true);

      // Second consent change (revoke)
      prisma.userConsent.create.mockResolvedValueOnce({
        id: 'consent-2',
        feature: 'ai_smart_replies',
        granted: false,
        version: 1,
        createdAt: new Date('2026-01-02'),
      });

      await service.updateConsent('user-1', 'tenant-1', 'ai_smart_replies', false);

      // Verify: create called twice (not update)
      expect(prisma.userConsent.create).toHaveBeenCalledTimes(2);

      // First call: granted = true
      expect(prisma.userConsent.create.mock.calls[0][0].data.granted).toBe(true);
      // Second call: granted = false
      expect(prisma.userConsent.create.mock.calls[1][0].data.granted).toBe(false);
    });
  });
});
