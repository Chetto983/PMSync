import { LabelsService } from '../labels.service';

describe('LabelsService reorder logic', () => {
  const mockEmailsService = {};
  const mockTriageRuleService = {
    setTriageRules: jest.fn(),
  };
  const mockRealtimeEvents = {
    emitLabelUpdate: jest.fn(),
    emitLabelNew: jest.fn(),
    emitLabelDelete: jest.fn(),
    emitEmailUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reindexes siblings when moving within the same parent', async () => {
    const txUserLabel = {
      update: jest.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        ...data,
      })),
      findUnique: jest.fn().mockResolvedValue({
        id: 'label-c',
        tenantId: 'tenant-1',
        parentId: null,
        level: 0,
        orderIndex: 0,
        children: [],
        _count: { emailLabels: 0 },
      }),
    };

    const prisma = {
      userLabel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'label-c',
          tenantId: 'tenant-1',
          slug: 'label-c',
          parentId: null,
          level: 0,
          orderIndex: 2,
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'label-a', parentId: null, level: 0, orderIndex: 0 },
          { id: 'label-b', parentId: null, level: 0, orderIndex: 1 },
          { id: 'label-c', parentId: null, level: 0, orderIndex: 2 },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (tx: { userLabel: typeof txUserLabel }) => Promise<unknown>) =>
        callback({ userLabel: txUserLabel })),
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      undefined as any,
      mockTriageRuleService as any,
    );

    await service.update('tenant-1', 'label-c', { orderIndex: 0 });

    expect(txUserLabel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'label-c' },
        data: expect.objectContaining({
          parentId: null,
          level: 0,
          orderIndex: 0,
        }),
      }),
    );
    expect(txUserLabel.update).toHaveBeenCalledWith({
      where: { id: 'label-a' },
      data: { orderIndex: 1 },
    });
    expect(txUserLabel.update).toHaveBeenCalledWith({
      where: { id: 'label-b' },
      data: { orderIndex: 2 },
    });
    expect(mockRealtimeEvents.emitLabelUpdate).toHaveBeenCalledTimes(1);
  });

  it('reindexes source and target siblings and shifts descendant levels on cross-parent move', async () => {
    const txUserLabel = {
      update: jest.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        ...data,
      })),
      findUnique: jest.fn().mockResolvedValue({
        id: 'moving',
        tenantId: 'tenant-1',
        parentId: 'parent-b',
        level: 2,
        orderIndex: 1,
        children: [],
        _count: { emailLabels: 0 },
      }),
    };

    const prisma = {
      userLabel: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'moving',
            tenantId: 'tenant-1',
            slug: 'moving',
            parentId: 'root-a',
            level: 1,
            orderIndex: 1,
          })
          .mockResolvedValueOnce({
            id: 'parent-b',
            tenantId: 'tenant-1',
            level: 1,
          }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'source-peer', parentId: 'root-a', level: 1, orderIndex: 0 },
          { id: 'moving', parentId: 'root-a', level: 1, orderIndex: 1 },
          { id: 'parent-b', parentId: 'root-b', level: 1, orderIndex: 0 },
          { id: 'target-peer', parentId: 'parent-b', level: 2, orderIndex: 0 },
          { id: 'child', parentId: 'moving', level: 2, orderIndex: 0 },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (tx: { userLabel: typeof txUserLabel }) => Promise<unknown>) =>
        callback({ userLabel: txUserLabel })),
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      undefined as any,
      mockTriageRuleService as any,
    );

    await service.update('tenant-1', 'moving', {
      parentId: 'parent-b',
      orderIndex: 1,
    });

    expect(txUserLabel.update).toHaveBeenCalledWith({
      where: { id: 'source-peer' },
      data: { orderIndex: 0 },
    });
    expect(txUserLabel.update).toHaveBeenCalledWith({
      where: { id: 'target-peer' },
      data: { orderIndex: 0 },
    });
    expect(txUserLabel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'moving' },
        data: expect.objectContaining({
          parentId: 'parent-b',
          level: 2,
          orderIndex: 1,
        }),
      }),
    );
    expect(txUserLabel.update).toHaveBeenCalledWith({
      where: { id: 'child' },
      data: { level: 3 },
    });
    expect(mockRealtimeEvents.emitLabelUpdate).toHaveBeenCalledTimes(1);
  });
});
