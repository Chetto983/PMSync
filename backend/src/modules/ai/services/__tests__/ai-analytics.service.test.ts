import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiRunStatus } from '@prisma/client';
import { AiAnalyticsService } from '../ai-analytics.service';

describe('AiAnalyticsService', () => {
  let service: AiAnalyticsService;
  let mockPrisma: {
    aiRunLedger: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let mockConfig: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      aiRunLedger: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockConfig = {
      get: vi.fn().mockReturnValue(50),
    };
    service = new AiAnalyticsService(mockPrisma as any, mockConfig as any);
  });

  it('scores successful non-chat runs as schema-complete', async () => {
    mockPrisma.aiRunLedger.findMany.mockResolvedValue([
      {
        id: 'run-1',
        status: AiRunStatus.SUCCESS,
        runType: 'briefing',
        latencyMs: 1800,
        toolCallCount: 0,
        totalTokens: 400,
        hitlRequired: false,
      },
    ]);

    const result = await service.scoreRecentRuns('tenant-1');

    expect(result).toEqual({ scored: 1 });
    expect(mockPrisma.aiRunLedger.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        qualityScore: 1,
        qualityMethod: 'schema-completeness',
      },
    });
  });

  it('scores failed runs as zero with runtime-outcome method', async () => {
    mockPrisma.aiRunLedger.findMany.mockResolvedValue([
      {
        id: 'run-2',
        status: AiRunStatus.FAILED,
        runType: 'chat',
        latencyMs: 30_000,
        toolCallCount: 1,
        totalTokens: 200,
        hitlRequired: true,
      },
    ]);

    await service.scoreRecentRuns('tenant-1');

    expect(mockPrisma.aiRunLedger.update).toHaveBeenCalledWith({
      where: { id: 'run-2' },
      data: {
        qualityScore: 0,
        qualityMethod: 'runtime-outcome-v1',
      },
    });
  });

  it('scores successful chat runs with the runtime heuristic', async () => {
    mockPrisma.aiRunLedger.findMany.mockResolvedValue([
      {
        id: 'run-3',
        status: AiRunStatus.SUCCESS,
        runType: 'chat',
        latencyMs: 3_500,
        toolCallCount: 2,
        totalTokens: 280,
        hitlRequired: false,
      },
    ]);

    await service.scoreRecentRuns('tenant-1');

    expect(mockPrisma.aiRunLedger.update).toHaveBeenCalledWith({
      where: { id: 'run-3' },
      data: {
        qualityScore: 0.95,
        qualityMethod: 'runtime-heuristic-v1',
      },
    });
  });

  it('clamps successful chat runs with HITL to a max score of 1.0', async () => {
    mockPrisma.aiRunLedger.findMany.mockResolvedValue([
      {
        id: 'run-4',
        status: AiRunStatus.SUCCESS,
        runType: 'chat',
        latencyMs: 2_500,
        toolCallCount: 1,
        totalTokens: 120,
        hitlRequired: true,
      },
    ]);

    await service.scoreRecentRuns('tenant-1');

    expect(mockPrisma.aiRunLedger.update).toHaveBeenCalledWith({
      where: { id: 'run-4' },
      data: {
        qualityScore: 1,
        qualityMethod: 'runtime-heuristic-v1',
      },
    });
  });
});
