/**
 * Phase 2 Intelligence Layer — Integration Tests
 *
 * Validates the end-to-end flow across all Phase 2 modules:
 * Feature Compute → Lead Scoring → Forecasting → Churn → NBA → Governance
 *
 * Uses mocked PrismaService to verify service wiring and data flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GovernanceService } from '../governance/governance.service';
import { DriftDetectionService } from '../governance/drift-detection.service';
import { ModelRetrainService } from '../governance/model-retrain.service';

// ============ Mock PrismaService ============

function createMockPrisma() {
  return {
    aiRunLedger: {
      count: vi.fn().mockResolvedValue(150),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { estimatedCostUsd: 0.45, totalTokens: 50000 },
        _avg: { qualityScore: 0.72 },
      }),
      groupBy: vi.fn().mockResolvedValue([
        { model: 'mistral-small-latest', _sum: { estimatedCostUsd: 0.3, totalTokens: 30000 }, _count: { id: 80 } },
        { model: 'nvidia/nemotron-3-nano-30b-a3b', _sum: { estimatedCostUsd: 0.15, totalTokens: 20000 }, _count: { id: 70 } },
      ]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    forecastSnapshot: {
      findMany: vi.fn().mockResolvedValue([
        { createdAt: new Date('2026-03-01'), mape: 0.15 },
        { createdAt: new Date('2026-03-15'), mape: 0.12 },
      ]),
    },
    modelEvaluation: {
      findMany: vi.fn().mockResolvedValue([
        {
          modelType: 'lead_scoring',
          version: 'v1.2',
          isActive: true,
          trainedAt: new Date('2026-03-10'),
          metrics: { aucRoc: 0.82, precision: 0.75, recall: 0.68 },
        },
      ]),
    },
    leadFeatureStore: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driftCheck: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

// ============ Tests ============

describe('Phase 2 Integration — Governance Service', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let governanceService: GovernanceService;

  beforeEach(() => {
    prisma = createMockPrisma();
    governanceService = new GovernanceService(prisma as any);
  });

  it('getOverview returns correct KPIs from aggregated data', async () => {
    const overview = await governanceService.getOverview('tenant-1');

    expect(overview.totalPredictions).toBe(150);
    expect(overview.averageAccuracy).toBe(72); // 0.72 * 100 rounded
    expect(overview.monthlyCost).toBe(0.45);
    expect(overview.activeModels).toBe(2);

    // Verify all 4 queries were called (parallelized)
    expect(prisma.aiRunLedger.count).toHaveBeenCalledOnce();
    expect(prisma.aiRunLedger.aggregate).toHaveBeenCalledTimes(2);
    expect(prisma.aiRunLedger.groupBy).toHaveBeenCalledOnce();
  });

  it('getOverview filters by tenantId on all queries', async () => {
    await governanceService.getOverview('tenant-xyz');

    const countCall = prisma.aiRunLedger.count.mock.calls[0][0];
    expect(countCall.where.tenantId).toBe('tenant-xyz');

    const aggCall = prisma.aiRunLedger.aggregate.mock.calls[0][0];
    expect(aggCall.where.tenantId).toBe('tenant-xyz');
  });

  it('getCostBreakdown groups by predictionType with legacy fallback', async () => {
    prisma.aiRunLedger.groupBy
      .mockResolvedValueOnce([
        { predictionType: 'LEAD_SCORE', _sum: { estimatedCostUsd: 0.2, totalTokens: 10000 }, _count: { id: 50 } },
      ])
      .mockResolvedValueOnce([
        { runType: 'chat', _sum: { estimatedCostUsd: 0.1, totalTokens: 5000 }, _count: { id: 30 } },
      ]);

    const costs = await governanceService.getCostBreakdown('tenant-1', '30d' as any);

    expect(costs).toHaveLength(2);
    expect(costs[0].predictionType).toBe('LEAD_SCORE');
    expect(costs[0].totalCost).toBe(0.2);
    expect(costs[1].predictionType).toBe('chat');
  });

  it('getAccuracyMetrics returns forecast MAPE and model evaluation data', async () => {
    const points = await governanceService.getAccuracyMetrics('tenant-1', '30d' as any);

    // Should have forecast MAPE points + model evaluation points (auc, precision, recall)
    const forecastPoints = points.filter((p) => p.modelType === 'forecast');
    expect(forecastPoints.length).toBe(2);
    expect(forecastPoints[0].metric).toBe('mape');

    const evalPoints = points.filter((p) => p.modelType === 'lead_scoring');
    expect(evalPoints.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 2 Integration — Drift Detection Service', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let driftService: DriftDetectionService;

  beforeEach(() => {
    prisma = createMockPrisma();
    driftService = new DriftDetectionService(prisma as any);
  });

  it('returns empty array when insufficient samples', async () => {
    prisma.leadFeatureStore.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        features: { engagement: { emailsSent: i * 2 } },
        computedAt: new Date(2026, 0, i + 1),
      })),
    );

    const results = await driftService.checkLeadScoringDrift('tenant-1');
    // 50 samples < MIN_SAMPLES * 2 (100), so empty
    expect(results).toEqual([]);
  });

  it('computes PSI for features with sufficient data', async () => {
    // Create 200 feature records (100 baseline + 100 current) with drift
    const records = Array.from({ length: 200 }, (_, i) => ({
      features: {
        engagement: {
          emailsSent: i < 100 ? 10 + Math.random() * 5 : 30 + Math.random() * 10,
        },
      },
      computedAt: new Date(2026, 0, i + 1),
    }));
    prisma.leadFeatureStore.findMany.mockResolvedValue(records);

    const results = await driftService.checkLeadScoringDrift('tenant-1');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('feature');
    expect(results[0]).toHaveProperty('psi');
    expect(results[0]).toHaveProperty('status');
    expect(['stable', 'warning', 'critical']).toContain(results[0].status);
    expect(results[0].psi).toBeGreaterThan(0);
  });

  it('getLatestDriftResults returns empty when no checks exist', async () => {
    const results = await driftService.getLatestDriftResults('tenant-1');
    expect(results).toEqual([]);
  });
});

describe('Phase 2 Integration — Model Retrain Service', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let retrainService: ModelRetrainService;

  beforeEach(() => {
    prisma = createMockPrisma();
    retrainService = new ModelRetrainService(prisma as any);
  });

  it('getModelRegistry returns evaluations + known defaults', async () => {
    const registry = await retrainService.getModelRegistry('tenant-1');

    // Should have lead_scoring from evaluations + churn_prediction and forecast as defaults
    expect(registry.length).toBeGreaterThanOrEqual(3);

    const leadScoring = registry.find((m) => m.modelType === 'lead_scoring');
    expect(leadScoring).toBeDefined();
    expect(leadScoring!.version).toBe('v1.2');
    expect(leadScoring!.accuracy).toBe(0.82); // aucRoc

    const churn = registry.find((m) => m.modelType === 'churn_prediction');
    expect(churn).toBeDefined();
    expect(churn!.version).toBe('v0 (rule-based)');
  });
});
