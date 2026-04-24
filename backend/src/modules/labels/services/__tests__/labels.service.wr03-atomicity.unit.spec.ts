/**
 * Phase 150.1 WR-03 atomicity unit spec.
 *
 * Verifies that labels.service.ts delete / create / bulkDelete wrap the
 * UserLabel mutations + GraphNode mirror writes in a single `$transaction`
 * so a mid-flight failure rolls back every sibling write.
 *
 * Pure-unit scope: no test Postgres — the assertion is "the service code
 * invoked prisma.$transaction and performed ALL its UserLabel + graphNode
 * writes through the tx client, not through the raw this.prisma client".
 * Integration coverage (real rollback on real DB failure) lives in the
 * existing labels.service.spec.ts under test:docker:up.
 */
import { LabelsService } from '../labels.service';

describe('LabelsService — WR-03 transaction atomicity', () => {
  const mockEmailsService = {};
  const mockTriageRuleService = { setTriageRules: jest.fn() };
  const mockRealtimeEvents = {
    emitLabelNew: jest.fn(),
    emitLabelUpdate: jest.fn(),
    emitLabelDelete: jest.fn(),
    emitEmailUpdate: jest.fn(),
  };
  const mockSyncBackQueue = { enqueueBulkSyncBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper: build a prisma mock where every tx.* write is recorded so the
  // spec can assert the write order + client (tx vs this.prisma).
  function buildPrismaMock(opts: {
    labelRecord?: Record<string, unknown>;
    graphNodeFindRows?: Array<{ id: string }>;
    simulateMirrorFailure?: boolean;
    descendantChildren?: Array<{ id: string; slug: string }>;
  } = {}) {
    const writes: Array<{ client: 'tx' | 'this.prisma'; op: string; arg: unknown }> = [];
    const labelRecord = opts.labelRecord ?? {
      id: 'label-1',
      tenantId: 'tenant-1',
      slug: 'to-delete',
      name: 'To Delete',
      isArchived: false,
      children: [],
      _count: { emailLabels: 0 },
    };

    const makeTx = () => ({
      userLabel: {
        create: jest.fn(async (arg: unknown) => {
          writes.push({ client: 'tx', op: 'userLabel.create', arg });
          return {
            id: 'new-label-1',
            name: (arg as { data: { name: string } }).data.name,
            slug: (arg as { data: { slug: string } }).data.slug,
            tenantId: (arg as { data: { tenantId: string } }).data.tenantId,
            children: [],
            _count: { emailLabels: 0 },
          };
        }),
        update: jest.fn(async (arg: unknown) => {
          writes.push({ client: 'tx', op: 'userLabel.update', arg });
          return labelRecord;
        }),
        updateMany: jest.fn(async (arg: unknown) => {
          writes.push({ client: 'tx', op: 'userLabel.updateMany', arg });
          return { count: 0 };
        }),
        findMany: jest.fn(async () => opts.descendantChildren ?? []),
      },
      graphNode: {
        deleteMany: jest.fn(async (arg: unknown) => {
          writes.push({ client: 'tx', op: 'graphNode.deleteMany', arg });
          if (opts.simulateMirrorFailure) {
            throw new Error('simulated graphNode.deleteMany failure');
          }
          return { count: 1 };
        }),
        create: jest.fn(async (arg: unknown) => {
          writes.push({ client: 'tx', op: 'graphNode.create', arg });
          if (opts.simulateMirrorFailure) {
            throw new Error('simulated graphNode.create failure');
          }
          return { id: 'gn-1' };
        }),
        update: jest.fn(async (arg: unknown) => {
          writes.push({ client: 'tx', op: 'graphNode.update', arg });
          return { id: 'gn-1' };
        }),
      },
      $queryRaw: jest.fn(async () => opts.graphNodeFindRows ?? []),
    });

    return {
      writes,
      prisma: {
        userLabel: {
          // findOne path (delete uses this)
          findUnique: jest.fn().mockResolvedValue(labelRecord),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue(
            opts.descendantChildren ? [] : [],
          ),
          aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: -1 } }),
        },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => {
          const tx = makeTx();
          try {
            return await fn(tx);
          } catch (err) {
            // Simulate Prisma rolling back — subsequent operations should not
            // run, and the caller should see the error.
            throw err;
          }
        }),
        // Outside-tx graphNode mock (should NOT be called under WR-03).
        graphNode: {
          deleteMany: jest.fn(async (arg: unknown) => {
            writes.push({ client: 'this.prisma', op: 'graphNode.deleteMany', arg });
            return { count: 0 };
          }),
          updateMany: jest.fn(async (arg: unknown) => {
            writes.push({ client: 'this.prisma', op: 'graphNode.updateMany', arg });
            return { count: 0 };
          }),
        },
        // Outside-tx invalidateTenantAnalysisCache helper target.
        emailAnalysis: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      },
    };
  }

  it('delete() wraps userLabel.update + archiveDescendants + graphNode.deleteMany in one $transaction', async () => {
    const { writes, prisma } = buildPrismaMock();
    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await service.delete('tenant-1', 'label-1');

    // $transaction invoked exactly once.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // ALL three writes went through the tx client.
    const txOps = writes.filter((w) => w.client === 'tx').map((w) => w.op);
    expect(txOps).toContain('userLabel.update');
    expect(txOps).toContain('graphNode.deleteMany');
    // NO outside-tx graphNode.deleteMany call slipped through.
    expect(prisma.graphNode.deleteMany).not.toHaveBeenCalled();
  });

  it('delete() rolls back the userLabel.update if the mirror hard-delete throws', async () => {
    const { prisma } = buildPrismaMock({ simulateMirrorFailure: true });
    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await expect(service.delete('tenant-1', 'label-1')).rejects.toThrow(
      /simulated graphNode.deleteMany failure/,
    );
    // The $transaction callback threw — Prisma would roll the tx back on a
    // real DB. Assertion is that the error propagates and the caller can't
    // observe a soft-deleted label with a surviving mirror.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('create() wraps userLabel.create + mirror upsertLabelNode in one $transaction', async () => {
    const { writes, prisma } = buildPrismaMock();
    // create() pre-check: findUnique must return null (no existing slug).
    (prisma.userLabel.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await service.create('tenant-1', { name: 'New Label' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txOps = writes.filter((w) => w.client === 'tx').map((w) => w.op);
    // Creation + mirror node create (find path returns [] so we take create branch).
    expect(txOps).toContain('userLabel.create');
    expect(txOps.some((op) => op === 'graphNode.create' || op === 'graphNode.update')).toBe(true);
    // No outside-tx leakage.
    expect(prisma.graphNode.deleteMany).not.toHaveBeenCalled();
  });

  it('bulkDelete() wraps userLabel.updateMany + mirror hard-delete in one $transaction with 10s timeout', async () => {
    const { writes, prisma } = buildPrismaMock();
    // Override userLabel.findMany for the bulkDelete pre-check to return 1 valid label.
    (prisma.userLabel.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'label-1', slug: 'bulk-1' },
    ]);

    const service = new LabelsService(
      prisma as any,
      mockEmailsService as any,
      mockRealtimeEvents as any,
      mockSyncBackQueue as any,
      mockTriageRuleService as any,
    );

    await service.bulkDelete('tenant-1', ['label-1']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Assert 2nd arg is options with explicit timeout (10s per WR-03 decision).
    const txCallArgs = (prisma.$transaction as jest.Mock).mock.calls[0];
    expect(txCallArgs[1]).toEqual(expect.objectContaining({ timeout: 10_000 }));

    const txOps = writes.filter((w) => w.client === 'tx').map((w) => w.op);
    expect(txOps).toContain('userLabel.updateMany');
    expect(txOps).toContain('graphNode.deleteMany');
    // No outside-tx leakage.
    expect(prisma.graphNode.deleteMany).not.toHaveBeenCalled();
  });
});
