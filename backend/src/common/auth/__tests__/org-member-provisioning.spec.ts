import type { PrismaClient } from '@prisma/client';

// Mock better-auth ESM modules before importing the module under test
jest.mock('better-auth', () => ({ betterAuth: jest.fn() }));
jest.mock('better-auth/api', () => ({
  createAuthMiddleware: jest.fn((fn: any) => fn),
  APIError: class APIError extends Error {
    constructor(code: string, opts?: { message?: string }) {
      super(opts?.message ?? code);
    }
  },
}));
jest.mock('better-auth/adapters/prisma', () => ({ prismaAdapter: jest.fn() }));
jest.mock('better-auth/plugins', () => ({
  twoFactor: jest.fn(),
  organization: jest.fn(),
}));
jest.mock('@better-auth/passkey', () => ({ passkey: jest.fn() }));

// Mock sibling modules
jest.mock('../../../modules/compliance/legal.constants', () => ({
  CURRENT_PP_VERSION: '1.0',
  CURRENT_TOS_VERSION: '1.0',
}));
jest.mock('../../../modules/email/services/email.service', () => ({}));
jest.mock('../audit-hooks', () => ({ logAuthEvent: jest.fn() }));

// Mock withoutTenantScopingAsync to just execute the callback
jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => any) => fn()),
}));

import {
  provisionWorkspaceForUser,
  type ProvisioningUser,
} from '../better-auth.instance';

function createMockTx() {
  return {
    tenant: {
      create: jest.fn().mockResolvedValue({ id: 'tenant-123' }),
    },
    user: {
      update: jest.fn().mockResolvedValue({}),
    },
    member: {
      create: jest.fn().mockResolvedValue({}),
    },
    userPreferences: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    legalAcceptance: {
      createMany: jest.fn().mockResolvedValue({}),
    },
  };
}

function createMockPrisma(mockTx: ReturnType<typeof createMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

describe('Workspace Provisioning - Member Creation', () => {
  let mockTx: ReturnType<typeof createMockTx>;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockTx = createMockTx();
    mockPrisma = createMockPrisma(mockTx);
  });

  it('creates Member with role admin and organizationId matching the new tenant', async () => {
    const user: ProvisioningUser = {
      id: 'user-1',
      email: 'a@b.com',
      name: 'Test User',
      tenantId: null,
    };

    await provisionWorkspaceForUser(mockPrisma, user, { agreedToTerms: false });

    expect(mockTx.member.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'tenant-123',
        userId: 'user-1',
        role: 'admin',
      },
    });
  });

  it('sets userId on the Member record matching the input user.id', async () => {
    const user: ProvisioningUser = {
      id: 'user-42',
      email: 'test@example.com',
      name: 'Another User',
      tenantId: null,
    };

    await provisionWorkspaceForUser(mockPrisma, user, { agreedToTerms: false });

    expect(mockTx.member.create).toHaveBeenCalledTimes(1);
    const callArgs = mockTx.member.create.mock.calls[0][0];
    expect(callArgs.data.userId).toBe('user-42');
  });

  it('does NOT create Member if user already has tenantId (early return)', async () => {
    const user: ProvisioningUser = {
      id: 'user-1',
      email: 'a@b.com',
      name: 'Test',
      tenantId: 'existing-tenant',
    };

    await provisionWorkspaceForUser(mockPrisma, user, { agreedToTerms: false });

    expect(mockTx.member.create).not.toHaveBeenCalled();
  });
});
