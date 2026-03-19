import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';

describe('UsersService.clearUserAiMemory', () => {
  let prisma: {
    aIMemory: { deleteMany: ReturnType<typeof vi.fn> };
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      aIMemory: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    service = new UsersService(
      prisma as any,
      { removeJobsForTenant: vi.fn() } as any,
      { removeJobsForTenant: vi.fn() } as any,
      {
        putObject: vi.fn(),
        getSignedDownloadUrl: vi.fn(),
        deleteObject: vi.fn(),
      } as any,
      undefined,
    );
  });

  it('deletes only memory rows scoped to the tenant and user', async () => {
    const result = await service.clearUserAiMemory('tenant-1', 'user-1');

    expect(prisma.aIMemory.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    });
    expect(result).toEqual({
      success: true,
      deletedCount: 2,
    });
  });
});
