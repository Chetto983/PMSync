/**
 * LabelsService integration tests — BTEST-05
 * All tests run against a real PostgreSQL test database.
 * Non-Prisma dependencies are mocked with jest.fn().
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LabelsService } from '../labels.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant, createTestLabel } from '../../../../../test/helpers/factories';

const mockEmailsService = { findEmailById: jest.fn() };
const mockRealtimeEvents = {
  emitLabelNew: jest.fn(),
  emitLabelUpdate: jest.fn(),
  emitLabelDelete: jest.fn(),
  emitEmailUpdate: jest.fn(),
};

describe('LabelsService', () => {
  let service: LabelsService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('create', () => {
    it('inserts a UserLabel row and returns it with children and _count', async () => {
      const tenant = await createTestTenant();

      const result = await service.create(tenant.id, { name: 'Work' });

      expect(result.name).toBe('Work');
      expect(result.slug).toBe('work');
      expect(result.tenantId).toBe(tenant.id);
      expect(result.children).toEqual([]);
      expect(result._count).toBeDefined();
      expect(mockRealtimeEvents.emitLabelNew).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when a label with the same name already exists in the tenant', async () => {
      const tenant = await createTestTenant();
      await service.create(tenant.id, { name: 'Duplicate' });

      await expect(service.create(tenant.id, { name: 'Duplicate' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('succeeds when the same name exists in a DIFFERENT tenant (per-tenant uniqueness)', async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      await service.create(tenantA.id, { name: 'SharedName' });
      const result = await service.create(tenantB.id, { name: 'SharedName' });

      expect(result.name).toBe('SharedName');
      expect(result.tenantId).toBe(tenantB.id);
    });
  });

  describe('findAllByTenant', () => {
    it('returns only non-archived labels for the given tenant', async () => {
      const tenant = await createTestTenant();
      const active = await createTestLabel(tenant.id, { name: 'Active Label' });
      // Create an archived label directly via prisma
      const archived = await createTestLabel(tenant.id, { name: 'Archived Label' });
      await prisma.userLabel.update({
        where: { id: archived.id },
        data: { isArchived: true },
      });

      const results = await service.findAllByTenant(tenant.id);

      const ids = results.map((l) => l.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(archived.id);
    });

    it('returns an empty array for a tenant with no labels', async () => {
      const tenant = await createTestTenant();

      const results = await service.findAllByTenant(tenant.id);

      expect(results).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the label when tenantId matches', async () => {
      const tenant = await createTestTenant();
      const label = await createTestLabel(tenant.id);

      const result = await service.findOne(tenant.id, label.id);

      expect(result.id).toBe(label.id);
    });

    it('throws NotFoundException when label belongs to a different tenant', async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();
      const label = await createTestLabel(tenantA.id);

      await expect(service.findOne(tenantB.id, label.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('persists name and slug changes to the real DB', async () => {
      const tenant = await createTestTenant();
      const label = await createTestLabel(tenant.id, { name: 'Original Name' });

      const updated = await service.update(tenant.id, label.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.slug).toBe('updated-name');

      // Verify persisted in DB
      const fromDb = await prisma.userLabel.findUnique({ where: { id: label.id } });
      expect(fromDb?.name).toBe('Updated Name');
      expect(fromDb?.slug).toBe('updated-name');
      expect(mockRealtimeEvents.emitLabelUpdate).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the new parentId would create a circular reference', async () => {
      const tenant = await createTestTenant();
      const labelA = await createTestLabel(tenant.id, { name: 'Label A Circular' });
      const labelB = await createTestLabel(tenant.id, {
        name: 'Label B Circular',
        parentId: labelA.id,
      });

      // Making A a child of B would create A -> B -> A cycle
      await expect(
        service.update(tenant.id, labelA.id, { parentId: labelB.id }),
      ).rejects.toThrow(ConflictException);
    });

    it('reindexes siblings when a label is moved within the same parent', async () => {
      const tenant = await createTestTenant();
      const labelA = await createTestLabel(tenant.id, { name: 'Label Reorder A' });
      const labelB = await createTestLabel(tenant.id, { name: 'Label Reorder B' });
      const labelC = await createTestLabel(tenant.id, { name: 'Label Reorder C' });

      await prisma.userLabel.update({ where: { id: labelA.id }, data: { orderIndex: 0 } });
      await prisma.userLabel.update({ where: { id: labelB.id }, data: { orderIndex: 1 } });
      await prisma.userLabel.update({ where: { id: labelC.id }, data: { orderIndex: 2 } });

      await service.update(tenant.id, labelC.id, { orderIndex: 0 });

      const labels = await prisma.userLabel.findMany({
        where: { tenantId: tenant.id, id: { in: [labelA.id, labelB.id, labelC.id] } },
        orderBy: { orderIndex: 'asc' },
      });

      expect(labels.map((label) => label.id)).toEqual([labelC.id, labelA.id, labelB.id]);
      expect(labels.map((label) => label.orderIndex)).toEqual([0, 1, 2]);
    });

    it('reindexes source/target siblings and shifts descendant levels when moving across parents', async () => {
      const tenant = await createTestTenant();
      const rootA = await createTestLabel(tenant.id, { name: 'Root A Move' });
      const rootB = await createTestLabel(tenant.id, { name: 'Root B Move' });
      const parentB = await createTestLabel(tenant.id, {
        name: 'Parent B Move',
        parentId: rootB.id,
      });
      const moving = await createTestLabel(tenant.id, {
        name: 'Moving Node',
        parentId: rootA.id,
      });
      const child = await createTestLabel(tenant.id, {
        name: 'Moving Child',
        parentId: moving.id,
      });

      await prisma.userLabel.update({ where: { id: rootA.id }, data: { orderIndex: 0 } });
      await prisma.userLabel.update({ where: { id: rootB.id }, data: { orderIndex: 1 } });
      await prisma.userLabel.update({
        where: { id: parentB.id },
        data: { orderIndex: 0, level: 1 },
      });
      await prisma.userLabel.update({
        where: { id: moving.id },
        data: { orderIndex: 0, level: 1 },
      });
      await prisma.userLabel.update({
        where: { id: child.id },
        data: { orderIndex: 0, level: 2 },
      });

      await service.update(tenant.id, moving.id, {
        parentId: parentB.id,
        orderIndex: 0,
      });

      const moved = await prisma.userLabel.findUnique({ where: { id: moving.id } });
      const movedChild = await prisma.userLabel.findUnique({ where: { id: child.id } });

      expect(moved?.parentId).toBe(parentB.id);
      expect(moved?.level).toBe(2);
      expect(moved?.orderIndex).toBe(0);
      expect(movedChild?.level).toBe(3);
    });
  });

  describe('delete', () => {
    it('soft-deletes the label row (isArchived=true, slug renamed)', async () => {
      const tenant = await createTestTenant();
      const label = await createTestLabel(tenant.id, { name: 'To Delete' });

      await service.delete(tenant.id, label.id);

      const fromDb = await prisma.userLabel.findUnique({ where: { id: label.id } });
      expect(fromDb?.isArchived).toBe(true);
      expect(fromDb?.slug).toMatch(/-deleted-\d+$/);
      expect(mockRealtimeEvents.emitLabelDelete).toHaveBeenCalledTimes(1);

      // Should no longer appear in findAllByTenant
      const active = await service.findAllByTenant(tenant.id);
      expect(active.map((l) => l.id)).not.toContain(label.id);
    });

    it('cascades soft-delete to all descendants (child and grandchild)', async () => {
      const tenant = await createTestTenant();
      const parent = await createTestLabel(tenant.id, { name: 'Parent Cascade' });
      const child = await createTestLabel(tenant.id, {
        name: 'Child Cascade',
        parentId: parent.id,
      });
      const grandchild = await createTestLabel(tenant.id, {
        name: 'Grandchild Cascade',
        parentId: child.id,
      });

      await service.delete(tenant.id, parent.id);

      const rows = await prisma.userLabel.findMany({
        where: { id: { in: [parent.id, child.id, grandchild.id] } },
      });

      expect(rows).toHaveLength(3);
      rows.forEach((row) => {
        expect(row.isArchived).toBe(true);
      });
    });
  });

  describe('Tenant isolation', () => {
    it('findAllByTenant for tenant B returns zero rows when labels were created in tenant A', async () => {
      const tenantA = await createTestTenant();
      const tenantB = await createTestTenant();

      await createTestLabel(tenantA.id, { name: 'Tenant A Label 1' });
      await createTestLabel(tenantA.id, { name: 'Tenant A Label 2' });

      const resultsB = await service.findAllByTenant(tenantB.id);

      expect(resultsB).toHaveLength(0);
    });
  });
});
