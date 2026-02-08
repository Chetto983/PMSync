import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HitlService, PendingActionStatus } from '../hitl.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../../../common/services/redis-lock.service';
import { LearningService } from '../learning.service';
import { ActionStatus, ActionType } from '@prisma/client';

const mockPrismaService = {
  actionQueue: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockRealtimeEvents = {
  emitAiActionCreated: jest.fn(),
  emitAiActionApproved: jest.fn(),
  emitAiActionRejected: jest.fn(),
  emitAiActionExecuted: jest.fn(),
  emitAiActionFailed: jest.fn(),
};

const mockLearningService = {
  recordFeedback: jest.fn(),
  getAdjustedConfidence: jest.fn(),
};

const mockRedisLock = {
  withLock: jest.fn((key, ttl, fn) => fn()), // Default: execute immediately
};

const mockConfigService = {
  get: jest.fn((key, defaultValue) => {
    if (key === 'ai.hitl.actionExpirationHours') return 24;
    if (key === 'ai.hitl.maxPendingActionsPerUser') return 50;
    return defaultValue;
  }),
};

describe('HitlService', () => {
  let service: HitlService;
  let prisma: typeof mockPrismaService;
  let realtime: typeof mockRealtimeEvents;
  let learning: typeof mockLearningService;
  let redisLock: typeof mockRedisLock;

  const tenantId = 'tenant-123';
  const userId = 'user-456';
  const actionId = 'action-789';
  const agentName = 'EmailAgent';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HitlService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RealtimeEventsService, useValue: mockRealtimeEvents },
        { provide: LearningService, useValue: mockLearningService },
        { provide: RedisLockService, useValue: mockRedisLock },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HitlService>(HitlService);
    prisma = module.get(PrismaService);
    realtime = module.get(RealtimeEventsService);
    learning = module.get(LearningService);
    redisLock = module.get(RedisLockService);
  });

  describe('createPendingAction', () => {
    it('should create a pending action with correct status', async () => {
      mockPrismaService.actionQueue.count.mockResolvedValue(5);
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId });
      mockPrismaService.actionQueue.findFirst.mockResolvedValue(null); // No duplicate
      mockPrismaService.actionQueue.findMany.mockResolvedValue([]); // No superseded
      mockPrismaService.actionQueue.create.mockResolvedValue({
        id: actionId,
        tenantId,
        userId,
        actionType: ActionType.SEND_EMAIL,
        status: ActionStatus.PENDING_APPROVAL,
        confidence: 0.85,
      });

      const result = await service.createPendingAction({
        tenantId,
        userId,
        agentName,
        action: {
          type: 'SEND_EMAIL',
          payload: { to: 'test@example.com', subject: 'Test' },
          confidence: 0.85,
        },
      });

      expect(result).toBe(actionId);
      expect(prisma.actionQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            userId,
            actionType: ActionType.SEND_EMAIL,
            status: ActionStatus.PENDING_APPROVAL,
            confidence: 0.85,
          }),
        }),
      );
      expect(realtime.emitAiActionCreated).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          actionId,
          status: 'pending',
        }),
      );
    });

    it('should enforce max pending actions per user', async () => {
      mockPrismaService.actionQueue.count.mockResolvedValue(50); // At limit

      await expect(
        service.createPendingAction({
          tenantId,
          userId,
          agentName,
          action: {
            type: 'SEND_EMAIL',
            payload: { to: 'test@example.com' },
            confidence: 0.9,
          },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.actionQueue.create).not.toHaveBeenCalled();
    });

    it('should use Redis lock to prevent duplicate actions', async () => {
      mockPrismaService.actionQueue.count.mockResolvedValue(0);
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId });
      mockPrismaService.actionQueue.findFirst.mockResolvedValue(null);
      mockPrismaService.actionQueue.findMany.mockResolvedValue([]);
      mockPrismaService.actionQueue.create.mockResolvedValue({ id: actionId });

      await service.createPendingAction({
        tenantId,
        userId,
        agentName,
        action: {
          type: 'SEND_EMAIL',
          payload: { to: 'test@example.com' },
          confidence: 0.9,
        },
      });

      expect(redisLock.withLock).toHaveBeenCalledWith(
        expect.stringContaining('hitl:action:'),
        5000,
        expect.any(Function),
      );
    });

    it('should return existing action ID if duplicate detected', async () => {
      const existingId = 'existing-action-123';
      mockPrismaService.actionQueue.count.mockResolvedValue(5);
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId });
      mockPrismaService.actionQueue.findFirst.mockResolvedValue({ id: existingId });

      const result = await service.createPendingAction({
        tenantId,
        userId,
        agentName,
        action: {
          type: 'SEND_EMAIL',
          payload: { to: 'test@example.com' },
          confidence: 0.9,
        },
      });

      expect(result).toBe(existingId);
      expect(prisma.actionQueue.create).not.toHaveBeenCalled();
      expect(realtime.emitAiActionCreated).not.toHaveBeenCalled();
    });
  });

  describe('approveAction', () => {
    it('should approve pending action and record feedback', async () => {
      const pendingAction = {
        id: actionId,
        tenantId,
        userId,
        actionType: ActionType.SEND_EMAIL,
        status: ActionStatus.PENDING_APPROVAL,
        confidence: 0.85,
        actionPayload: { agentName, severity: 'MEDIUM' },
        expiresAt: new Date(Date.now() + 60000),
      };

      mockPrismaService.actionQueue.findFirst.mockResolvedValue(pendingAction);
      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approveAction(tenantId, actionId, 'approver-123');

      expect(result).toEqual({
        actionId,
        status: PendingActionStatus.APPROVED,
      });

      expect(prisma.actionQueue.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: actionId,
          tenantId,
          status: ActionStatus.PENDING_APPROVAL,
        }),
        data: expect.objectContaining({
          status: ActionStatus.APPROVED,
          approvedBy: 'approver-123',
        }),
      });

      expect(learning.recordFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId,
          tenantId,
          wasApproved: true,
          wasExecuted: false,
          originalConfidence: 0.85,
        }),
      );

      expect(realtime.emitAiActionApproved).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid action ID', async () => {
      mockPrismaService.actionQueue.findFirst.mockResolvedValue(null);

      await expect(
        service.approveAction(tenantId, 'invalid-id', 'approver-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for already approved action', async () => {
      const approvedAction = {
        id: actionId,
        tenantId,
        userId,
        status: ActionStatus.APPROVED,
        actionPayload: {},
        expiresAt: new Date(Date.now() + 60000),
      };

      mockPrismaService.actionQueue.findFirst
        .mockResolvedValueOnce(approvedAction) // First call in getPendingAction
        .mockResolvedValueOnce(approvedAction); // Second call after updateMany fails

      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approveAction(tenantId, actionId, 'approver-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for expired action', async () => {
      const expiredAction = {
        id: actionId,
        tenantId,
        userId,
        status: ActionStatus.PENDING_APPROVAL,
        actionPayload: {},
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      };

      mockPrismaService.actionQueue.findFirst
        .mockResolvedValueOnce(expiredAction)
        .mockResolvedValueOnce(expiredAction);

      mockPrismaService.actionQueue.updateMany
        .mockResolvedValueOnce({ count: 0 }) // Approval fails
        .mockResolvedValueOnce({ count: 1 }); // Mark as expired succeeds

      await expect(
        service.approveAction(tenantId, actionId, 'approver-123'),
      ).rejects.toThrow(ForbiddenException);

      // Should mark as expired
      expect(prisma.actionQueue.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: actionId, tenantId },
          data: { status: ActionStatus.EXPIRED },
        }),
      );
    });
  });

  describe('rejectAction', () => {
    it('should reject pending action and record feedback', async () => {
      const pendingAction = {
        id: actionId,
        tenantId,
        userId,
        actionType: ActionType.SEND_EMAIL,
        status: ActionStatus.PENDING_APPROVAL,
        confidence: 0.85,
        actionPayload: { agentName, severity: 'MEDIUM' },
      };

      mockPrismaService.actionQueue.findFirst.mockResolvedValue(pendingAction);
      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rejectAction(
        tenantId,
        actionId,
        'rejector-123',
        undefined,
        'Not appropriate',
      );

      expect(result).toEqual({
        actionId,
        status: PendingActionStatus.REJECTED,
      });

      expect(prisma.actionQueue.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: actionId,
          tenantId,
          status: ActionStatus.PENDING_APPROVAL,
        }),
        data: expect.objectContaining({
          status: ActionStatus.REJECTED,
          rejectedReason: 'Not appropriate',
        }),
      });

      expect(learning.recordFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId,
          tenantId,
          wasApproved: false,
          wasExecuted: false,
          userFeedback: 'Not appropriate',
        }),
      );

      expect(realtime.emitAiActionRejected).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if action already processed', async () => {
      const processedAction = {
        id: actionId,
        tenantId,
        status: ActionStatus.EXECUTED,
        actionPayload: {},
      };

      mockPrismaService.actionQueue.findFirst
        .mockResolvedValueOnce(processedAction)
        .mockResolvedValueOnce(processedAction);

      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.rejectAction(tenantId, actionId, 'rejector-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markExecuted', () => {
    it('should mark action as executed on success', async () => {
      const approvedAction = {
        id: actionId,
        tenantId,
        userId,
        actionType: ActionType.SEND_EMAIL,
        confidence: 0.9,
        actionPayload: { agentName, severity: 'LOW' },
      };

      mockPrismaService.actionQueue.findFirst.mockResolvedValue(approvedAction);
      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 1 });

      await service.markExecuted(tenantId, actionId, true);

      expect(prisma.actionQueue.updateMany).toHaveBeenCalledWith({
        where: { id: actionId, tenantId },
        data: expect.objectContaining({
          status: ActionStatus.EXECUTED,
          executedAt: expect.any(Date),
        }),
      });

      expect(realtime.emitAiActionExecuted).toHaveBeenCalled();
    });

    it('should mark action as failed on error', async () => {
      const approvedAction = {
        id: actionId,
        tenantId,
        userId,
        actionType: ActionType.SEND_EMAIL,
        confidence: 0.9,
        actionPayload: { agentName, severity: 'LOW' },
      };

      mockPrismaService.actionQueue.findFirst.mockResolvedValue(approvedAction);
      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 1 });

      await service.markExecuted(tenantId, actionId, false, 'Network error');

      expect(prisma.actionQueue.updateMany).toHaveBeenCalledWith({
        where: { id: actionId, tenantId },
        data: expect.objectContaining({
          status: ActionStatus.FAILED,
          executionError: 'Network error',
        }),
      });

      expect(realtime.emitAiActionFailed).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredActions', () => {
    it('should mark expired pending actions', async () => {
      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.cleanupExpiredActions();

      expect(result).toBe(3);
      expect(prisma.actionQueue.updateMany).toHaveBeenCalledWith({
        where: {
          status: ActionStatus.PENDING_APPROVAL,
          expiresAt: {
            lt: expect.any(Date),
          },
        },
        data: {
          status: ActionStatus.EXPIRED,
        },
      });
    });

    it('should return 0 if no actions expired', async () => {
      mockPrismaService.actionQueue.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.cleanupExpiredActions();

      expect(result).toBe(0);
    });
  });

  describe('getBulkApprovalLevel', () => {
    it('should return immediate for 1-2 items', () => {
      expect(service.getBulkApprovalLevel(1)).toBe('immediate');
      expect(service.getBulkApprovalLevel(2)).toBe('immediate');
    });

    it('should return preview for 3-5 items', () => {
      expect(service.getBulkApprovalLevel(3)).toBe('preview');
      expect(service.getBulkApprovalLevel(5)).toBe('preview');
    });

    it('should return confirm for 6-20 items', () => {
      expect(service.getBulkApprovalLevel(6)).toBe('confirm');
      expect(service.getBulkApprovalLevel(20)).toBe('confirm');
    });

    it('should return staged for 21+ items', () => {
      expect(service.getBulkApprovalLevel(21)).toBe('staged');
      expect(service.getBulkApprovalLevel(100)).toBe('staged');
    });
  });

  describe('requiresBulkApproval', () => {
    it('should return false for 1-2 items (immediate execution)', () => {
      expect(service.requiresBulkApproval(1)).toBe(false);
      expect(service.requiresBulkApproval(2)).toBe(false);
    });

    it('should return true for 3+ items (requires approval)', () => {
      expect(service.requiresBulkApproval(3)).toBe(true);
      expect(service.requiresBulkApproval(10)).toBe(true);
      expect(service.requiresBulkApproval(100)).toBe(true);
    });
  });

  describe('getActionCounts', () => {
    it('should return counts grouped by status', async () => {
      mockPrismaService.actionQueue.groupBy.mockResolvedValue([
        { status: ActionStatus.PENDING_APPROVAL, _count: { status: 5 } },
        { status: ActionStatus.APPROVED, _count: { status: 3 } },
        { status: ActionStatus.EXECUTED, _count: { status: 10 } },
      ]);

      const counts = await service.getActionCounts(tenantId);

      expect(counts).toEqual({
        PENDING_APPROVAL: 5,
        APPROVED: 3,
        EXECUTED: 10,
      });
    });

    it('should filter by userId if provided', async () => {
      mockPrismaService.actionQueue.groupBy.mockResolvedValue([]);

      await service.getActionCounts(tenantId, userId);

      expect(prisma.actionQueue.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { tenantId, userId },
        _count: { status: true },
      });
    });
  });
});
