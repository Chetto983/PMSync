import { BadRequestException } from '@nestjs/common';
import { FoldersController } from '../folders.controller';

describe('FoldersController.createFolder', () => {
  const tenantId = 'tenant-1';
  const providerId = 'provider-1';

  const buildController = () => {
    const folderSyncService = {} as never;
    const folderQueue = {
      addCreateFolderJob: jest.fn(),
      waitForJob: jest.fn(),
    } as never;
    const prisma = {
      providerConfig: {
        findFirst: jest.fn(),
      },
      folder: {
        findFirst: jest.fn(),
      },
    } as never;

    const controller = new FoldersController(folderSyncService, folderQueue, prisma);
    return { controller, folderQueue, prisma };
  };

  it('returns the created folder when queue polling misses a completed create job', async () => {
    const { controller, folderQueue, prisma } = buildController();

    (prisma.providerConfig.findFirst as jest.Mock).mockResolvedValue({
      id: providerId,
      tenantId,
      providerType: 'google',
      email: 'user@example.com',
    });
    (folderQueue.addCreateFolderJob as jest.Mock).mockResolvedValue('job-1');
    (folderQueue.waitForJob as jest.Mock).mockResolvedValue(null);
    (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
      id: 'folder-1',
      path: 'CODEX-AUDIT',
      name: 'CODEX-AUDIT',
    });

    const result = await controller.createFolder(
      { user: { tenantId } } as never,
      { providerId, name: 'CODEX-AUDIT' },
      undefined,
    );

    expect(result).toEqual({
      id: 'folder-1',
      path: 'CODEX-AUDIT',
      name: 'CODEX-AUDIT',
    });
    expect(prisma.folder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          providerId,
          OR: [
            { path: 'CODEX-AUDIT' },
            { name: 'CODEX-AUDIT' },
          ],
        }),
      }),
    );
  });

  it('throws when the queue misses the job and no created folder can be found', async () => {
    const { controller, folderQueue, prisma } = buildController();

    (prisma.providerConfig.findFirst as jest.Mock).mockResolvedValue({
      id: providerId,
      tenantId,
      providerType: 'google',
      email: 'user@example.com',
    });
    (folderQueue.addCreateFolderJob as jest.Mock).mockResolvedValue('job-1');
    (folderQueue.waitForJob as jest.Mock).mockResolvedValue(null);
    (prisma.folder.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      controller.createFolder(
        { user: { tenantId } } as never,
        { providerId, name: 'CODEX-MISSING' },
        undefined,
      ),
    ).rejects.toThrow(new BadRequestException('Failed to create folder: job not found'));
  });
});
