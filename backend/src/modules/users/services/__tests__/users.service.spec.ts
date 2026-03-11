/**
 * UsersService integration tests — BTEST-07
 * All tests run against a real PostgreSQL test database.
 * Non-Prisma dependencies are mocked with jest.fn().
 */
import { UsersService } from '../users.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant, createTestUser } from '../../../../../test/helpers/factories';
import type { Tenant, User } from '@prisma/client';

const mockEmailEmbeddingQueue = { removeJobsForTenant: jest.fn().mockResolvedValue(undefined) };
const mockQueueService = { removeJobsForTenant: jest.fn().mockResolvedValue(undefined) };
const mockStorageService = {
  putObject: jest.fn().mockResolvedValue(undefined),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
  deleteObject: jest.fn().mockResolvedValue(undefined),
};
const mockCacheService = { del: jest.fn().mockResolvedValue(undefined) };

describe('UsersService', () => {
  let service: UsersService;
  let tenant: Tenant;
  let user: User;

  beforeAll(async () => {
    const prisma = getTestPrismaClient() as any;
    service = new UsersService(
      prisma,
      mockEmailEmbeddingQueue as any,
      mockQueueService as any,
      mockStorageService as any,
      mockCacheService as any,
    );
    tenant = await createTestTenant();
    user = await createTestUser(tenant.id);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ---------------------------------------------------------------------------
  // getUserProfile
  // ---------------------------------------------------------------------------
  describe('getUserProfile', () => {
    it('returns profile object for a valid userId', async () => {
      const profile = await service.getUserProfile(user.id);

      expect(profile).not.toBeNull();
      expect(profile!.id).toBe(user.id);
      expect(profile!.email).toBe(user.email);
      expect(profile).toHaveProperty('role');
      expect(profile).toHaveProperty('twoFactorEnabled');
      expect(profile).toHaveProperty('createdAt');
    });

    it('returns null for a userId that does not exist', async () => {
      const profile = await service.getUserProfile('00000000-0000-0000-0000-000000000000');
      expect(profile).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateUserProfile
  // ---------------------------------------------------------------------------
  describe('updateUserProfile', () => {
    it('persists firstName/lastName changes to the real DB', async () => {
      const updated = await service.updateUserProfile(user.id, {
        firstName: 'Alice',
        lastName: 'Smith',
      });

      expect(updated.id).toBe(user.id);
      expect(updated.firstName).toBe('Alice');
      expect(updated.lastName).toBe('Smith');

      // Verify persisted by re-reading from DB
      const reloaded = await service.getUserProfile(user.id);
      expect(reloaded!.firstName).toBe('Alice');
      expect(reloaded!.lastName).toBe('Smith');
    });
  });

  // ---------------------------------------------------------------------------
  // getUserPreferences
  // ---------------------------------------------------------------------------
  describe('getUserPreferences', () => {
    let prefUser: User;

    beforeAll(async () => {
      prefUser = await createTestUser(tenant.id);
    });

    it('auto-creates a preferences row with defaults on first call', async () => {
      const prefs = await service.getUserPreferences(tenant.id, prefUser.id);

      expect(prefs).not.toBeNull();
      expect(prefs.userId).toBe(prefUser.id);
      expect(prefs.theme).toBe('light');
      expect(prefs.language).toBe('en');
    });

    it('returns the same row on a second call without creating a duplicate', async () => {
      const prefs1 = await service.getUserPreferences(tenant.id, prefUser.id);
      const prefs2 = await service.getUserPreferences(tenant.id, prefUser.id);

      expect(prefs1.id).toBe(prefs2.id);
    });
  });

  // ---------------------------------------------------------------------------
  // updateUserPreferences
  // ---------------------------------------------------------------------------
  describe('updateUserPreferences', () => {
    it('upserts correctly — creates when absent, returned row has updated theme', async () => {
      const updateUser = await createTestUser(tenant.id);

      const result = await service.updateUserPreferences(tenant.id, updateUser.id, {
        theme: 'dark',
      } as any);

      expect(result.userId).toBe(updateUser.id);
      expect(result.theme).toBe('dark');
    });
  });

  // ---------------------------------------------------------------------------
  // deleteUserAccount
  // ---------------------------------------------------------------------------
  describe('deleteUserAccount', () => {
    it('deletes user and tenant when user is the sole member', async () => {
      const soloTenant = await createTestTenant();
      const soloUser = await createTestUser(soloTenant.id);

      const result = await service.deleteUserAccount(soloUser.id);

      expect(result.success).toBe(true);
      expect(result.tenantDeleted).toBe(true);

      // Verify user row is gone
      const prisma = getTestPrismaClient();
      const gone = await prisma.user.findUnique({ where: { id: soloUser.id } });
      expect(gone).toBeNull();
    });

    it('deletes user but keeps tenant when other users remain', async () => {
      const sharedTenant = await createTestTenant();
      const userA = await createTestUser(sharedTenant.id);
      const userB = await createTestUser(sharedTenant.id);

      const result = await service.deleteUserAccount(userA.id);

      expect(result.success).toBe(true);
      expect(result.tenantDeleted).toBe(false);

      // Verify userA is gone, userB and tenant remain
      const prisma = getTestPrismaClient();
      const goneA = await prisma.user.findUnique({ where: { id: userA.id } });
      expect(goneA).toBeNull();

      const remainB = await prisma.user.findUnique({ where: { id: userB.id } });
      expect(remainB).not.toBeNull();

      const remainTenant = await prisma.tenant.findUnique({ where: { id: sharedTenant.id } });
      expect(remainTenant).not.toBeNull();
    });
  });
});
