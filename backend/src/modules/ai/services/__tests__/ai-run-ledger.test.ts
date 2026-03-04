/**
 * AiRunLedgerService Unit Tests
 *
 * Phase 35 Plan 01 -- Task 1 (TDD RED -> GREEN)
 * Tests: recordRun creates ledger entries, cost estimation, safeInt, fallback behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CorrelationContext BEFORE importing the service
vi.mock('../../../../common/services/correlation-context.service', () => ({
  CorrelationContext: {
    getContext: vi.fn(() => ({ correlationId: 'corr-abc-123' })),
  },
}));

import { AiRunLedgerService, COST_MAP, RecordRunParams } from '../ai-run-ledger.service';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';

describe('AiRunLedgerService', () => {
  let service: AiRunLedgerService;
  let mockPrisma: { aiRunLedger: { create: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    mockPrisma = {
      aiRunLedger: { create: vi.fn().mockResolvedValue({ id: 'led-001' }) },
    };
    service = new AiRunLedgerService(mockPrisma as any);
    vi.clearAllMocks();
  });

  it('recordRun creates a Prisma aiRunLedger entry with all fields mapped correctly', async () => {
    const params: RecordRunParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'chat',
      model: 'mistral-small-latest',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 320,
      toolCallCount: 2,
      hitlRequired: true,
      requestId: 'req-xyz',
    };

    await service.recordRun(params);

    expect(mockPrisma.aiRunLedger.create).toHaveBeenCalledOnce();
    const createArg = mockPrisma.aiRunLedger.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'chat',
      model: 'mistral-small-latest',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 320,
      toolCallCount: 2,
      hitlRequired: true,
      requestId: 'req-xyz',
    });
  });

  it('estimatedCostUsd is calculated from COST_MAP -- mistral-small-latest at 100 input + 50 output = (100*0.06 + 50*0.18)/1_000_000', async () => {
    const params: RecordRunParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'briefing',
      model: 'mistral-small-latest',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 200,
    };

    await service.recordRun(params);

    const createArg = mockPrisma.aiRunLedger.create.mock.calls[0][0];
    // (100 * 0.06 + 50 * 0.18) / 1_000_000 = (6 + 9) / 1_000_000 = 0.000015
    expect(createArg.data.estimatedCostUsd).toBeCloseTo(0.000015, 10);
  });

  it('unknown model falls back to mistral-small-latest pricing', async () => {
    const params: RecordRunParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'chat',
      model: 'unknown-model-xyz',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 100,
    };

    await service.recordRun(params);

    const createArg = mockPrisma.aiRunLedger.create.mock.calls[0][0];
    // Same as mistral-small-latest: (100*0.06 + 50*0.18)/1_000_000 = 0.000015
    expect(createArg.data.estimatedCostUsd).toBeCloseTo(0.000015, 10);
  });

  it('NaN/undefined token counts are coerced to 0 via safeInt', async () => {
    const params: RecordRunParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'chat',
      model: 'mistral-small-latest',
      promptTokens: NaN,
      completionTokens: undefined as any,
      totalTokens: Infinity,
      latencyMs: 100,
    };

    await service.recordRun(params);

    const createArg = mockPrisma.aiRunLedger.create.mock.calls[0][0];
    expect(createArg.data.promptTokens).toBe(0);
    expect(createArg.data.completionTokens).toBe(0);
    expect(createArg.data.totalTokens).toBe(0);
  });

  it('requestId falls back to CorrelationContext.getContext()?.correlationId when not provided', async () => {
    (CorrelationContext.getContext as ReturnType<typeof vi.fn>).mockReturnValue({
      correlationId: 'corr-fallback-id',
    });

    const params: RecordRunParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'chat',
      model: 'mistral-small-latest',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      latencyMs: 50,
      // requestId NOT provided -- should fallback
    };

    await service.recordRun(params);

    const createArg = mockPrisma.aiRunLedger.create.mock.calls[0][0];
    expect(createArg.data.requestId).toBe('corr-fallback-id');
  });

  it('status defaults to SUCCESS when not provided', async () => {
    const params: RecordRunParams = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runType: 'chat',
      model: 'mistral-small-latest',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      latencyMs: 50,
      // status NOT provided
    };

    await service.recordRun(params);

    const createArg = mockPrisma.aiRunLedger.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('SUCCESS');
  });
});
