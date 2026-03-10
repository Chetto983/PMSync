import { UnauthorizedException } from '@nestjs/common';
import {
  RealtimeAuthTokenService,
} from '../realtime-auth-token.service';

describe('RealtimeAuthTokenService', () => {
  const originalSecret = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-for-realtime';
  });

  afterEach(() => {
    process.env.BETTER_AUTH_SECRET = originalSecret;
  });

  function createService(sessionOverride?: any) {
    const mockPrisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(
          sessionOverride ?? {
            id: 'sess-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 60_000),
            activeOrganizationId: 'tenant-2',
            user: {
              id: 'user-1',
              email: 'user@example.com',
              tenantId: 'tenant-1',
              isActive: true,
            },
          },
        ),
      },
    } as any;

    return {
      service: new RealtimeAuthTokenService(mockPrisma),
      mockPrisma,
    };
  }

  it('issues and verifies a signed realtime auth token bound to the session context', async () => {
    const { service, mockPrisma } = createService();

    const issued = service.issueToken({
      userId: 'user-1',
      sessionId: 'sess-1',
      tenantId: 'tenant-2',
    });

    expect(service.isRealtimeAuthToken(issued.token)).toBe(true);

    const verified = await service.verifyToken(issued.token);

    expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        activeOrganizationId: true,
        user: {
          select: {
            id: true,
            email: true,
            tenantId: true,
            isActive: true,
          },
        },
      },
    });
    expect(verified).toEqual({
      session: {
        id: 'sess-1',
        activeOrganizationId: 'tenant-2',
      },
      user: {
        id: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        isActive: true,
      },
    });
  });

  it('rejects tokens when the session context has changed since issuance', async () => {
    const { service } = createService({
      id: 'sess-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      activeOrganizationId: 'tenant-9',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        isActive: true,
      },
    });

    const issued = service.issueToken({
      userId: 'user-1',
      sessionId: 'sess-1',
      tenantId: 'tenant-2',
    });

    await expect(service.verifyToken(issued.token)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
