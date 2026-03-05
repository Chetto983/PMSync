import { JwtStrategy } from '../strategies/jwt.strategy';

describe('JwtStrategy - Token Type Hardening', () => {
  function createStrategy() {
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
          lastActivityAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'user@example.com',
          firstName: 'User',
          lastName: 'One',
          role: 'admin',
          isActive: true,
          tenant: { isActive: true },
        }),
      },
    } as any;

    const cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as any;

    const authConfig = {
      isEs256Enabled: false,
      jwtSecret: 'a'.repeat(32),
      jwtLegacyHmacSecret: undefined,
      jwtPublicKey: undefined,
      idleTimeoutMs: 30 * 60 * 1000,
      lastActivityDebounceMs: 60 * 1000,
    } as any;

    return {
      strategy: new JwtStrategy(prisma, cacheService, authConfig),
      prisma,
      cacheService,
    };
  }

  it('rejects non-access token payloads', async () => {
    const { strategy, prisma } = createStrategy();

    const result = await strategy.validate({
      type: 'mfa-challenge',
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'sess-1',
    });

    expect(result).toBeNull();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('rejects payload without sessionId', async () => {
    const { strategy, prisma } = createStrategy();

    const result = await strategy.validate({
      type: 'access',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(result).toBeNull();
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('accepts valid access token payload with sessionId', async () => {
    const { strategy, cacheService } = createStrategy();

    const result = await strategy.validate({
      type: 'access',
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'sess-1',
      role: 'admin',
    });

    expect(result).toBeTruthy();
    expect(result.userId).toBe('user-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(cacheService.set).toHaveBeenCalled();
  });
});

