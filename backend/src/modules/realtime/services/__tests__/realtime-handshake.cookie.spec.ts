import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RealtimeHandshakeService } from '../realtime-handshake.service';

jest.mock('../../../../common/auth/better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

describe('RealtimeHandshakeService', () => {
  function createService(overrides: {
    sessionResult?: any;
    persistedUser?: any;
    sessionError?: Error;
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
    } as any;

    return {
      service: new RealtimeHandshakeService(mockAuth, mockPrisma),
      mockAuth,
      mockPrisma,
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

  it('rejects missing sessions', async () => {
    const { service } = createService({ sessionResult: null });

    await expect(service.authenticate(createClient())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects inactive accounts', async () => {
    const { service } = createService({
      sessionResult: {
        session: { id: 'sess-1' },
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
        session: { id: 'sess-1' },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          tenantId: null,
          isActive: true,
        },
      },
    });

    await expect(service.authenticate(createClient())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects inactive organizations', async () => {
    const { service } = createService({
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
});
