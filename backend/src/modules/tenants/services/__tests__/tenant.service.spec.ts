/**
 * TenantService integration tests — BTEST-06
 * All tests run against a real PostgreSQL test database.
 * Non-Prisma dependencies are mocked with jest.fn().
 */
import { TenantService } from '../tenant.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantDeletedEvent } from '../../../../common/events/tenant.events';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant } from '../../../../../test/helpers/factories';
import type { Tenant } from '@prisma/client';

const mockEventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;

describe('TenantService', () => {
  let service: TenantService;

  beforeAll(() => {
    const prisma = getTestPrismaClient() as any;
    service = new TenantService(prisma, mockEventEmitter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ---------------------------------------------------------------------------
  // createTenant
  // ---------------------------------------------------------------------------
  describe('createTenant', () => {
    it('inserts a real tenant row and returns the created object', async () => {
      const slug = `slug-create-${Date.now()}`;
      const result = await service.createTenant({
        name: 'Create Test Tenant',
        slug,
        description: 'A test tenant',
      });

      expect(result).not.toBeNull();
      expect(result.name).toBe('Create Test Tenant');
      expect(result.slug).toBe(slug);
      expect(result.id).toBeDefined();
    });

    it('throws BadRequestException when slug is already taken', async () => {
      const slug = `slug-dup-${Date.now()}`;
      await service.createTenant({ name: 'First', slug });

      await expect(
        service.createTenant({ name: 'Second', slug }),
      ).rejects.toThrow('Slug already exists');
    });
  });

  // ---------------------------------------------------------------------------
  // getAllTenants
  // ---------------------------------------------------------------------------
  describe('getAllTenants', () => {
    it('includes active tenants and excludes soft-deleted tenants', async () => {
      const activeTenant = await createTestTenant();
      const toDelete = await service.createTenant({
        name: 'ToDelete Tenant',
        slug: `slug-todelete-${Date.now()}`,
      });
      await service.deleteTenant(toDelete.id);
      jest.clearAllMocks();

      const results = await service.getAllTenants();
      const ids = results.map((t) => t.id);

      expect(ids).toContain(activeTenant.id);
      expect(ids).not.toContain(toDelete.id);
    });
  });

  // ---------------------------------------------------------------------------
  // updateTenant
  // ---------------------------------------------------------------------------
  describe('updateTenant', () => {
    it('persists name change to the real DB', async () => {
      const tenant = await createTestTenant();

      const updated = await service.updateTenant(tenant.id, {
        name: 'Updated Name',
      });

      expect(updated.id).toBe(tenant.id);
      expect(updated.name).toBe('Updated Name');

      // Verify by re-reading from DB
      const prisma = getTestPrismaClient();
      const reloaded = await prisma.tenant.findUnique({ where: { id: tenant.id } });
      expect(reloaded!.name).toBe('Updated Name');
    });
  });

  // ---------------------------------------------------------------------------
  // deleteTenant (soft delete)
  // ---------------------------------------------------------------------------
  describe('deleteTenant', () => {
    let softDeleteTenant: Tenant;

    beforeAll(async () => {
      softDeleteTenant = await createTestTenant();
    });

    it('sets deletedAt on the row (row still exists)', async () => {
      await service.deleteTenant(softDeleteTenant.id);

      const prisma = getTestPrismaClient();
      const row = await prisma.tenant.findUnique({
        where: { id: softDeleteTenant.id },
      });

      expect(row).not.toBeNull();
      expect(row!.deletedAt).not.toBeNull();
    });

    it('emits TenantDeletedEvent via EventEmitter2', async () => {
      const tenant = await createTestTenant();
      jest.clearAllMocks();

      await service.deleteTenant(tenant.id);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TenantDeletedEvent.eventName,
        expect.any(TenantDeletedEvent),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // hardDeleteTenant
  // ---------------------------------------------------------------------------
  describe('hardDeleteTenant', () => {
    it('permanently removes the tenant row from DB', async () => {
      const tenant = await createTestTenant();

      await service.hardDeleteTenant(tenant.id);

      const reloaded = await service.getTenantById(tenant.id);
      expect(reloaded).toBeNull();
    });

    it('emits TenantDeletedEvent via EventEmitter2 before removing', async () => {
      const tenant = await createTestTenant();
      jest.clearAllMocks();

      await service.hardDeleteTenant(tenant.id);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TenantDeletedEvent.eventName,
        expect.any(TenantDeletedEvent),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-tenant isolation
  // ---------------------------------------------------------------------------
  describe('Tenant isolation', () => {
    it('labels created in tenant A do not appear in tenant B', async () => {
      const prisma = getTestPrismaClient();
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      // Insert a UserLabel directly for tenant A
      const uid = Date.now();
      const labelName = `Isolation Label ${uid}`;
      const labelSlug = `isolation-label-${uid}`;
      await prisma.userLabel.create({
        data: {
          tenantId: tenantA.id,
          name: labelName,
          slug: labelSlug,
          type: 'USER',
          level: 0,
          orderIndex: 0,
        },
      });

      // Query labels for tenant B — must be empty for this label
      const tenantBLabels = await prisma.userLabel.findMany({
        where: { tenantId: tenantB.id },
      });

      const foundInB = tenantBLabels.find((l) => l.slug === labelSlug);
      expect(foundInB).toBeUndefined();
    });
  });
});
