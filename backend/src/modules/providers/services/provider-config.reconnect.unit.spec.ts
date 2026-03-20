jest.mock('../../../common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

import { ProviderConfigService } from './provider-config.service';

describe('ProviderConfigService reconnect payloads', () => {
  const mockPrisma = {
    providerConfig: {
      count: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockCrypto = {
    encrypt: jest.fn((value: string) => ({ encrypted: `enc:${value}`, iv: `iv:${value}` })),
  };

  const mockGoogleOAuth = {
    exchangeCodeForTokens: jest.fn(),
  };

  const mockMicrosoftOAuth = {
    exchangeCodeForTokens: jest.fn(),
  };

  const mockImap = {
    testConnection: jest.fn(),
    testSmtpConnection: jest.fn(),
  };

  const mockCaldav = {
    testCalDavConnection: jest.fn(),
    testCardDavConnection: jest.fn(),
  };

  const mockSubscription = {
    getOrCreateSubscription: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockAuth = { api: {} };

  const createService = () =>
    new ProviderConfigService(
      mockPrisma as any,
      mockCrypto as any,
      mockGoogleOAuth as any,
      mockMicrosoftOAuth as any,
      mockImap as any,
      mockCaldav as any,
      mockSubscription as any,
      mockEventEmitter as any,
      mockAuth as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.providerConfig.count.mockResolvedValue(0);
    mockPrisma.providerConfig.upsert.mockResolvedValue({
      id: 'provider-1',
      tenantId: 'tenant-1',
      providerType: 'google',
      email: 'user@gmail.com',
      supportsEmail: true,
      supportsCalendar: true,
      supportsContacts: true,
      isDefault: true,
      isActive: true,
    });

    mockSubscription.getOrCreateSubscription.mockResolvedValue({ plan: 'FREE' });
    mockGoogleOAuth.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
      expiresAt: new Date('2026-03-20T10:00:00.000Z'),
      email: 'user@gmail.com',
    });
    mockMicrosoftOAuth.exchangeCodeForTokens.mockResolvedValue({
      accessToken: 'microsoft-access-token',
      refreshToken: 'microsoft-refresh-token',
      expiresAt: new Date('2026-03-20T10:00:00.000Z'),
      email: 'user@outlook.com',
    });
  });

  it('preserves existing Google flags when reconnect dto omits them', async () => {
    const service = createService();

    await service.connectGoogleProvider('tenant-1', 'user-1', {
      authorizationCode: 'google-auth-code',
      email: 'user@gmail.com',
    });

    expect(mockPrisma.providerConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          supportsCalendar: true,
          supportsContacts: true,
          isDefault: false,
        }),
        update: expect.objectContaining({
          supportsCalendar: undefined,
          supportsContacts: undefined,
          isDefault: undefined,
          isActive: true,
        }),
      }),
    );
  });

  it('preserves existing Microsoft flags when reconnect dto omits them', async () => {
    const service = createService();

    await service.connectMicrosoftProvider('tenant-1', 'user-1', {
      authorizationCode: 'microsoft-auth-code',
      email: 'user@outlook.com',
    });

    expect(mockPrisma.providerConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          supportsCalendar: true,
          supportsContacts: true,
          isDefault: false,
        }),
        update: expect.objectContaining({
          supportsCalendar: undefined,
          supportsContacts: undefined,
          isDefault: undefined,
          isActive: true,
        }),
      }),
    );
  });
});
