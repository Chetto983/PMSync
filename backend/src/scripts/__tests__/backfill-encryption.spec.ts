import { backfillEncryptModel } from '../backfill-encryption';
import { isEncrypted, ENCRYPTION_PREFIX } from '../../prisma/encryption/field-encryption.utils';

// Silence logs during tests
const noop = () => {};

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
    },
    email: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as import('@prisma/client').PrismaClient;
}

function createMockKeyService() {
  const fakeKey = Buffer.alloc(32, 'a');
  return {
    getCurrentKey: jest.fn().mockReturnValue(fakeKey),
    isEnabled: true,
  } as unknown as import('../../common/services/tenant-key.service').TenantKeyService;
}

describe('backfillEncryptModel', () => {
  it('skips records where all fields are already encrypted', async () => {
    const mockPrisma = createMockPrisma();
    const email = mockPrisma.email as unknown as {
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };

    email.count.mockResolvedValue(2);
    email.findMany.mockResolvedValueOnce([
      { id: 'e1', tenantId: 'tenant-1', bodyText: `${ENCRYPTION_PREFIX}abc`, bodyHtml: `${ENCRYPTION_PREFIX}def`, snippet: `${ENCRYPTION_PREFIX}ghi` },
      { id: 'e2', tenantId: 'tenant-1', bodyText: `${ENCRYPTION_PREFIX}xyz`, bodyHtml: null, snippet: `${ENCRYPTION_PREFIX}uvw` },
    ]).mockResolvedValueOnce([]);

    const result = await backfillEncryptModel(
      mockPrisma,
      createMockKeyService(),
      'Email',
      ['bodyText', 'bodyHtml', 'snippet'],
      { logger: noop },
    );

    expect(result.totalEncrypted).toBe(0);
    expect(email.update).not.toHaveBeenCalled();
  });

  it('encrypts plaintext fields and skips null fields', async () => {
    const mockPrisma = createMockPrisma();
    const email = mockPrisma.email as unknown as {
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };

    email.count.mockResolvedValue(1);
    email.findMany.mockResolvedValueOnce([
      { id: 'e1', tenantId: 'tenant-1', bodyText: 'Hello world', bodyHtml: null, snippet: 'Hello' },
    ]).mockResolvedValueOnce([]);

    const result = await backfillEncryptModel(
      mockPrisma,
      createMockKeyService(),
      'Email',
      ['bodyText', 'bodyHtml', 'snippet'],
      { logger: noop },
    );

    expect(result.totalEncrypted).toBe(1);
    expect(email.update).toHaveBeenCalledTimes(1);

    const updateCall = email.update.mock.calls[0][0];
    // bodyText and snippet should be encrypted (enc: prefix)
    expect(isEncrypted(updateCall.data.bodyText)).toBe(true);
    expect(isEncrypted(updateCall.data.snippet)).toBe(true);
    // bodyHtml was null, should NOT be in data
    expect(updateCall.data.bodyHtml).toBeUndefined();
  });

  it('processes multiple batches', async () => {
    const mockPrisma = createMockPrisma();
    const email = mockPrisma.email as unknown as {
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    const $transaction = mockPrisma.$transaction as jest.Mock;

    const batchSize = 2;
    email.count.mockResolvedValue(4);
    // Batch 1: 2 records
    email.findMany.mockResolvedValueOnce([
      { id: 'e1', tenantId: 'tenant-1', bodyText: 'text1' },
      { id: 'e2', tenantId: 'tenant-1', bodyText: 'text2' },
    ]);
    // Batch 2: 2 records
    email.findMany.mockResolvedValueOnce([
      { id: 'e3', tenantId: 'tenant-1', bodyText: 'text3' },
      { id: 'e4', tenantId: 'tenant-1', bodyText: 'text4' },
    ]);
    // Batch 3: empty (end of records)
    email.findMany.mockResolvedValueOnce([]);

    const result = await backfillEncryptModel(
      mockPrisma,
      createMockKeyService(),
      'Email',
      ['bodyText'],
      { batchSize, logger: noop },
    );

    expect(result.totalProcessed).toBe(4);
    expect(result.totalEncrypted).toBe(4);
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('handles empty tenant (no records)', async () => {
    const mockPrisma = createMockPrisma();
    const email = mockPrisma.email as unknown as {
      count: jest.Mock;
      findMany: jest.Mock;
    };

    email.count.mockResolvedValue(0);

    const result = await backfillEncryptModel(
      mockPrisma,
      createMockKeyService(),
      'Email',
      ['bodyText', 'bodyHtml', 'snippet'],
      { logger: noop },
    );

    expect(result.totalProcessed).toBe(0);
    expect(result.totalEncrypted).toBe(0);
    expect(email.findMany).not.toHaveBeenCalled();
  });

  it('uses correct composite PK in update where clause', async () => {
    const mockPrisma = createMockPrisma();
    const email = mockPrisma.email as unknown as {
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };

    email.count.mockResolvedValue(1);
    email.findMany.mockResolvedValueOnce([
      { id: 'email-123', tenantId: 'tenant-1', bodyText: 'plaintext' },
    ]).mockResolvedValueOnce([]);

    await backfillEncryptModel(
      mockPrisma,
      createMockKeyService(),
      'Email',
      ['bodyText'],
      { logger: noop },
    );

    expect(email.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: {
            id: 'email-123',
            tenantId: 'tenant-1',
          },
        },
      }),
    );
  });

  it('processes all tenants with per-tenant key derivation', async () => {
    const tenants = [{ id: 'tenant-a' }, { id: 'tenant-b' }, { id: 'tenant-c' }];
    const tenantFindMany = jest.fn().mockResolvedValue(tenants);

    const emailMock = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    // Each tenant: one batch of 1 record, then empty
    for (const tenant of tenants) {
      emailMock.findMany
        .mockResolvedValueOnce([{ id: `e-${tenant.id}`, tenantId: tenant.id, bodyText: 'secret' }])
        .mockResolvedValueOnce([]);
    }

    const mockPrisma = {
      tenant: { findMany: tenantFindMany },
      email: emailMock,
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as import('@prisma/client').PrismaClient;

    const keyService = createMockKeyService();

    await backfillEncryptModel(
      mockPrisma,
      keyService,
      'Email',
      ['bodyText'],
      { logger: noop },
    );

    // Key derived for each tenant
    expect(keyService.getCurrentKey).toHaveBeenCalledTimes(3);
    expect(keyService.getCurrentKey).toHaveBeenCalledWith('tenant-a');
    expect(keyService.getCurrentKey).toHaveBeenCalledWith('tenant-b');
    expect(keyService.getCurrentKey).toHaveBeenCalledWith('tenant-c');
  });
});
