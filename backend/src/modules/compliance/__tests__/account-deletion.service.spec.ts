import { Test, TestingModule } from '@nestjs/testing';
import { AccountDeletionService } from '../services/account-deletion.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let prisma: Record<string, any>;

  const mockUserId = 'user-123';
  const mockTenantId = 'tenant-456';

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ tenantId: mockTenantId }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: mockUserId }),
      },
      session: {
        deleteMany: jest.fn(),
      },
      member: {
        findMany: jest.fn().mockResolvedValue([
          { organizationId: 'org-1' },
          { organizationId: 'org-2' },
        ]),
        count: jest.fn().mockResolvedValue(0),
      },
      tenant: {
        delete: jest.fn(),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
      dataExportRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: undefined },
      ],
    }).compile();

    service = module.get<AccountDeletionService>(AccountDeletionService);
  });

  describe('hardDeleteUser', () => {
    it('should query user org memberships BEFORE calling prisma.user.delete', async () => {
      const callOrder: string[] = [];
      prisma.member.findMany.mockImplementation(() => {
        callOrder.push('member.findMany');
        return Promise.resolve([{ organizationId: 'org-1' }]);
      });
      prisma.user.findUnique.mockImplementation(() => {
        callOrder.push('user.findUnique');
        return Promise.resolve({ tenantId: mockTenantId });
      });
      prisma.user.delete.mockImplementation(() => {
        callOrder.push('user.delete');
        return Promise.resolve({ id: mockUserId });
      });
      prisma.member.count.mockResolvedValue(0);

      await service.hardDeleteUser(mockUserId, mockTenantId);

      expect(callOrder.indexOf('member.findMany')).toBeLessThan(
        callOrder.indexOf('user.delete'),
      );
    });

    it('should delete orphaned orgs (0 members after cascade) excluding workspace tenant', async () => {
      prisma.member.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
        { organizationId: 'org-2' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ tenantId: mockTenantId });
      prisma.member.count.mockResolvedValue(0); // both orgs orphaned

      await service.hardDeleteUser(mockUserId, mockTenantId);

      expect(prisma.tenant.delete).toHaveBeenCalledWith({
        where: { id: 'org-1' },
      });
      expect(prisma.tenant.delete).toHaveBeenCalledWith({
        where: { id: 'org-2' },
      });
      expect(prisma.tenant.delete).toHaveBeenCalledTimes(2);
    });

    it('should NOT delete orgs that still have other members after cascade', async () => {
      prisma.member.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ tenantId: mockTenantId });
      prisma.member.count.mockResolvedValue(3); // org still has members

      await service.hardDeleteUser(mockUserId, mockTenantId);

      expect(prisma.tenant.delete).not.toHaveBeenCalled();
    });

    it('should NOT delete the user workspace tenant even if it has 0 members', async () => {
      // org-1 is the user's own workspace tenant
      prisma.member.findMany.mockResolvedValue([
        { organizationId: mockTenantId },
        { organizationId: 'org-other' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ tenantId: mockTenantId });
      prisma.member.count.mockResolvedValue(0);

      await service.hardDeleteUser(mockUserId, mockTenantId);

      // Should NOT delete workspace tenant
      expect(prisma.tenant.delete).not.toHaveBeenCalledWith({
        where: { id: mockTenantId },
      });
      // Should delete the other orphaned org
      expect(prisma.tenant.delete).toHaveBeenCalledWith({
        where: { id: 'org-other' },
      });
    });

    it('should return false on P2025 without attempting org cleanup', async () => {
      prisma.member.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ tenantId: mockTenantId });
      prisma.user.delete.mockRejectedValue({ code: 'P2025' });

      const result = await service.hardDeleteUser(mockUserId, mockTenantId);

      expect(result).toBe(false);
      expect(prisma.tenant.delete).not.toHaveBeenCalled();
    });

    it('should return count of deleted orgs from cleanupOrphanedOrgs', async () => {
      prisma.member.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
        { organizationId: 'org-2' },
        { organizationId: 'org-3' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ tenantId: mockTenantId });
      // org-1: orphaned, org-2: has members, org-3: orphaned
      prisma.member.count
        .mockResolvedValueOnce(0) // org-1
        .mockResolvedValueOnce(2) // org-2
        .mockResolvedValueOnce(0); // org-3

      const result = await service.hardDeleteUser(mockUserId, mockTenantId);

      expect(result).toBe(true);
      expect(prisma.tenant.delete).toHaveBeenCalledTimes(2);
    });
  });
});
