/**
 * ContactSyncService integration tests — BTEST-02
 * All tests run against a real PostgreSQL test database.
 * Non-Prisma, non-Redis dependencies are mocked with jest.fn().
 */
import { BadRequestException } from '@nestjs/common';
import { ContactSyncService } from '../contact-sync.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';

const mockGoogle = { syncContacts: jest.fn().mockResolvedValue(5) };
const mockMicrosoft = { syncContacts: jest.fn().mockResolvedValue(3) };
const mockContactsCache = {
  acquireSyncLock: jest.fn().mockResolvedValue(true),
  releaseSyncLock: jest.fn().mockResolvedValue(undefined),
  invalidateContactCountsCache: jest.fn().mockResolvedValue(undefined),
};
const mockImportService = { createLocalContact: jest.fn(), extractContactsFromEmails: jest.fn(), importFromVCard: jest.fn() };
const mockCrudService = { updateContactCounts: jest.fn().mockResolvedValue(undefined) };

describe('ContactSyncService', () => {
  let service: ContactSyncService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new ContactSyncService(
      prisma as any,
      mockGoogle as any,
      mockMicrosoft as any,
      mockContactsCache as any,
      mockImportService as any,
      mockCrudService as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogle.syncContacts.mockResolvedValue(5);
    mockMicrosoft.syncContacts.mockResolvedValue(3);
    mockContactsCache.acquireSyncLock.mockResolvedValue(true);
    mockContactsCache.releaseSyncLock.mockResolvedValue(undefined);
    mockContactsCache.invalidateContactCountsCache.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await cleanupTestData();
  });

  describe('syncContacts', () => {
    it('acquires lock, delegates to google sync, invalidates cache, releases lock on success', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      const result = await service.syncContacts(provider.id, tenant.id);

      expect(result).toBe(5);
      expect(mockContactsCache.acquireSyncLock).toHaveBeenCalledWith(provider.id);
      expect(mockGoogle.syncContacts).toHaveBeenCalledWith(provider.id);
      expect(mockContactsCache.invalidateContactCountsCache).toHaveBeenCalledWith(tenant.id);
      expect(mockContactsCache.releaseSyncLock).toHaveBeenCalledWith(provider.id);
      expect(mockMicrosoft.syncContacts).not.toHaveBeenCalled();
    });

    it('delegates to microsoft sync when providerType is microsoft', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'microsoft',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      const result = await service.syncContacts(provider.id, tenant.id);

      expect(result).toBe(3);
      expect(mockMicrosoft.syncContacts).toHaveBeenCalledWith(provider.id);
      expect(mockGoogle.syncContacts).not.toHaveBeenCalled();
    });

    it('skips sync gracefully and returns 0 when lock is already held', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      mockContactsCache.acquireSyncLock.mockResolvedValueOnce(false);

      const result = await service.syncContacts(provider.id, tenant.id);

      expect(result).toBe(0);
      expect(mockGoogle.syncContacts).not.toHaveBeenCalled();
      expect(mockContactsCache.releaseSyncLock).not.toHaveBeenCalled();
    });

    it('releases lock in finally block even when sync throws', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      mockGoogle.syncContacts.mockRejectedValueOnce(new Error('API error'));

      await expect(service.syncContacts(provider.id, tenant.id)).rejects.toThrow('API error');
      expect(mockContactsCache.releaseSyncLock).toHaveBeenCalledWith(provider.id);
    });

    it('throws BadRequestException when tenantId does not match provider tenant', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      await expect(
        service.syncContacts(provider.id, 'wrong-tenant-id'),
      ).rejects.toThrow(BadRequestException);
      expect(mockGoogle.syncContacts).not.toHaveBeenCalled();
    });
  });
});
