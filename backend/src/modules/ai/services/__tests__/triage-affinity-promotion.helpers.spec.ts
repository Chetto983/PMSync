// Phase 150 Wave 0 RED spec — triage-affinity-promotion.helpers
// Ref: .planning/phases/150-graph-triage-memory/150-VALIDATION.md §Wave 0 Requirements.
// Covers D-01 OpenClaw 3/0.8 promotion gates (pass/fail each gate independently),
// D-01a provenance metadata (derivedFromOverrideIds + promotionAudit JSONB),
// Open Q1 domain aggregation inheriting MIN_DISTINCT_SENDERS_FOR_DOMAIN=3 +
// ROLE_ACCOUNT_LOCAL_PARTS exclusion, and B-3 fb.newValue -> Label.id resolution
// via userLabel.findFirst.
//
// Expected RED: 'Cannot find module ../triage-affinity-promotion.helpers'
// until Plan 02 extracts the helper. tsc is unaffected because tsconfig.json
// excludes **/*spec.ts from the compile graph.

import { processAffinityPromotionForTenant } from '../triage-affinity-promotion.helpers';

describe('processAffinityPromotionForTenant', () => {
  const prismaMock = {
    triageOverride: { findMany: jest.fn() },
    emailTriageFeedback: { findMany: jest.fn() },
    email: { findMany: jest.fn() },
    graphNode: { findFirst: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    graphEdge: { upsert: jest.fn(), count: jest.fn() },
    userLabel: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const promotionCounter = { inc: jest.fn() };
  const activeEdgesGauge = { set: jest.fn() };
  const deps = () => ({
    prisma: prismaMock as any,
    promotionCounter: promotionCounter as any,
    activeEdgesGauge: activeEdgesGauge as any,
    halfLifeDays: 14,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no inputs — helper returns zero-counts without touching Prisma writes
    prismaMock.triageOverride.findMany.mockResolvedValue([]);
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([]);
    prismaMock.email.findMany.mockResolvedValue([]);
    prismaMock.userLabel.findFirst.mockResolvedValue({ id: 'L1' });
    prismaMock.userLabel.findMany.mockResolvedValue([]);
    prismaMock.graphEdge.count.mockResolvedValue(0);
  });

  it('creates edge when weighted-sum >= 0.8 AND feedback rows >= 3', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 86_400_000); // 1 day old
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
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
    prismaMock.graphNode.upsert.mockResolvedValue({ id: 'node1' });
    prismaMock.graphEdge.upsert.mockResolvedValue({ id: 'edge1' });

    const result = await processAffinityPromotionForTenant('t1', deps(), 'job-1', now);

    expect(result.sendersPromoted + result.sendersUpdated).toBeGreaterThanOrEqual(1);
    expect(prismaMock.graphEdge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId_sourceId_targetId_edgeType: expect.objectContaining({
            tenantId: 't1',
            edgeType: 'SENDER_LABEL_AFFINITY',
          }),
        }),
      }),
    );
    expect(promotionCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 't1',
        edge_type: 'SENDER_LABEL_AFFINITY',
      }),
    );
  });

  it('skips promotion when feedback rows = 2 (row-count gate)', async () => {
    const recent = new Date(Date.now() - 86_400_000);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
    ]);
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { id: 'f1', tenantId: 't1', createdAt: recent, newValue: 'L1', emailId: 'e1' },
      { id: 'f2', tenantId: 't1', createdAt: recent, newValue: 'L1', emailId: 'e2' },
    ]);
    prismaMock.email.findMany.mockResolvedValue([
      { id: 'e1', from: 'boss@acme.com' },
      { id: 'e2', from: 'boss@acme.com' },
    ]);

    await processAffinityPromotionForTenant('t1', deps(), 'job-1', new Date());

    expect(prismaMock.graphEdge.upsert).not.toHaveBeenCalled();
  });

  it('skips promotion when weighted-sum < 0.8 (confidence gate)', async () => {
    // Feedback rows 3+ but all very old -> weightCorrection ~ 0.1 each -> weighted-sum < 0.8
    const ancient = new Date(Date.now() - 86_400_000 * 365); // 1 year old
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
    ]);
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue([
      { id: 'f1', tenantId: 't1', createdAt: ancient, newValue: 'L1', emailId: 'e1' },
      { id: 'f2', tenantId: 't1', createdAt: ancient, newValue: 'L1', emailId: 'e2' },
      { id: 'f3', tenantId: 't1', createdAt: ancient, newValue: 'L1', emailId: 'e3' },
    ]);
    prismaMock.email.findMany.mockResolvedValue([
      { id: 'e1', from: 'boss@acme.com' },
      { id: 'e2', from: 'boss@acme.com' },
      { id: 'e3', from: 'boss@acme.com' },
    ]);

    await processAffinityPromotionForTenant('t1', deps(), 'job-1', new Date());

    expect(prismaMock.graphEdge.upsert).not.toHaveBeenCalled();
  });

  it('updates existing edge (upsert path, action=updated)', async () => {
    const recent = new Date(Date.now() - 86_400_000);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
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
    prismaMock.graphNode.upsert.mockResolvedValue({ id: 'node1' });
    // Simulate existing edge so upsert returns the UPDATE path — helper must detect via presence check (count > 0)
    prismaMock.graphEdge.count.mockResolvedValue(1);
    prismaMock.graphEdge.upsert.mockResolvedValue({ id: 'edge1' });

    const result = await processAffinityPromotionForTenant('t1', deps(), 'job-1', new Date());

    expect(result.sendersUpdated).toBeGreaterThanOrEqual(1);
    expect(promotionCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updated' }),
    );
  });

  it('domain aggregation requires >= 3 distinct senders (Phase 147 D-04 inherited per Open Q1)', async () => {
    // 1 sender x 9 corrections — must NOT promote a domain edge
    const recent = new Date(Date.now() - 86_400_000);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
    ]);
    const feedback = Array.from({ length: 9 }, (_, i) => ({
      id: `f${i}`,
      tenantId: 't1',
      createdAt: recent,
      newValue: 'L1',
      emailId: `e${i}`,
    }));
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue(feedback);
    prismaMock.email.findMany.mockResolvedValue(
      feedback.map((f) => ({ id: f.emailId, from: 'boss@acme.com' })),
    );

    await processAffinityPromotionForTenant('t1', deps(), 'job-1', new Date());

    // NO DOMAIN_LABEL_AFFINITY upsert (sender edge may still be created — that's a separate concern)
    const domainUpserts = prismaMock.graphEdge.upsert.mock.calls.filter(
      ([arg]: any[]) =>
        arg.where?.tenantId_sourceId_targetId_edgeType?.edgeType === 'DOMAIN_LABEL_AFFINITY',
    );
    expect(domainUpserts.length).toBe(0);
  });

  it('excludes role-account local-parts (info@, sales@) from domain aggregation', async () => {
    const recent = new Date(Date.now() - 86_400_000);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'o1', tenantId: 't1', type: 'sender', pattern: 'info@acme.com', action: 'L1' },
      { id: 'o2', tenantId: 't1', type: 'sender', pattern: 'sales@acme.com', action: 'L1' },
      { id: 'o3', tenantId: 't1', type: 'sender', pattern: 'support@acme.com', action: 'L1' },
    ]);
    const feedback = ['info', 'sales', 'support'].flatMap((p, i) =>
      Array.from({ length: 3 }, (_, j) => ({
        id: `f${i}-${j}`,
        tenantId: 't1',
        createdAt: recent,
        newValue: 'L1',
        emailId: `e${i}-${j}`,
      })),
    );
    prismaMock.emailTriageFeedback.findMany.mockResolvedValue(feedback);
    prismaMock.email.findMany.mockResolvedValue([
      ...Array.from({ length: 3 }, (_, j) => ({ id: `e0-${j}`, from: 'info@acme.com' })),
      ...Array.from({ length: 3 }, (_, j) => ({ id: `e1-${j}`, from: 'sales@acme.com' })),
      ...Array.from({ length: 3 }, (_, j) => ({ id: `e2-${j}`, from: 'support@acme.com' })),
    ]);

    await processAffinityPromotionForTenant('t1', deps(), 'job-1', new Date());

    // All 3 senders are role accounts -> 0 distinct non-role senders -> no domain edge
    const domainUpserts = prismaMock.graphEdge.upsert.mock.calls.filter(
      ([arg]: any[]) =>
        arg.where?.tenantId_sourceId_targetId_edgeType?.edgeType === 'DOMAIN_LABEL_AFFINITY',
    );
    expect(domainUpserts.length).toBe(0);
  });

  it('writes derivedFromOverrideIds + promotionAudit into metadata JSONB — D-01a; resolves fb.newValue via UserLabel.findFirst', async () => {
    const recent = new Date(Date.now() - 86_400_000);
    prismaMock.triageOverride.findMany.mockResolvedValue([
      { id: 'override-123', tenantId: 't1', type: 'sender', pattern: 'boss@acme.com', action: 'L1' },
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
    // B-3: newValue='L1' resolves to Label {id:'L1', name:'Work'}; helper writes externalId='L1' on the label GraphNode.
    prismaMock.userLabel.findFirst.mockResolvedValue({ id: 'L1' });
    prismaMock.graphNode.upsert.mockResolvedValue({ id: 'node1' });
    prismaMock.graphEdge.upsert.mockResolvedValue({ id: 'edge1' });

    const jobTimestamp = new Date('2026-04-24T03:00:00Z');
    await processAffinityPromotionForTenant('t1', deps(), 'job-abc', jobTimestamp);

    // Helper MUST call userLabel.findFirst to resolve newValue to a canonical labelId
    expect(prismaMock.userLabel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          OR: expect.arrayContaining([
            expect.objectContaining({ id: 'L1' }),
            expect.objectContaining({ name: 'L1' }),
          ]),
        }),
      }),
    );

    expect(prismaMock.graphEdge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            derivedFromOverrideIds: expect.arrayContaining(['override-123']),
            promotionAudit: expect.objectContaining({
              jobId: 'job-abc',
              jobTimestamp: '2026-04-24T03:00:00.000Z',
              halfLifeDays: 14,
            }),
          }),
        }),
      }),
    );
  });
});
