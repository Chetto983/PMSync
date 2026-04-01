/**
 * Unit tests for AiRunLedgerService prom-client counter integration (OBS-04).
 *
 * Verifies that recordRun():
 * - Increments tokensCounter twice (prompt + completion)
 * - Increments costCounter with estimated cost
 * - Increments requestsCounter with model/run_type/status
 * - Works without error when counters are undefined (@Optional not injected)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register } from 'prom-client';
import { AiRunLedgerService, RecordRunParams, COST_MAP } from '../ai-run-ledger.service';

beforeEach(() => {
  register.clear();
});

function createMockPrisma() {
  return {
    aiRunLedger: {
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
  };
}

function createMockCounter() {
  return { inc: vi.fn() };
}

const sampleParams: RecordRunParams = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  runType: 'briefing',
  model: 'mistral-small-latest',
  promptTokens: 500,
  completionTokens: 200,
  totalTokens: 700,
  latencyMs: 1200,
};

const createMockAnalytics = () => ({ checkCostThreshold: vi.fn().mockResolvedValue(undefined) });

describe('AiRunLedgerService - prom-client counters', () => {
  it('should increment tokensCounter for prompt and completion tokens', async () => {
    const prisma = createMockPrisma();
    const tokensCounter = createMockCounter();
    const costCounter = createMockCounter();
    const requestsCounter = createMockCounter();

    const service = new AiRunLedgerService(
      prisma as any,
      createMockAnalytics() as any,
      tokensCounter as any,
      costCounter as any,
      requestsCounter as any,
    );

    await service.recordRun(sampleParams);

    expect(tokensCounter.inc).toHaveBeenCalledTimes(2);
    expect(tokensCounter.inc).toHaveBeenCalledWith(
      { model: 'mistral-small-latest', type: 'prompt' },
      500,
    );
    expect(tokensCounter.inc).toHaveBeenCalledWith(
      { model: 'mistral-small-latest', type: 'completion' },
      200,
    );
  });

  it('should increment costCounter with estimated cost', async () => {
    const prisma = createMockPrisma();
    const tokensCounter = createMockCounter();
    const costCounter = createMockCounter();
    const requestsCounter = createMockCounter();

    const service = new AiRunLedgerService(
      prisma as any,
      createMockAnalytics() as any,
      tokensCounter as any,
      costCounter as any,
      requestsCounter as any,
    );

    await service.recordRun(sampleParams);

    // Cost = (500 * 0.06 + 200 * 0.18) / 1_000_000
    const expectedCost =
      (500 * COST_MAP['mistral-small-latest'].input +
        200 * COST_MAP['mistral-small-latest'].output) /
      1_000_000;

    expect(costCounter.inc).toHaveBeenCalledTimes(1);
    expect(costCounter.inc).toHaveBeenCalledWith(
      { model: 'mistral-small-latest' },
      expectedCost,
    );
  });

  it('should increment requestsCounter with model, run_type, and status', async () => {
    const prisma = createMockPrisma();
    const tokensCounter = createMockCounter();
    const costCounter = createMockCounter();
    const requestsCounter = createMockCounter();

    const service = new AiRunLedgerService(
      prisma as any,
      createMockAnalytics() as any,
      tokensCounter as any,
      costCounter as any,
      requestsCounter as any,
    );

    await service.recordRun(sampleParams);

    expect(requestsCounter.inc).toHaveBeenCalledTimes(1);
    expect(requestsCounter.inc).toHaveBeenCalledWith({
      model: 'mistral-small-latest',
      run_type: 'briefing',
      status: 'success', // lowercased in service
    });
  });

  it('should work without error when counters are undefined (@Optional)', async () => {
    const prisma = createMockPrisma();

    // Counters not injected (undefined)
    const mockAnalytics = { checkCostThreshold: vi.fn().mockResolvedValue(undefined) };
    const service = new AiRunLedgerService(
      prisma as any,
      mockAnalytics as any,
      undefined,
      undefined,
      undefined,
    );

    // Should not throw
    await expect(service.recordRun(sampleParams)).resolves.toBeUndefined();

    // Verify the DB write still happened
    expect(prisma.aiRunLedger.create).toHaveBeenCalledTimes(1);
  });
});
