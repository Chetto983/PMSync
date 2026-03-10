 
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock better-auth.module to avoid pulling in the full better-auth ESM chain
jest.mock('../better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

// Mock tenant-scoping
jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => any) => fn()),
}));

// Mock better-auth/node
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers: any) => headers),
}));

import { BetterAuthGuard } from '../better-auth.guard';
import { RolesGuard } from '../roles.guard';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { ROLES_KEY } from '../roles.decorator';

// ─── Helpers ────────────────────────────────────────────────────────

function createMockContext(
  headers: Record<string, string> = {},
  user?: any,
): { ctx: ExecutionContext; getRequest: () => any } {
  const request: any = { headers, user, path: '/test' };

  const ctx = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;

  return { ctx, getRequest: () => request };
}

function validSessionResult(overrides: Record<string, any> = {}) {
  return {
    session: { id: 'sess-1' },
    user: {
      id: 'user-1',
      email: 'test@example.com',
      tenantId: 'tenant-1',
      firstName: 'John',
      lastName: 'Doe',
      role: 'member',
      isActive: true,
      ...overrides,
    },
  };
}

// ─── BetterAuthGuard ────────────────────────────────────────────────

describe('BetterAuthGuard - auth flow integration', () => {
  let guard: BetterAuthGuard;
  let reflector: Reflector;
  let mockAuth: { api: { getSession: jest.Mock } };

  beforeEach(() => {
    mockAuth = { api: { getSession: jest.fn() } };
    reflector = new Reflector();
    guard = new BetterAuthGuard(mockAuth, reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  });

  it('allows request with valid session cookie', async () => {
    const { ctx } = createMockContext({ cookie: 'better-auth.session_token=abc' });
    mockAuth.api.getSession.mockResolvedValue(validSessionResult());

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockAuth.api.getSession).toHaveBeenCalled();
  });

  it('rejects request with no session cookie (returns 401)', async () => {
    const { ctx } = createMockContext({});
    mockAuth.api.getSession.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects request with expired session (getSession returns null)', async () => {
    const { ctx } = createMockContext({ cookie: 'better-auth.session_token=expired' });
    mockAuth.api.getSession.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired session');
  });

  it('attaches correct user shape to request (id, email, tenantId, role)', async () => {
    const { ctx, getRequest } = createMockContext({ cookie: 'better-auth.session_token=abc' });
    mockAuth.api.getSession.mockResolvedValue(
      validSessionResult({
        id: 'user-42',
        email: 'jane@example.com',
        tenantId: 'tenant-99',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'admin',
      }),
    );

    await guard.canActivate(ctx);

    const request = getRequest();
    expect(request.user).toEqual({
      id: 'user-42',
      userId: 'user-42',
      tenantId: 'tenant-99',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'admin',
      sessionId: 'sess-1',
    });
  });

  it('rejects inactive user (isActive=false) with 401', async () => {
    const { ctx } = createMockContext({ cookie: 'better-auth.session_token=abc' });
    mockAuth.api.getSession.mockResolvedValue(
      validSessionResult({ isActive: false }),
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow('Account is deactivated');
  });

  it('session validation includes tenantId from better-auth additionalFields', async () => {
    const { ctx, getRequest } = createMockContext({ cookie: 'better-auth.session_token=abc' });
    mockAuth.api.getSession.mockResolvedValue(
      validSessionResult({ tenantId: 'my-tenant-id' }),
    );

    await guard.canActivate(ctx);

    expect(getRequest().user.tenantId).toBe('my-tenant-id');
  });

  it('@Public() decorated route bypasses BetterAuthGuard', async () => {
    const { ctx } = createMockContext({});
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockAuth.api.getSession).not.toHaveBeenCalled();
  });
});

// ─── TenantGuard (simplified - no DB) ──────────────────────────────

describe('TenantGuard - tenantId validation', () => {
  it('rejects request when tenantId is missing from user and headers', async () => {
    // TenantGuard throws BadRequestException when no tenantId
    const { TenantGuard } = await import('../tenant.guard');

    const mockPrisma = {} as any;
    const guard = new TenantGuard(mockPrisma);

    const { ctx } = createMockContext(
      {},
      { userId: 'user-1', tenantId: null, role: 'member' },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow('Tenant ID not found in request');
  });
});

// ─── RolesGuard ─────────────────────────────────────────────────────

describe('RolesGuard - role-based access', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows request when user has required role', () => {
    const { ctx } = createMockContext(
      {},
      { userId: 'user-1', role: 'admin' },
    );

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'super-admin']);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects request when user lacks required role', () => {
    const { ctx } = createMockContext(
      {},
      { userId: 'user-1', role: 'member' },
    );

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'super-admin']);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
