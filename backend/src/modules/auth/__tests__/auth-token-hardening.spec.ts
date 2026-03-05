import { UnauthorizedException } from '@nestjs/common';
import { AuthTokenService } from '../services/auth-token.service';

jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: (fn: () => any) => fn(),
}));

describe('AuthTokenService - Rotation Hardening', () => {
  const baseExisting = {
    id: 'rt-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    familyId: 'family-1',
    tokenHash: 'hash-1',
    expiresAt: new Date(Date.now() + 60_000),
    isUsed: false,
    replacedBy: null as string | null,
    createdAt: new Date(Date.now() - 60_000),
    user: {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'User',
      lastName: 'One',
      role: 'admin',
      isActive: true,
      tenant: { isActive: true },
    },
  };

  function createService() {
    const tx = {
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(undefined),
      },
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    const prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      session: {
        delete: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    const jwt = {
      sign: jest.fn().mockReturnValue('new-access-token'),
    };

    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    const authConfig = {
      refreshTokenSecret: 'r'.repeat(48),
      sessionTtlMs: 86_400_000,
      maxSessionsPerUser: 5,
    };

    const service = new AuthTokenService(prisma as any, jwt as any, cache as any, authConfig as any);
    return { service, prisma, tx, jwt };
  }

  it('rejects refresh rotation when user is inactive', async () => {
    const { service, prisma } = createService();
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      ...baseExisting,
      user: { ...baseExisting.user, isActive: false },
    });

    await expect(service.rotateRefreshToken('raw-token')).rejects.toThrow(
      new UnauthorizedException('Account disabled'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects refresh rotation when tenant is inactive', async () => {
    const { service, prisma } = createService();
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      ...baseExisting,
      user: { ...baseExisting.user, tenant: { isActive: false } },
    });

    await expect(service.rotateRefreshToken('raw-token')).rejects.toThrow(
      new UnauthorizedException('Organization disabled'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not trigger family-theft purge for token reuse inside grace window', async () => {
    const { service, prisma } = createService();
    prisma.refreshToken.findUnique
      .mockResolvedValueOnce({
        ...baseExisting,
        isUsed: true,
        replacedBy: 'replacement-hash',
      })
      .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 2_000) });

    await expect(service.rotateRefreshToken('raw-token')).rejects.toThrow(
      new UnauthorizedException('Token already rotated'),
    );
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('purges token family for token reuse outside grace window', async () => {
    const { service, prisma } = createService();
    prisma.refreshToken.findUnique
      .mockResolvedValueOnce({
        ...baseExisting,
        isUsed: true,
        replacedBy: 'replacement-hash',
      })
      .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 20_000) });

    await expect(service.rotateRefreshToken('raw-token')).rejects.toThrow(
      new UnauthorizedException('Token already rotated'),
    );
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1' },
    });
  });

  it('aborts rotation when atomic mark-used gate fails (race safety)', async () => {
    const { service, prisma, tx } = createService();
    prisma.refreshToken.findUnique.mockResolvedValueOnce(baseExisting);
    tx.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.rotateRefreshToken('raw-token')).rejects.toThrow(
      new UnauthorizedException('Token already rotated'),
    );
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it('enforces session eviction when rotating refresh token at max session count', async () => {
    const { service, prisma, tx } = createService();
    prisma.refreshToken.findUnique.mockResolvedValueOnce(baseExisting);
    tx.session.findMany.mockResolvedValueOnce([
      { id: 's-1' },
      { id: 's-2' },
      { id: 's-3' },
      { id: 's-4' },
      { id: 's-5' },
    ]);

    const result = await service.rotateRefreshToken('raw-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBeTruthy();
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s-1'] } },
    });
    expect(tx.session.create).toHaveBeenCalled();
  });
});
