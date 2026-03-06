import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock better-auth.module to avoid pulling in the full better-auth ESM chain
jest.mock('../better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

import { BetterAuthGuard } from '../better-auth.guard';
import { IS_PUBLIC_KEY } from '../public.decorator';

describe('BetterAuthGuard', () => {
  let guard: BetterAuthGuard;
  let reflector: Reflector;
  let mockAuth: { api: { getSession: jest.Mock } };

  const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const request = {
      headers,
      user: undefined as any,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockAuth = {
      api: {
        getSession: jest.fn(),
      },
    };

    reflector = new Reflector();
    guard = new BetterAuthGuard(mockAuth, reflector);
  });

  it('should return true and set request.user for a valid session', async () => {
    const ctx = createMockContext({ cookie: 'better-auth.session_token=abc' });

    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        tenantId: 'tenant-1',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        isActive: true,
      },
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);

    const request = ctx.switchToHttp().getRequest();
    expect(request.user).toEqual({
      id: 'user-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'admin',
      sessionId: 'sess-1',
    });
  });

  it('should throw UnauthorizedException when session is null', async () => {
    const ctx = createMockContext({});

    mockAuth.api.getSession.mockResolvedValue(null);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired session');
  });

  it('should return true without calling getSession for @Public() routes', async () => {
    const ctx = createMockContext({});

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockAuth.api.getSession).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when user.isActive is false', async () => {
    const ctx = createMockContext({ cookie: 'better-auth.session_token=abc' });

    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        tenantId: 'tenant-1',
        firstName: null,
        lastName: null,
        role: 'member',
        isActive: false,
      },
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Account is deactivated');
  });

  it('should set userId equal to id for backward compatibility', async () => {
    const ctx = createMockContext({ cookie: 'better-auth.session_token=abc' });

    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-99' },
      user: {
        id: 'user-42',
        email: 'compat@example.com',
        tenantId: 'tenant-2',
        firstName: null,
        lastName: null,
        role: 'member',
        isActive: true,
      },
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await guard.canActivate(ctx);

    const request = ctx.switchToHttp().getRequest();
    expect(request.user.userId).toBe(request.user.id);
    expect(request.user.userId).toBe('user-42');
  });

  it('should default role to "member" when session.user.role is undefined', async () => {
    const ctx = createMockContext({ cookie: 'better-auth.session_token=abc' });

    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: {
        id: 'user-1',
        email: 'norole@example.com',
        tenantId: 'tenant-1',
        firstName: 'Jane',
        lastName: null,
        role: undefined,
        isActive: true,
      },
    });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await guard.canActivate(ctx);

    const request = ctx.switchToHttp().getRequest();
    expect(request.user.role).toBe('member');
  });

  it('should use IS_PUBLIC_KEY when checking reflector metadata', async () => {
    const ctx = createMockContext({});

    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await guard.canActivate(ctx);

    expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });
});
