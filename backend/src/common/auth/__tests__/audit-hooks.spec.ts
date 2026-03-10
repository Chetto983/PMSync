 

// Mock tenant scoping before imports
jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => any) => fn()),
}));

// Mock getRequestIp (moved from better-auth.instance to common/utils)
jest.mock('../../utils/request.utils', () => ({
  getRequestIp: jest.fn((req: any) => {
    if (!req) return undefined;
    const xff = req.headers?.get?.('x-forwarded-for');
    return xff ? xff.split(',')[0].trim() : undefined;
  }),
}));

import { logAuthEvent } from '../audit-hooks';

describe('logAuthEvent', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
  });

  const makeRequest = (
    ip = '1.2.3.4',
    userAgent = 'test-agent',
  ): Request => {
    return new Request('http://localhost', {
      headers: {
        'x-forwarded-for': ip,
        'user-agent': userAgent,
      },
    });
  };

  it('creates AuditLog with AUTH:LOGIN for /sign-in/email', async () => {
    await logAuthEvent(mockPrisma, '/sign-in/email', 'user-1', 'tenant-1', makeRequest());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'AUTH:LOGIN',
        entity: 'BetterAuth',
        entityId: 'user-1',
        tenantId: 'tenant-1',
      }),
    });
  });

  it('creates AuditLog with AUTH:SIGNUP for /sign-up/email', async () => {
    await logAuthEvent(mockPrisma, '/sign-up/email', 'user-2', 'tenant-2', makeRequest());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'AUTH:SIGNUP',
        entity: 'BetterAuth',
        tenantId: 'tenant-2',
      }),
    });
  });

  it('creates AuditLog with AUTH:LOGOUT for /sign-out', async () => {
    await logAuthEvent(mockPrisma, '/sign-out', 'user-3', 'tenant-3', makeRequest());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'AUTH:LOGOUT',
        tenantId: 'tenant-3',
      }),
    });
  });

  it('creates AuditLog with AUTH:2FA_ENABLE for /two-factor/enable', async () => {
    await logAuthEvent(mockPrisma, '/two-factor/enable', 'user-4', 'tenant-4', makeRequest());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'AUTH:2FA_ENABLE',
        tenantId: 'tenant-4',
      }),
    });
  });

  it('creates AuditLog with AUTH:SOCIAL_LOGIN for /callback/google', async () => {
    await logAuthEvent(mockPrisma, '/callback/google', 'user-5', 'tenant-5', makeRequest());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'AUTH:SOCIAL_LOGIN',
        tenantId: 'tenant-5',
      }),
    });
  });

  it('creates AuditLog with AUTH:PASSKEY_REMOVE for /passkey/delete/abc123 (wildcard)', async () => {
    await logAuthEvent(mockPrisma, '/passkey/delete/abc123', 'user-6', 'tenant-6', makeRequest());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'AUTH:PASSKEY_REMOVE',
        tenantId: 'tenant-6',
      }),
    });
  });

  it('returns early without creating AuditLog when tenantId is null', async () => {
    await logAuthEvent(mockPrisma, '/sign-in/email', 'user-7', null, makeRequest());

    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns early without creating AuditLog for unrecognized path', async () => {
    await logAuthEvent(mockPrisma, '/some/random/path', 'user-8', 'tenant-8', makeRequest());

    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('catches Prisma errors silently (fire-and-forget)', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

    // Should not throw
    await expect(
      logAuthEvent(mockPrisma, '/sign-in/email', 'user-9', 'tenant-9', makeRequest()),
    ).resolves.toBeUndefined();
  });

  it('passes metadata as changes field in AuditLog', async () => {
    const metadata = { userAgent: 'Mozilla/5.0', action: 'login-attempt' };

    await logAuthEvent(mockPrisma, '/sign-in/email', 'user-10', 'tenant-10', makeRequest(), metadata);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: metadata,
        tenantId: 'tenant-10',
      }),
    });
  });
});
