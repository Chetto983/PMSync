// Phase 150 Wave 0 RED spec — triage-decay-gc.helpers (D-06 third store)
// Ref: .planning/phases/150-graph-triage-memory/150-VALIDATION.md §Wave 0 Requirements.
// Covers D-06 decay-gc third-store extension: below threshold (hard-delete),
// above threshold (keep), corrupt/legacy provenance (defensive), multi-tenant
// isolation, counter emit with store='graph_edge'.
//
// B-2 fixture shape: EmailTriageFeedback has NO overrideId column. Recompute
// walks edge.metadata.derivedFromOverrideIds -> TriageOverride batch fetch
// -> matches feedback via (email.from, newValue) pairs.
//
// Expected RED: 'processAffinityEdgeDecayForTenant is not a function' (named
// export not yet added) until Plan 03 extends the Phase 149 helper. tsc is
// unaffected because tsconfig.json excludes **/*spec.ts from the compile graph.

import { processAffinityEdgeDecayForTenant } from '../triage-decay-gc.helpers';

describe('processAffinityEdgeDecayForTenant (Phase 150 D-06 third store)', () => {
  const prismaMock = {
    graphEdge: { findMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
    graphNode: { findMany: jest.fn() },
    triageOverride: { findMany: jest.fn() },
    emailTriageFeedback: { findMany: jest.fn() },
    email: { findMany: jest.fn() },
  };
  const gcCounter = { inc: jest.fn() };
  const deps = () => ({
    prisma: prismaMock as any,
    redis: null,
    gcCounter: gcCounter as any,
    halfLifeDays: 14,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.triageOverride.findMany.mockResolvedValue([]);
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([]);
    prismaMock.email.findMany.mockResolvedValue([]);
    prismaMock.graphNode.findMany.mockResolvedValue([]);
    prismaMock.graphEdge.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('hard-deletes affinity edge when recomputed confidence < 0.3', async () => {
    const ancient = new Date(Date.now() - 86_400_000 * 365); // 1 year
    prismaMock.graphEdge.findMany.mockResolvedValue([
      {
        id: 'edge1',
        tenantId: 't1',
        sourceId: 'senderNode1',
        targetId: 'labelNode1',
        edgeType: 'SENDER_LABEL_AFFINITY',
        confidence: 0.9,
        metadata: {
          derivedFromOverrideIds: ['override-1'],
          promotionAudit: { halfLifeDays: 14 },
        },
      },
    ]);
    // Helper must look up the override to get its pattern + action
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'override-1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
    ]);
    // Matching feedback row — ancient, so weightCorrection yields a tiny weight
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { id: 'f1', tenantId: 't1', createdAt: ancient, newValue: 'L1', emailId: 'e1' },
    ]);
    prismaMock.email.findMany.mockResolvedValue([{ id: 'e1', from: 'boss@acme.com' }]);
    prismaMock.graphEdge.deleteMany.mockResolvedValue({ count: 1 });

    const result = await processAffinityEdgeDecayForTenant('t1', deps());

    expect(prismaMock.graphEdge.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', id: 'edge1' }),
      }),
    );
    expect(result.graphEdgeDeleted).toBe(1);
  });

  it('keeps affinity edge when recomputed confidence = 0.35 (just above threshold)', async () => {
    // Fresh evidence with 3 matching feedback rows -> weighted-sum stays above 0.3
    const recent = new Date(Date.now() - 86_400_000 * 3);
    prismaMock.graphEdge.findMany.mockResolvedValue([
      {
        id: 'edge1',
        tenantId: 't1',
        sourceId: 'senderNode1',
        targetId: 'labelNode1',
        edgeType: 'SENDER_LABEL_AFFINITY',
        confidence: 0.5,
        metadata: {
          derivedFromOverrideIds: ['override-1'],
          promotionAudit: { halfLifeDays: 14 },
        },
      },
    ]);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'override-1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
    ]);
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { id: 'f1', tenantId: 't1', createdAt: recent, newValue: 'L1', emailId: 'e1' },
      { id: 'f2', tenantId: 't1', createdAt: recent, newValue: 'L1', emailId: 'e2' },
      { id: 'f3', tenantId: 't1', createdAt: recent, newValue: 'L1', emailId: 'e3' },
    ]);
    prismaMock.email.findMany.mockResolvedValue([
      { id: 'e1', from: 'boss@acme.com' },
      { id: 'e2', from: 'boss@acme.com' },
      { id: 'e3', from: 'boss@acme.com' },
    ]);

    const result = await processAffinityEdgeDecayForTenant('t1', deps());

    expect(prismaMock.graphEdge.deleteMany).not.toHaveBeenCalled();
    expect(result.graphEdgeDeleted).toBe(0);
  });

  it('defensively handles affinity edge with empty derivedFromOverrideIds (corrupt/legacy)', async () => {
    prismaMock.graphEdge.findMany.mockResolvedValue([
      {
        id: 'edge1',
        tenantId: 't1',
        sourceId: 'senderNode1',
        targetId: 'labelNode1',
        edgeType: 'SENDER_LABEL_AFFINITY',
        confidence: 0.9,
        metadata: { derivedFromOverrideIds: [], promotionAudit: null },
      },
    ]);
    // No error thrown; helper treats empty provenance as zero-weight evidence -> delete
    await expect(processAffinityEdgeDecayForTenant('t1', deps())).resolves.not.toThrow();
  });

  it('scopes deletes per tenant (multi-tenant invariant)', async () => {
    prismaMock.graphEdge.findMany.mockResolvedValue([
      {
        id: 'edge1',
        tenantId: 't1',
        sourceId: 'senderNode1',
        targetId: 'labelNode1',
        edgeType: 'SENDER_LABEL_AFFINITY',
        confidence: 0.9,
        metadata: { derivedFromOverrideIds: [], promotionAudit: null },
      },
    ]);
    prismaMock.graphEdge.deleteMany.mockResolvedValue({ count: 1 });

    await processAffinityEdgeDecayForTenant('t1', deps());

    // The graphEdge.findMany call MUST filter by tenantId
    expect(prismaMock.graphEdge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      }),
    );
    // EVERY deleteMany call MUST include tenantId in where
    for (const call of prismaMock.graphEdge.deleteMany.mock.calls) {
      expect(call[0].where).toHaveProperty('tenantId', 't1');
    }
  });

  it('emits gcCounter with store=graph_edge label on every delete', async () => {
    const ancient = new Date(Date.now() - 86_400_000 * 365);
    prismaMock.graphEdge.findMany.mockResolvedValue([
      {
        id: 'edge1',
        tenantId: 't1',
        sourceId: 'senderNode1',
        targetId: 'labelNode1',
        edgeType: 'SENDER_LABEL_AFFINITY',
        confidence: 0.9,
        metadata: {
          derivedFromOverrideIds: ['override-1'],
          promotionAudit: { halfLifeDays: 14 },
        },
      },
    ]);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'override-1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
    ]);
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { id: 'f1', tenantId: 't1', createdAt: ancient, newValue: 'L1', emailId: 'e1' },
    ]);
    prismaMock.email.findMany.mockResolvedValue([{ id: 'e1', from: 'boss@acme.com' }]);
    prismaMock.graphEdge.deleteMany.mockResolvedValue({ count: 1 });

    await processAffinityEdgeDecayForTenant('t1', deps());

    expect(gcCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ store: 'graph_edge', tenant_id: 't1' }),
    );
  });
});
