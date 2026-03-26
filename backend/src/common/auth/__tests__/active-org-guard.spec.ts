// Tests for BetterAuthGuard activeOrganizationId mapping (ORG-04, ORG-05)

jest.mock('../better-auth.module', () => ({
  BETTER_AUTH: 'BETTER_AUTH',
}));

import { BetterAuthGuard } from '../better-auth.guard';
import { Reflector } from '@nestjs/core';

describe('BetterAuthGuard - activeOrganizationId', () => {
  let guard: BetterAuthGuard;
  let reflector: Reflector;
  let mockAuth: { api: { getSession: jest.Mock } };
  let mockPrisma: { member: { findFirst: jest.Mock } };

  const createMockContext = (headers: Record<string, string> = {}) => {
    const request = { headers, user: undefined as any };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as any;
  };

  beforeEach(() => {
    mockAuth = { api: { getSession: jest.fn() } };
    mockPrisma = {
      member: {
        findFirst: jest.fn(),
      },
    };
    reflector = new Reflector();
    guard = new BetterAuthGuard(mockAuth, reflector, mockPrisma as any);
  });

  it('should use activeOrganizationId as tenantId when set on session', async () => {
    const ctx = createMockContext({
      cookie: 'better-auth.session_token=abc',
    });
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1', activeOrganizationId: 'org-123' },
      user: {
        id: 'user-1',
        email: 'test@x.com',
        tenantId: 'tenant-456',
        role: 'admin',
        isActive: true,
      },
    });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockPrisma.member.findFirst.mockResolvedValue({
      organizationId: 'org-123',
      organization: { isActive: true },
    });

    await guard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest();
    expect(request.user.tenantId).toBe('org-123');
  });

  it('should fall back to user.tenantId when activeOrganizationId is null', async () => {
    const ctx = createMockContext({
      cookie: 'better-auth.session_token=abc',
    });
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1', activeOrganizationId: null },
      user: {
        id: 'user-1',
        email: 'test@x.com',
        tenantId: 'tenant-456',
        role: 'admin',
        isActive: true,
      },
    });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await guard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest();
    expect(request.user.tenantId).toBe('tenant-456');
  });

  it('should fall back to user.tenantId when activeOrganizationId is undefined', async () => {
    const ctx = createMockContext({
      cookie: 'better-auth.session_token=abc',
    });
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: {
        id: 'user-1',
        email: 'test@x.com',
        tenantId: 'tenant-789',
        role: 'admin',
        isActive: true,
      },
    });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await guard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest();
    expect(request.user.tenantId).toBe('tenant-789');
  });

  it('should fall back to user.tenantId when activeOrganizationId has no matching membership', async () => {
    const ctx = createMockContext({
      cookie: 'better-auth.session_token=abc',
    });
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1', activeOrganizationId: 'ghost-org' },
      user: {
        id: 'user-1',
        email: 'test@x.com',
        tenantId: 'tenant-456',
        role: 'admin',
        isActive: true,
      },
    });
    mockPrisma.member.findFirst.mockResolvedValue(null);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await guard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest();
    expect(request.user.tenantId).toBe('tenant-456');
  });

  it('should fall back to user.tenantId when activeOrganizationId points to an inactive org', async () => {
    const ctx = createMockContext({
      cookie: 'better-auth.session_token=abc',
    });
    mockAuth.api.getSession.mockResolvedValue({
      session: { id: 'sess-1', activeOrganizationId: 'inactive-org' },
      user: {
        id: 'user-1',
        email: 'test@x.com',
        tenantId: 'tenant-456',
        role: 'admin',
        isActive: true,
      },
    });
    mockPrisma.member.findFirst.mockResolvedValue({
      organizationId: 'inactive-org',
      organization: { isActive: false },
    });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    await guard.canActivate(ctx);
    const request = ctx.switchToHttp().getRequest();
    expect(request.user.tenantId).toBe('tenant-456');
  });
});
