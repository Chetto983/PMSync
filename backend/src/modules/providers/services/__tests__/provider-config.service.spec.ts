/**
 * ProviderConfigService integration tests — BTEST-03
 * Prisma runs against a real PostgreSQL test database.
 * All non-Prisma dependencies are mocked with jest.fn().
 */
// Mock better-auth (ESM module — cannot be transformed by Jest)
jest.mock('../../../../common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProviderConfigService } from '../provider-config.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';
import { ProviderDisconnectedEvent } from '../../../../common/events/provider.events';

const mockCrypto = {
  encrypt: jest.fn().mockImplementation((v: string) => ({ encrypted: `enc:${v}`, iv: `iv:${v}` })),
  decrypt: jest.fn().mockImplementation((v: string) => v.replace(/^enc:/, '')),
};

const mockGoogleOAuth = {
  exchangeCodeForTokens: jest.fn(),
  revokeToken: jest.fn().mockResolvedValue(undefined),
  getSendAsAliases: jest.fn().mockResolvedValue([]),
};

const mockMicrosoftOAuth = {
  exchangeCodeForTokens: jest.fn(),
  revokeSession: jest.fn().mockResolvedValue(undefined),
  getAliases: jest.fn().mockResolvedValue([]),
};

const mockImap = {
  testConnection: jest.fn().mockResolvedValue(true),
  testSmtpConnection: jest.fn().mockResolvedValue(true),
};

const mockCaldav = {
  testCalDavConnection: jest.fn().mockResolvedValue(false),
  testCardDavConnection: jest.fn().mockResolvedValue(false),
};

const mockSubscription = {
  getOrCreateSubscription: jest.fn().mockResolvedValue({ plan: 'FREE', maxUsers: 1 }),
  getCurrentSubscription: jest.fn().mockResolvedValue({ plan: 'FREE', maxUsers: 1 }),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockAuth = {
  api: {
    refreshToken: jest.fn(),
    getAccessToken: jest.fn(),
  },
};

describe('ProviderConfigService', () => {
  let service: ProviderConfigService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new ProviderConfigService(
      prisma as any,
      mockCrypto as any,
      mockGoogleOAuth as any,
      mockMicrosoftOAuth as any,
      mockImap as any,
      mockCaldav as any,
      mockSubscription as any,
      mockEventEmitter as any,
      mockAuth as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset defaults after clearAllMocks
    mockCrypto.encrypt.mockImplementation((v: string) => ({ encrypted: `enc:${v}`, iv: `iv:${v}` }));
    mockCrypto.decrypt.mockImplementation((v: string) => v.replace(/^enc:/, ''));
    mockGoogleOAuth.revokeToken.mockResolvedValue(undefined);
    mockSubscription.getOrCreateSubscription.mockResolvedValue({ plan: 'FREE', maxUsers: 1 });
    mockImap.testConnection.mockResolvedValue(true);
  });

  afterAll(async () => {
    // Targeted cleanup: only delete rows created by this spec.
    // cleanupTestData() (TRUNCATE CASCADE) is intentionally omitted here —
    // running it races with other concurrent provider spec files and violates FK constraints.
    // The global teardown handles the final TRUNCATE after all specs finish.
    if (providerIds.length > 0) {
      await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  });

  // ---------------------------------------------------------------------------
  // connectGoogleProvider — plan limits
  // ---------------------------------------------------------------------------

  describe('connectGoogleProvider', () => {
    it('creates ProviderConfig row and encrypts tokens when under plan limit', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      // Free plan allows 1 provider — tenant has none yet
      mockSubscription.getOrCreateSubscription.mockResolvedValue({ plan: 'FREE', maxProviders: 1 });
      mockGoogleOAuth.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'raw-access-token',
        refreshToken: 'raw-refresh-token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        email: 'user@gmail.com',
      });

      const result = await service.connectGoogleProvider(tenant.id, user.id, {
        authorizationCode: 'auth-code',
        email: 'user@gmail.com',
      });

      // Returned config should not contain raw tokens
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(result.email).toBe('user@gmail.com');

      // Verify encrypted values were stored in DB
      const fromDb = await prisma.providerConfig.findFirst({
        where: { tenantId: tenant.id, email: 'user@gmail.com', providerType: 'google' },
      });
      expect(fromDb).toBeTruthy();
      providerIds.push(fromDb!.id);

      // crypto.encrypt must have been called with raw tokens
      expect(mockCrypto.encrypt).toHaveBeenCalledWith('raw-access-token');
      expect(mockCrypto.encrypt).toHaveBeenCalledWith('raw-refresh-token');

      // Stored value is the encrypted version, not plaintext
      expect(fromDb!.accessToken).toBe('enc:raw-access-token');
      expect(fromDb!.refreshToken).toBe('enc:raw-refresh-token');
    });

    it('throws ForbiddenException when provider count is at plan limit', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      // Create 1 existing active provider (FREE plan max is 1)
      const existing = await createTestProviderAccount(tenant.id, user.id, {
        email: 'existing@gmail.com',
        providerType: 'google',
      });
      providerIds.push(existing.id);

      // FREE plan allows maxProviders: 1 → already at limit
      mockSubscription.getOrCreateSubscription.mockResolvedValue({
        plan: 'FREE',
        maxProviders: 1,
      });

      await expect(
        service.connectGoogleProvider(tenant.id, user.id, {
          authorizationCode: 'auth-code',
          email: 'second@gmail.com',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('emits ProviderConnectedEvent after successful connection', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      mockSubscription.getOrCreateSubscription.mockResolvedValue({ plan: 'ENTERPRISE', maxProviders: -1 });
      mockGoogleOAuth.exchangeCodeForTokens.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        email: 'emit@gmail.com',
      });

      await service.connectGoogleProvider(tenant.id, user.id, {
        authorizationCode: 'code',
        email: 'emit@gmail.com',
      });

      const fromDb = await prisma.providerConfig.findFirst({
        where: { tenantId: tenant.id, email: 'emit@gmail.com' },
      });
      if (fromDb) providerIds.push(fromDb.id);

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'provider.connected',
        expect.any(Object),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getProviderConfig
  // ---------------------------------------------------------------------------

  describe('getProviderConfig', () => {
    it('returns sanitized config for existing provider', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      const provider = await createTestProviderAccount(tenant.id, user.id, {
        email: 'get@gmail.com',
      });
      providerIds.push(provider.id);

      const result = await service.getProviderConfig(tenant.id, provider.id);

      expect(result.id).toBe(provider.id);
      expect(result.email).toBe('get@gmail.com');
      // Sanitized: no raw token fields
      expect(result.accessToken).toBeUndefined();
    });

    it('throws NotFoundException for unknown provider id', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      await expect(
        service.getProviderConfig(tenant.id, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when provider belongs to different tenant', async () => {
      const tenantA = await createTestTenant();
      tenantIds.push(tenantA.id);
      const tenantB = await createTestTenant();
      tenantIds.push(tenantB.id);
      const user = await createTestUser(tenantA.id);
      userIds.push(user.id);

      const provider = await createTestProviderAccount(tenantA.id, user.id);
      providerIds.push(provider.id);

      await expect(
        service.getProviderConfig(tenantB.id, provider.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteProviderConfig
  // ---------------------------------------------------------------------------

  describe('deleteProviderConfig', () => {
    it('removes the DB row and emits ProviderDisconnectedEvent', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);

      const provider = await createTestProviderAccount(tenant.id, user.id, {
        email: 'delete@gmail.com',
        providerType: 'google',
        accessToken: 'enc:some-token',
        refreshToken: 'enc:some-refresh',
        refreshTokenEncryptionIv: 'test-iv',
      });
      // Do NOT push to providerIds — it will be deleted by the service

      await service.deleteProviderConfig(tenant.id, provider.id);

      // Verify DB row is gone
      const fromDb = await prisma.providerConfig.findFirst({ where: { id: provider.id } });
      expect(fromDb).toBeNull();

      // Verify event was emitted
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        ProviderDisconnectedEvent.eventName,
        expect.any(Object),
      );
    });

    it('throws NotFoundException when deleting non-existent provider', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      await expect(
        service.deleteProviderConfig(tenant.id, 'does-not-exist'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
