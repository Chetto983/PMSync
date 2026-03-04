import { randomBytes } from 'crypto';
import { hmacForBlindIndex } from '../../prisma/encryption/field-encryption.utils';

const FIXED_HMAC_KEY = randomBytes(32);

const mockTenantKeyService = {
  getHmacKey: jest.fn().mockReturnValue(FIXED_HMAC_KEY),
  getCurrentKey: jest.fn().mockReturnValue(randomBytes(32)),
  getDecryptionKeys: jest.fn().mockReturnValue([randomBytes(32)]),
  isEnabled: true,
  clearCache: jest.fn(),
};

describe('backfillFromHash', () => {
  let backfillFromHash: typeof import('../backfill-from-hash').backfillFromHash;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../backfill-from-hash');
    backfillFromHash = mod.backfillFromHash;
  });

  function createMockPrisma(emails: Record<string, unknown>[]) {
    const updatedRows: Record<string, unknown>[] = [];

    return {
      tenant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
      },
      email: {
        count: jest.fn().mockResolvedValue(emails.length),
        findMany: jest.fn().mockImplementation(({ skip }) => {
          if (skip >= emails.length) return Promise.resolve([]);
          return Promise.resolve(emails.slice(skip));
        }),
        update: jest.fn().mockImplementation((args: Record<string, unknown>) => {
          updatedRows.push(args);
          return Promise.resolve({});
        }),
      },
      $transaction: jest.fn().mockImplementation((promises: Promise<unknown>[]) =>
        Promise.all(promises),
      ),
      _updatedRows: updatedRows,
    };
  }

  it('populates fromHash for emails with fromHash=null', async () => {
    const emails = [
      { id: 'e1', tenantId: 'tenant-1', from: 'alice@test.com', fromHash: null },
      { id: 'e2', tenantId: 'tenant-1', from: 'bob@test.com', fromHash: null },
      { id: 'e3', tenantId: 'tenant-1', from: 'carol@test.com', fromHash: null },
    ];
    const mockPrisma = createMockPrisma(emails);
    const logs: string[] = [];

    const result = await backfillFromHash(
      mockPrisma as any,
      mockTenantKeyService as any,
      { logger: (msg: string) => logs.push(msg) },
    );

    expect(result.totalProcessed).toBe(3);
    expect(result.totalHashed).toBe(3);
    expect(mockPrisma.email.update).toHaveBeenCalledTimes(3);

    // Check first update has correct hash
    const firstCall = mockPrisma.email.update.mock.calls[0][0] as Record<string, unknown>;
    const data = firstCall.data as Record<string, string>;
    expect(data.fromHash).toBe(hmacForBlindIndex('alice@test.com', FIXED_HMAC_KEY));
  });

  it('skips emails with fromHash already set (idempotent)', async () => {
    const emails = [
      { id: 'e1', tenantId: 'tenant-1', from: 'alice@test.com', fromHash: 'already-hashed' },
      { id: 'e2', tenantId: 'tenant-1', from: 'bob@test.com', fromHash: null },
    ];
    const mockPrisma = createMockPrisma(emails);

    const result = await backfillFromHash(
      mockPrisma as any,
      mockTenantKeyService as any,
      { logger: () => {} },
    );

    expect(result.totalProcessed).toBe(2);
    expect(result.totalHashed).toBe(1); // only bob
  });

  it('respects --dry-run flag (no writes)', async () => {
    const emails = [
      { id: 'e1', tenantId: 'tenant-1', from: 'alice@test.com', fromHash: null },
    ];
    const mockPrisma = createMockPrisma(emails);

    const result = await backfillFromHash(
      mockPrisma as any,
      mockTenantKeyService as any,
      { dryRun: true, logger: () => {} },
    );

    expect(result.totalHashed).toBe(1);
    expect(mockPrisma.email.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('handles empty tenant (no emails)', async () => {
    const mockPrisma = createMockPrisma([]);

    const result = await backfillFromHash(
      mockPrisma as any,
      mockTenantKeyService as any,
      { logger: () => {} },
    );

    expect(result.totalProcessed).toBe(0);
    expect(result.totalHashed).toBe(0);
  });
});
