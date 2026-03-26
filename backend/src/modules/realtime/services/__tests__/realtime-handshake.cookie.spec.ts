import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RealtimeHandshakeService } from '../realtime-handshake.service';

jest.mock('../../../../common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

describe('RealtimeHandshakeService', () => {
  function createService(overrides: {
    sessionResult?: any;
    persistedUser?: any;
    membership?: any;
    sessionError?: Error;
    isRealtimeToken?: boolean;
    realtimeTokenResult?: any;
    realtimeTokenError?: Error;
  } = {}) {
    const mockAuth = {
      api: {
        getSession: overrides.sessionError
          ? jest.fn().mockRejectedValue(overrides.sessionError)
          : jest.fn().mockResolvedValue(
              Object.prototype.hasOwnProperty.call(overrides, 'sessionResult')
                ? overrides.sessionResult
                : {
                    session: { id: 'sess-1' },
                    user: {
                      id: 'user-1',
                      email: 'user@example.com',
                      tenantId: 'tenant-1',
                      isActive: true,
                    },
                  },
            ),
      },
    };

    const mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'persistedUser')
            ? overrides.persistedUser
            : {
                id: 'user-1',
                tenantId: 'tenant-1',
                tenant: { isActive: true },
              },
        ),
      },
      member: {
        findFirst: jest.fn().mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'membership')
            ? overrides.membership
            : {
                organizationId: 'tenant-2',
                organization: { isActive: true },
              },
        ),
      },
    } as any;

    const mockRealtimeAuthTokenService = {
      isRealtimeAuthToken: jest.fn().mockImplementation((token: string) =>
        Object.prototype.hasOwnProperty.call(overrides, 'isRealtimeToken')
          ? overrides.isRealtimeToken
          : token.startsWith('pmsync.ws.'),
      ),
      verifyToken: overrides.realtimeTokenError
        ? jest.fn().mockRejectedValue(overrides.realtimeTokenError)
        : jest.fn().mockResolvedValue(
            Object.prototype.hasOwnProperty.call(overrides, 'realtimeTokenResult')
              ? overrides.realtimeTokenResult
              : {
                  session: { id: 'sess-1', activeOrganizationId: 'tenant-1' },
                  user: {
                    id: 'user-1',
                    email: 'user@example.com',
                    tenantId: 'tenant-1',
                    isActive: true,
                  },
                },
          ),
    };

    return {
      service: new RealtimeHandshakeService(
        mockAuth,
        mockPrisma,
        mockRealtimeAuthTokenService,
      ),
      mockAuth,
      mockPrisma,
      mockRealtimeAuthTokenService,
    };
  }

  function createClient(overrides: {
    cookie?: string;
    authorization?: string;
    authToken?: string;
  } = {}): any {
    return {
      id: 'client-1',
      handshake: {
        headers: {
          ...(overrides.cookie ? { cookie: overrides.cookie } : {}),
          ...(overrides.authorization ? { authorization: overrides.authorization } : {}),
        },
        auth: overrides.authToken ? { token: overrides.authToken } : {},
      },
    };
  }

  it('passes cookie headers to Better Auth and disables cookie cache', async () => {
    const { service, mockAuth } = createService();

    await service.authenticate(
      createClient({
        cookie: 'better-auth.session_token=session-token',
      }),
    );

    expect(mockAuth.api.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: {
        disableCookieCache: true,
      },
    });
  });

  it('maps auth.token to an Authorization header for non-cookie clients', async () => {
    const { service, mockAuth } = createService();

    await service.authenticate(
      createClient({
        authToken: 'opaque-session-token',
      }),
    );

    const [{ headers }] = mockAuth.api.getSession.mock.calls[0];
    expect(headers.get('authorization')).toBe('Bearer opaque-session-token');
  });

  it('uses verified realtime auth tokens instead of Better Auth session lookup', async () => {
    const { service, mockAuth, mockRealtimeAuthTokenService } = createService({
      realtimeTokenResult: {
        session: { id: 'sess-1', activeOrganizationId: 'tenant-2' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          isActive: true,
        },
      },
    });

    const result = await service.authenticate(
      createClient({
        authToken: 'pmsync.ws.payload.signature',
      }),
    );

    expect(mockRealtimeAuthTokenService.verifyToken).toHaveBeenCalledWith(
      'pmsync.ws.payload.signature',
    );
    expect(mockAuth.api.getSession).not.toHaveBeenCalled();
    expect(result.tenantId).toBe('tenant-2');
  });

  it('rejects missing sessions', async () => {
    const { service } = createService({ sessionResult: null });

    await expect(service.authenticate(createClient())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects inactive accounts', async () => {
    const { service } = createService({
      sessionResult: {
        session: { id: 'sess-1', activeOrganizationId: null },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          isActive: false,
        },
      },
    });

    await expect(service.authenticate(createClient())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects users without tenant assignment', async () => {
    const { service } = createService({
      sessionResult: {
        session: { id: 'sess-1', activeOrganizationId: null },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: null,
          isActive: true,
        },
      },
      persistedUser: {
        id: 'user-1',
        tenantId: null,
        tenant: null,
      },
    });

    await expect(service.authenticate(createClient())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects inactive organizations', async () => {
    const { service } = createService({
      sessionResult: {
        session: { id: 'sess-1', activeOrganizationId: null },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          isActive: true,
        },
      },
      persistedUser: {
        id: 'user-1',
        tenantId: 'tenant-1',
        tenant: { isActive: false },
      },
    });

    await expect(service.authenticate(createClient())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('authenticates when the Better Auth session and tenant checks pass', async () => {
    const { service } = createService();

    const result = await service.authenticate(createClient());

    expect(result).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      tenantRoom: 'tenant:tenant-1',
    });
  });

  it('uses activeOrganizationId for cross-org websocket membership', async () => {
    const { service, mockPrisma } = createService({
      sessionResult: {
        session: { id: 'sess-1', activeOrganizationId: 'tenant-2' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          isActive: true,
        },
      },
    });

    const result = await service.authenticate(createClient());

    expect(mockPrisma.member.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'tenant-2',
      },
      select: {
        organizationId: true,
        organization: {
          select: { isActive: true },
        },
      },
    });
    expect(result.tenantId).toBe('tenant-2');
    expect(result.tenantRoom).toBe('tenant:tenant-2');
  });

  it('falls back to the persisted tenant when activeOrganizationId has no matching membership', async () => {
    const { service } = createService({
      sessionResult: {
        session: { id: 'sess-1', activeOrganizationId: 'tenant-2' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          isActive: true,
        },
      },
      membership: null,
    });

    await expect(service.authenticate(createClient())).resolves.toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      tenantRoom: 'tenant:tenant-1',
    });
  });

  it('falls back to the persisted tenant when activeOrganizationId points to an inactive org', async () => {
    const { service } = createService({
      sessionResult: {
        session: { id: 'sess-1', activeOrganizationId: 'tenant-2' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          isActive: true,
        },
      },
      membership: {
        organizationId: 'tenant-2',
        organization: { isActive: false },
      },
    });

    await expect(service.authenticate(createClient())).resolves.toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      tenantRoom: 'tenant:tenant-1',
    });
  });
});
