import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Auto-Connect Social Provider Tests (PARANOID)
 *
 * Validates the complete auto-connect flow:
 * 1. Reads better-auth Account metadata and resolves usable tokens via Better Auth
 * 2. Encrypts tokens via CryptoService before storing
 * 3. Deduplication: returns existing provider if already connected
 * 4. Returns null when no social account exists
 * 5. Emits ProviderConnectedEvent on success
 * 6. Respects provider subscription limits
 * 7. Handles missing refresh tokens gracefully
 * 8. Upsert key prevents duplicate ProviderConfig rows
 * 9. Cross-table read: Account (unscoped) vs ProviderConfig (tenant-scoped)
 */

// Mock tenant scoping
jest.mock('../../src/prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => any) => fn()),
}));

jest.mock('../../src/common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

import { ProviderConfigService } from '../../src/modules/providers/services/provider-config.service';
import { ProviderConnectedEvent } from '../../src/common/events/provider.events';

describe('Auto-Connect Social Provider (E2E)', () => {
  let service: ProviderConfigService;
  let mockPrisma: any;
  let mockCrypto: any;
  let mockEventEmitter: EventEmitter2;
  let mockSubscriptionService: any;
  let mockAuth: any;

  const TEST_TENANT = 'tenant-test-001';
  const TEST_USER = 'user-test-001';
  const TEST_EMAIL = 'test@gmail.com';

  beforeEach(() => {
    mockPrisma = {
      account: {
        findFirst: jest.fn(),
      },
      providerConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockCrypto = {
      encrypt: jest.fn((text: string) => ({
        encrypted: `gcm:enc:${text.slice(0, 8)}`,
        iv: `iv-${text.slice(0, 8)}`,
      })),
      decrypt: jest.fn((encrypted: string) => encrypted.replace('gcm:enc:', '')),
    };

    mockEventEmitter = new EventEmitter2();
    jest.spyOn(mockEventEmitter, 'emit');

    mockSubscriptionService = {
      getOrCreateSubscription: jest.fn().mockResolvedValue({
        plan: 'FREE',
      }),
    };

    mockAuth = {
      api: {
        getAccessToken: jest.fn(),
        refreshToken: jest.fn(),
      },
    };

    service = new ProviderConfigService(
      mockPrisma,
      mockCrypto,
      { exchangeCodeForTokens: jest.fn() } as any, // googleOAuth
      { exchangeCodeForTokens: jest.fn() } as any, // microsoftOAuth
      {} as any, // imap
      {} as any, // caldav
      mockSubscriptionService,
      mockEventEmitter,
      mockAuth,
    );
  });

  // =========================================================================
  // 1. Happy Path: Google Auto-Connect
  // =========================================================================

  it('auto-connects Google provider from Account tokens', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'google-account-1',
      providerId: 'google',
      refreshToken: '1//google-refresh-token-xyz',
      accessToken: 'encrypted-or-legacy-token-placeholder',
    });
    mockAuth.api.refreshToken.mockResolvedValue({
      providerId: 'google',
      accountId: 'google-account-1',
      accessToken: 'ya29.google-access-token-xyz',
      refreshToken: '1//google-refresh-token-xyz',
      accessTokenExpiresAt: new Date('2026-03-10T12:00:00Z'),
    });

    // No existing ProviderConfig
    mockPrisma.providerConfig.findUnique.mockResolvedValue(null);

    // Upsert returns the created config
    const createdConfig = {
      id: 'pc-1',
      tenantId: TEST_TENANT,
      userId: TEST_USER,
      providerType: 'google',
      email: TEST_EMAIL,
      supportsEmail: true,
      supportsCalendar: true,
      supportsContacts: true,
      accessToken: 'gcm:enc:ya29.goo',
      refreshToken: 'gcm:enc:1//googl',
      tokenEncryptionIv: 'iv-ya29.goo',
      refreshTokenEncryptionIv: 'iv-1//googl',
      tokenExpiresAt: new Date('2026-03-10T12:00:00Z'),
      isDefault: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.providerConfig.upsert.mockResolvedValue(createdConfig);

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    // Verify result is sanitized (no tokens in response)
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('tokenEncryptionIv');
    expect(result).not.toHaveProperty('refreshTokenEncryptionIv');
    expect(result).toHaveProperty('email', TEST_EMAIL);
    expect(result).toHaveProperty('providerType', 'google');

    expect(mockAuth.api.refreshToken).toHaveBeenCalledWith({
      body: {
        providerId: 'google',
        accountId: 'google-account-1',
        userId: TEST_USER,
      },
    });

    expect(mockCrypto.encrypt).toHaveBeenCalledWith('ya29.google-access-token-xyz');
    expect(mockCrypto.encrypt).toHaveBeenCalledWith('1//google-refresh-token-xyz');

    // Verify upsert was called with correct composite key
    expect(mockPrisma.providerConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_email_providerType: {
            tenantId: TEST_TENANT,
            email: TEST_EMAIL,
            providerType: 'google',
          },
        },
        create: expect.objectContaining({
          tenantId: TEST_TENANT,
          userId: TEST_USER,
          providerType: 'google',
          email: TEST_EMAIL,
          supportsEmail: true,
          supportsCalendar: true,
          supportsContacts: true,
          isDefault: true,
        }),
      }),
    );

    // Verify ProviderConnectedEvent emitted
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      ProviderConnectedEvent.eventName,
      expect.any(ProviderConnectedEvent),
    );
  });

  // =========================================================================
  // 2. Happy Path: Microsoft Auto-Connect
  // =========================================================================

  it('auto-connects Microsoft provider from Account tokens', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'microsoft-account-2',
      providerId: 'microsoft',
      refreshToken: 'M.R3_BAY.microsoft-refresh',
      accessToken: 'encrypted-or-legacy-token-placeholder',
    });
    mockAuth.api.refreshToken.mockResolvedValue({
      providerId: 'microsoft',
      accountId: 'microsoft-account-2',
      accessToken: 'eyJ0.microsoft-access-token',
      refreshToken: 'M.R3_BAY.microsoft-refresh',
      accessTokenExpiresAt: new Date('2026-03-10T13:00:00Z'),
    });

    mockPrisma.providerConfig.findUnique.mockResolvedValue(null);

    mockPrisma.providerConfig.upsert.mockResolvedValue({
      id: 'pc-2',
      tenantId: TEST_TENANT,
      userId: TEST_USER,
      providerType: 'microsoft',
      email: 'test@outlook.com',
      supportsEmail: true,
      supportsCalendar: true,
      supportsContacts: true,
      accessToken: 'gcm:enc:eyJ0.mic',
      refreshToken: 'gcm:enc:M.R3_BA',
      tokenEncryptionIv: 'iv-eyJ0.mic',
      refreshTokenEncryptionIv: 'iv-M.R3_BA',
      tokenExpiresAt: new Date('2026-03-10T13:00:00Z'),
      isDefault: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      'test@outlook.com',
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty('providerType', 'microsoft');
    expect(result).not.toHaveProperty('accessToken');

    // Verify Account query uses correct filters
    expect(mockPrisma.account.findFirst).toHaveBeenCalledWith({
      where: {
        userId: TEST_USER,
        providerId: { in: ['google', 'microsoft'] },
        OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        accountId: true,
        providerId: true,
        accessToken: true,
        refreshToken: true,
      },
    });
  });

  // =========================================================================
  // 3. Deduplication: Already Connected
  // =========================================================================

  it('returns existing provider if already connected (no duplicate)', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'google-account-1',
      providerId: 'google',
      accessToken: 'ya29.token',
      refreshToken: '1//refresh',
    });

    // Provider already exists and is active
    mockPrisma.providerConfig.findUnique.mockResolvedValue({
      id: 'pc-existing',
      tenantId: TEST_TENANT,
      userId: TEST_USER,
      providerType: 'google',
      email: TEST_EMAIL,
      isActive: true,
      accessToken: 'gcm:old-encrypted',
      refreshToken: 'gcm:old-encrypted',
      tokenEncryptionIv: 'old-iv',
      refreshTokenEncryptionIv: 'old-iv',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    // Returns existing, does NOT upsert
    expect(result).toHaveProperty('id', 'pc-existing');
    expect(mockPrisma.providerConfig.upsert).not.toHaveBeenCalled();
    expect(mockAuth.api.refreshToken).not.toHaveBeenCalled();
    expect(mockCrypto.encrypt).not.toHaveBeenCalled();

    // Does NOT emit event (no new connection)
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 4. No Social Account
  // =========================================================================

  it('returns null when no social account exists', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    expect(result).toBeNull();
    expect(mockPrisma.providerConfig.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.providerConfig.upsert).not.toHaveBeenCalled();
  });

  it('returns null when account has null accessToken', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'acc-empty',
      providerId: 'google',
      accessToken: null, // Token was revoked or never stored
      refreshToken: null,
    });

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    expect(result).toBeNull();
  });

  // =========================================================================
  // 5. Missing Refresh Token
  // =========================================================================

  it('handles missing refresh token gracefully', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'google-account-3',
      providerId: 'google',
      accessToken: 'ya29.short-lived-token',
      refreshToken: null, // No refresh token
    });
    mockAuth.api.getAccessToken.mockResolvedValue({
      accessToken: 'ya29.short-lived-token',
      accessTokenExpiresAt: new Date(),
    });

    mockPrisma.providerConfig.findUnique.mockResolvedValue(null);
    mockPrisma.providerConfig.upsert.mockResolvedValue({
      id: 'pc-no-refresh',
      tenantId: TEST_TENANT,
      userId: TEST_USER,
      providerType: 'google',
      email: TEST_EMAIL,
      accessToken: 'gcm:enc:ya29.sho',
      refreshToken: null,
      tokenEncryptionIv: 'iv-ya29.sho',
      refreshTokenEncryptionIv: null,
      isDefault: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    expect(result).toBeDefined();

    // Only access token encrypted, not refresh
    expect(mockCrypto.encrypt).toHaveBeenCalledTimes(1);
    expect(mockCrypto.encrypt).toHaveBeenCalledWith('ya29.short-lived-token');
    expect(mockAuth.api.getAccessToken).toHaveBeenCalledWith({
      body: {
        providerId: 'google',
        accountId: 'google-account-3',
        userId: TEST_USER,
      },
    });

    expect(mockPrisma.providerConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          refreshToken: null,
          refreshTokenEncryptionIv: null,
        }),
      }),
    );
  });

  // =========================================================================
  // 6. Provider Limit Exceeded
  // =========================================================================

  it('throws ForbiddenException when provider limit exceeded', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'google-account-1',
      providerId: 'google',
      accessToken: 'ya29.token',
      refreshToken: '1//refresh',
    });

    mockPrisma.providerConfig.findUnique.mockResolvedValue(null);

    // Already at max providers (free plan = 1)
    mockPrisma.providerConfig.count.mockResolvedValue(1);
    mockSubscriptionService.getOrCreateSubscription.mockResolvedValue({
      plan: 'FREE',
    });

    await expect(
      service.autoConnectSocialProvider(TEST_TENANT, TEST_USER, TEST_EMAIL),
    ).rejects.toThrow(/Maximum.*email account/);

    // Should NOT upsert
    expect(mockPrisma.providerConfig.upsert).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 7. Inactive Provider (Reconnect)
  // =========================================================================

  it('re-activates an inactive existing provider via upsert update', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'google-account-1',
      providerId: 'google',
      accessToken: 'encrypted-or-legacy-token-placeholder',
      refreshToken: '1//new-refresh',
    });
    mockAuth.api.refreshToken.mockResolvedValue({
      providerId: 'google',
      accountId: 'google-account-1',
      accessToken: 'ya29.new-token',
      refreshToken: '1//new-refresh',
      accessTokenExpiresAt: new Date('2026-03-11T00:00:00Z'),
    });

    // Existing but inactive
    mockPrisma.providerConfig.findUnique.mockResolvedValue({
      id: 'pc-inactive',
      tenantId: TEST_TENANT,
      providerType: 'google',
      email: TEST_EMAIL,
      isActive: false, // Deactivated
    });

    mockPrisma.providerConfig.upsert.mockResolvedValue({
      id: 'pc-inactive',
      tenantId: TEST_TENANT,
      userId: TEST_USER,
      providerType: 'google',
      email: TEST_EMAIL,
      isActive: true,
      accessToken: 'gcm:enc:ya29.new',
      refreshToken: 'gcm:enc:1//new-r',
      tokenEncryptionIv: 'iv-ya29.new',
      refreshTokenEncryptionIv: 'iv-1//new-r',
      tokenExpiresAt: new Date('2026-03-11T00:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    // Should upsert (update path reactivates)
    expect(mockPrisma.providerConfig.upsert).toHaveBeenCalled();
    expect(result).toBeDefined();

    // Event emitted for reconnected provider
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      ProviderConnectedEvent.eventName,
      expect.any(ProviderConnectedEvent),
    );
  });

  // =========================================================================
  // 8. Sanitization: No Sensitive Data Leaked
  // =========================================================================

  it('never exposes tokens, IVs, or encryption data in response', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({
      accountId: 'google-account-1',
      providerId: 'google',
      accessToken: 'encrypted-or-legacy-token-placeholder',
      refreshToken: 'SUPER_SECRET_REFRESH',
    });
    mockAuth.api.refreshToken.mockResolvedValue({
      providerId: 'google',
      accountId: 'google-account-1',
      accessToken: 'SUPER_SECRET_TOKEN',
      refreshToken: 'SUPER_SECRET_REFRESH',
      accessTokenExpiresAt: new Date(),
    });

    mockPrisma.providerConfig.findUnique.mockResolvedValue(null);

    mockPrisma.providerConfig.upsert.mockResolvedValue({
      id: 'pc-1',
      tenantId: TEST_TENANT,
      userId: TEST_USER,
      providerType: 'google',
      email: TEST_EMAIL,
      supportsEmail: true,
      supportsCalendar: true,
      supportsContacts: true,
      accessToken: 'gcm:enc:SUPER_SE',
      refreshToken: 'gcm:enc:SUPER_SE',
      tokenEncryptionIv: 'iv-SUPER_SE',
      refreshTokenEncryptionIv: 'iv-SUPER_SE',
      imapPassword: null,
      imapEncryptionIv: null,
      smtpPassword: null,
      smtpEncryptionIv: null,
      caldavPassword: null,
      caldavEncryptionIv: null,
      carddavPassword: null,
      carddavEncryptionIv: null,
      isDefault: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.autoConnectSocialProvider(
      TEST_TENANT,
      TEST_USER,
      TEST_EMAIL,
    );

    // Paranoid check: stringify and search for any secret fragment
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SUPER_SECRET');
    expect(serialized).not.toContain('gcm:enc:');
    expect(serialized).not.toContain('iv-');

    // Explicit property checks
    const sensitiveKeys = [
      'accessToken', 'refreshToken',
      'tokenEncryptionIv', 'refreshTokenEncryptionIv',
      'imapPassword', 'imapEncryptionIv',
      'smtpPassword', 'smtpEncryptionIv',
      'caldavPassword', 'caldavEncryptionIv',
      'carddavPassword', 'carddavEncryptionIv',
    ];
    for (const key of sensitiveKeys) {
      expect(result).not.toHaveProperty(key);
    }
  });

  // =========================================================================
  // 9. Account Query: Only Social Providers
  // =========================================================================

  it('only queries google and microsoft providers (not credential/passkey)', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);

    await service.autoConnectSocialProvider(TEST_TENANT, TEST_USER, TEST_EMAIL);

    expect(mockPrisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerId: { in: ['google', 'microsoft'] },
        }),
      }),
    );
  });

  it('picks the most recently updated account when multiple exist', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null);

    await service.autoConnectSocialProvider(TEST_TENANT, TEST_USER, TEST_EMAIL);

    expect(mockPrisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });
});
