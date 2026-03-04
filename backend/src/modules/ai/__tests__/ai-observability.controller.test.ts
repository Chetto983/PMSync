/**
 * AiObservabilityController Unit Tests
 *
 * Phase 35 Plan 02 -- Task 1 (TDD RED -> GREEN)
 * Tests: paginated runs query, date/runType filters, cost-summary aggregation, auth guards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiObservabilityController } from '../controllers/ai-observability.controller';
import { UseGuards } from '@nestjs/common';

// Reflect metadata helper to verify guard decorators
function getGuardMetadata(target: any): any[] {
  return Reflect.getMetadata('__guards__', target) ?? [];
}

describe('AiObservabilityController', () => {
  let controller: AiObservabilityController;
  let mockPrisma: {
    aiRunLedger: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
  };

  const mockReq = {
    user: {
      id: 'user-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'test@example.com',
      role: 'admin',
    },
  } as any;

  beforeEach(() => {
    mockPrisma = {
      aiRunLedger: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            estimatedCostUsd: null,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
          },
          _count: 0,
        }),
      },
    };
    controller = new AiObservabilityController(mockPrisma as any);
  });

  describe('GET /ai/runs', () => {
    it('returns paginated results with defaults (page=1, limit=20)', async () => {
      const mockRecords = [
        { id: 'run-1', runType: 'chat', createdAt: new Date('2026-03-01') },
        { id: 'run-2', runType: 'briefing', createdAt: new Date('2026-03-02') },
      ];
      mockPrisma.aiRunLedger.findMany.mockResolvedValue(mockRecords);
      mockPrisma.aiRunLedger.count.mockResolvedValue(2);

      const result = await controller.getRuns({}, mockReq);

      expect(result).toEqual({
        items: mockRecords,
        total: 2,
        page: 1,
        limit: 20,
      });
      expect(mockPrisma.aiRunLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('filters by startDate and endDate when provided', async () => {
      mockPrisma.aiRunLedger.findMany.mockResolvedValue([]);
      mockPrisma.aiRunLedger.count.mockResolvedValue(0);

      await controller.getRuns(
        { startDate: '2026-03-01T00:00:00Z', endDate: '2026-03-02T00:00:00Z' },
        mockReq,
      );

      const callArgs = mockPrisma.aiRunLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toEqual({
        gte: new Date('2026-03-01T00:00:00Z'),
        lte: new Date('2026-03-02T00:00:00Z'),
      });
    });

    it('filters by runType when provided', async () => {
      mockPrisma.aiRunLedger.findMany.mockResolvedValue([]);
      mockPrisma.aiRunLedger.count.mockResolvedValue(0);

      await controller.getRuns({ runType: 'chat' }, mockReq);

      const callArgs = mockPrisma.aiRunLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.runType).toBe('chat');
    });

    it('respects page and limit for pagination', async () => {
      mockPrisma.aiRunLedger.findMany.mockResolvedValue([]);
      mockPrisma.aiRunLedger.count.mockResolvedValue(100);

      const result = await controller.getRuns({ page: 3, limit: 10 }, mockReq);

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(mockPrisma.aiRunLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        }),
      );
    });
  });

  describe('GET /ai/runs/cost-summary', () => {
    it('returns aggregate cost data', async () => {
      mockPrisma.aiRunLedger.aggregate.mockResolvedValue({
        _sum: {
          estimatedCostUsd: 1.5,
          promptTokens: 10000,
          completionTokens: 5000,
          totalTokens: 15000,
        },
        _count: 42,
      });

      const result = await controller.getCostSummary({}, mockReq);

      expect(result).toEqual({
        totalCost: 1.5,
        totalPromptTokens: 10000,
        totalCompletionTokens: 5000,
        totalTokens: 15000,
        runCount: 42,
      });
    });

    it('filters cost-summary by date range', async () => {
      mockPrisma.aiRunLedger.aggregate.mockResolvedValue({
        _sum: {
          estimatedCostUsd: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
        },
        _count: 0,
      });

      await controller.getCostSummary(
        { startDate: '2026-03-01T00:00:00Z', endDate: '2026-03-02T00:00:00Z' },
        mockReq,
      );

      const callArgs = mockPrisma.aiRunLedger.aggregate.mock.calls[0][0];
      expect(callArgs.where.createdAt).toEqual({
        gte: new Date('2026-03-01T00:00:00Z'),
        lte: new Date('2026-03-02T00:00:00Z'),
      });
    });

    it('returns zeroed values when no records exist', async () => {
      const result = await controller.getCostSummary({}, mockReq);

      expect(result).toEqual({
        totalCost: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        runCount: 0,
      });
    });
  });

  describe('Auth guards', () => {
    it('has UseGuards decorator with JwtAuthGuard and TenantGuard on the controller class', () => {
      const guards = getGuardMetadata(AiObservabilityController);
      expect(guards.length).toBeGreaterThanOrEqual(2);

      // Verify guard names (NestJS stores constructor references)
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).toContain('JwtAuthGuard');
      expect(guardNames).toContain('TenantGuard');
    });
  });
});
