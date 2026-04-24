import { LabelsService } from '../labels.service';

describe('LabelsService cache invalidation', () => {
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
  const mockSyncBackQueue = {
    enqueueBulkSyncBack: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expires tenant email analyses after creating a label', async () => {
    // Phase 150.1 WR-03: create() now runs inside a $transaction. Mock passes
    // through the tx callback with a client that mirrors userLabel.create +
    // the SELECT-FOR-UPDATE/graphNode.create pattern from upsertLabelNode.
    const createdLabel = {
      id: 'label-1',
      tenantId: 'tenant-1',
      name: 'CI Incident',
      slug: 'ci-incident',
      children: [],
      _count: { emailLabels: 0 },
    };
    const prisma = {
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 7 }),
      },
      userLabel: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 2 } }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          userLabel: {
            create: jest.fn().mockResolvedValue(createdLabel),
          },
          graphNode: {
            create: jest.fn().mockResolvedValue({ id: 'gn-1' }),
            update: jest.fn().mockResolvedValue({ id: 'gn-1' }),
          },
          $queryRaw: jest.fn().mockResolvedValue([]),
        };
        return fn(tx);
      }),
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await service.create('tenant-1', { name: 'CI Incident', aiPrompt: 'Use for CI failures' });

    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
  });

  it('expires tenant email analyses after updating a label rule', async () => {
    const prisma = {
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 9 }),
      },
      userLabel: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'label-1',
            tenantId: 'tenant-1',
            slug: 'updates',
            parentId: null,
            level: 0,
            orderIndex: 0,
          }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'label-1', parentId: null, level: 0, orderIndex: 0 },
        ]),
        update: jest.fn().mockResolvedValue({
          id: 'label-1',
          tenantId: 'tenant-1',
          name: 'Updates',
          slug: 'updates',
          children: [],
          _count: { emailLabels: 0 },
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await service.update('tenant-1', 'label-1', {
      aiPrompt: 'Use only for passive release notes and system notifications.',
    });

    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
  });

  it('expires tenant email analyses after deleting a label', async () => {
    // Phase 150.1 WR-03: delete() now runs inside a $transaction.
    const prisma = {
      emailAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
      userLabel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'label-1',
          tenantId: 'tenant-1',
          slug: 'ci-incident',
          children: [],
          _count: { emailLabels: 0 },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          userLabel: {
            update: jest.fn().mockResolvedValue(undefined),
            findMany: jest.fn().mockResolvedValue([]),
          },
          graphNode: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          $queryRaw: jest.fn().mockResolvedValue([]),
        };
        return fn(tx);
      }),
    };

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await service.delete('tenant-1', 'label-1');

    expect(prisma.emailAnalysis.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { processedAt: expect.any(Date) },
    });
  });
});
