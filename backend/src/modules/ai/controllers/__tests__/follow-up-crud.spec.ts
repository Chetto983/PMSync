import { FollowUpStatus } from '@prisma/client';

const mockPrisma = {
  emailFollowUp: {
    count: jest.fn(),
    updateMany: jest.fn(),
  },
};

// Import after mocks
import { AiController } from '../ai.controller';

function makeController() {
  // AiController constructor: (insights, kb, triage, backfill, prisma, briefing, followUp, draft)
  return new AiController(
    {} as any, // emailInsightsService
    {} as any, // knowledgeBaseService
    {} as any, // emailTriageService
    {} as any, // triageBackfillService
    mockPrisma as any, // prisma
    {} as any, // briefingService
    {} as any, // followUpDetectionService
    {} as any, // draftGenerationService
  );
}

const req = {
  user: { tenantId: 'tenant-1', userId: 'user-1' },
} as any;

describe('AiController - Follow-Up CRUD', () => {
  let controller: AiController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = makeController();
  });

  describe('getFollowUpStats', () => {
    it('should return counts for all statuses', async () => {
      mockPrisma.emailFollowUp.count
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(2)  // reminded
        .mockResolvedValueOnce(10) // resolved
        .mockResolvedValueOnce(3)  // expired
        .mockResolvedValueOnce(1)  // overdue
        .mockResolvedValueOnce(4); // dueToday

      const result = await controller.getFollowUpStats(req);

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        pending: 5, reminded: 2, resolved: 10, expired: 3, overdue: 1, dueToday: 4,
      });
      expect(mockPrisma.emailFollowUp.count).toHaveBeenCalledTimes(6);
    });

    it('should filter by tenantId and userId', async () => {
      mockPrisma.emailFollowUp.count.mockResolvedValue(0);
      await controller.getFollowUpStats(req);

      for (const call of mockPrisma.emailFollowUp.count.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }),
        );
      }
    });
  });

  describe('updateFollowUpStatus', () => {
    it('should update status to RESOLVED with resolvedAt', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.updateFollowUpStatus(req, 'fu-1', 'RESOLVED');

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(mockPrisma.emailFollowUp.updateMany).toHaveBeenCalledWith({
        where: { id: 'fu-1', tenantId: 'tenant-1', userId: 'user-1' },
        data: expect.objectContaining({
          status: FollowUpStatus.RESOLVED,
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should reject invalid status', async () => {
      const result = await controller.updateFollowUpStatus(req, 'fu-1', 'INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status');
      expect(mockPrisma.emailFollowUp.updateMany).not.toHaveBeenCalled();
    });

    it('should return error when not found', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 0 });

      const result = await controller.updateFollowUpStatus(req, 'non-existent', 'RESOLVED');

      expect(result.success).toBe(false);
    });

    it('should not set resolvedAt for non-RESOLVED status', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 1 });

      await controller.updateFollowUpStatus(req, 'fu-1', 'PENDING');

      const callData = mockPrisma.emailFollowUp.updateMany.mock.calls[0][0].data;
      expect(callData.resolvedAt).toBeUndefined();
    });
  });

  describe('snoozeFollowUp', () => {
    it('should snooze with valid future date', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 1 });
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      const result = await controller.snoozeFollowUp(req, 'fu-1', futureDate);

      expect(result.success).toBe(true);
      expect(result.dueDate).toBeDefined();
      expect(mockPrisma.emailFollowUp.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'fu-1',
          status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
        }),
        data: expect.objectContaining({
          status: FollowUpStatus.PENDING,
          remindCount: 0,
        }),
      });
    });

    it('should reject past date', async () => {
      const result = await controller.snoozeFollowUp(req, 'fu-1', '2020-01-01T00:00:00Z');

      expect(result.success).toBe(false);
      expect(result.error).toContain('future date');
    });

    it('should reject invalid date string', async () => {
      const result = await controller.snoozeFollowUp(req, 'fu-1', 'not-a-date');

      expect(result.success).toBe(false);
    });

    it('should return error when follow-up not found or resolved', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 0 });
      const futureDate = new Date(Date.now() + 86400000).toISOString();

      const result = await controller.snoozeFollowUp(req, 'fu-1', futureDate);

      expect(result.success).toBe(false);
    });
  });

  describe('deleteFollowUp', () => {
    it('should soft-delete by setting RESOLVED', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.deleteFollowUp(req, 'fu-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.emailFollowUp.updateMany).toHaveBeenCalledWith({
        where: { id: 'fu-1', tenantId: 'tenant-1', userId: 'user-1' },
        data: { status: FollowUpStatus.RESOLVED, resolvedAt: expect.any(Date) },
      });
    });

    it('should return error when not found', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 0 });

      const result = await controller.deleteFollowUp(req, 'non-existent');

      expect(result.success).toBe(false);
    });

    it('should enforce tenant isolation', async () => {
      mockPrisma.emailFollowUp.updateMany.mockResolvedValue({ count: 1 });
      await controller.deleteFollowUp(req, 'fu-1');

      expect(mockPrisma.emailFollowUp.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }),
        }),
      );
    });
  });
});
