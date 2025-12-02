/**
 * VoltAgentController Unit Tests
 *
 * Tests for the VoltAgent REST API endpoints including:
 * - Chat endpoints (streaming and non-streaming)
 * - Stats endpoints (action counts, learning, aggregate)
 * - Feedback endpoints
 * - Action approval/rejection endpoints
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VoltAgentController } from './voltagent.controller';
import { VoltAgentService } from './voltagent.service';
import { FeedbackService, type LearningProfileStats } from './services/feedback.service';
import { HitlService } from './services/hitl.service';

describe('VoltAgentController', () => {
  let controller: VoltAgentController;
  let voltAgentService: jest.Mocked<VoltAgentService>;
  let feedbackService: jest.Mocked<FeedbackService>;
  let hitlService: jest.Mocked<HitlService>;

  const mockUser = {
    userId: 'user-123',
    tenantId: 'tenant-456',
    role: 'user',
  };

  const mockRequest = { user: mockUser } as any;

  beforeEach(async () => {
    const mockVoltAgentService = {
      chat: jest.fn(),
      streamChat: jest.fn(),
      submitActionForApproval: jest.fn(),
      resumeApproval: jest.fn(),
      getSuspendedWorkflows: jest.fn(),
      getSuspendedWorkflow: jest.fn(),
      getMetricsStats: jest.fn(),
      getRecentMetrics: jest.fn(),
    };

    const mockFeedbackService = {
      getLearningStats: jest.fn(),
      getAggregateStats: jest.fn(),
      getFeedbackHistory: jest.fn(),
      resetLearningProfile: jest.fn(),
    };

    const mockHitlService = {
      getActionCounts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoltAgentController],
      providers: [
        { provide: VoltAgentService, useValue: mockVoltAgentService },
        { provide: FeedbackService, useValue: mockFeedbackService },
        { provide: HitlService, useValue: mockHitlService },
      ],
    }).compile();

    controller = module.get<VoltAgentController>(VoltAgentController);
    voltAgentService = module.get(VoltAgentService);
    feedbackService = module.get(FeedbackService);
    hitlService = module.get(HitlService);
  });

  describe('chat', () => {
    it('should call voltAgentService.chat with correct options', async () => {
      const chatResult = {
        text: 'Hello! How can I help?',
        requiresApproval: false,
      };
      voltAgentService.chat.mockResolvedValue(chatResult);

      const body = {
        message: 'Hello',
        conversationId: 'conv-123',
        locale: 'en',
        model: 'small' as const,
      };

      const result = await controller.chat(mockRequest, body);

      expect(voltAgentService.chat).toHaveBeenCalledWith('Hello', {
        userId: 'user-123',
        tenantId: 'tenant-456',
        conversationId: 'conv-123',
        locale: 'en',
        model: 'small',
      });
      expect(result).toEqual(chatResult);
    });

    it('should return pending actions when requiresApproval is true', async () => {
      const chatResult = {
        text: 'I will send an email for you.',
        requiresApproval: true,
        pendingActions: [
          {
            id: 'action-1',
            actionType: 'SEND_EMAIL',
            severity: 'MEDIUM' as const,
            payload: { to: 'test@example.com' },
            summary: 'Send email to test@example.com',
          },
        ],
      };
      voltAgentService.chat.mockResolvedValue(chatResult);

      const result = await controller.chat(mockRequest, { message: 'Send email' });

      expect(result.requiresApproval).toBe(true);
      expect(result.pendingActions).toHaveLength(1);
    });
  });

  describe('getActionCounts', () => {
    it('should return action counts for tenant', async () => {
      const counts = {
        PENDING: 5,
        APPROVED: 10,
        REJECTED: 2,
        EXECUTED: 8,
      };
      hitlService.getActionCounts.mockResolvedValue(counts);

      const result = await controller.getActionCounts(mockRequest);

      expect(hitlService.getActionCounts).toHaveBeenCalledWith('tenant-456');
      expect(result).toEqual({ success: true, counts });
    });
  });

  describe('getLearningStats', () => {
    it('should return learning stats without userId filter', async () => {
      const stats: LearningProfileStats[] = [
        {
          agentName: 'EmailAgent',
          actionType: 'SEND_EMAIL',
          totalAttempts: 100,
          approvalRate: 0.85,
          successRate: 0.95,
          confidenceBoost: 0.05,
          avgOriginalConfidence: 0.8,
          avgAdjustedConfidence: 0.85,
        },
      ];
      feedbackService.getLearningStats.mockResolvedValue(stats);

      const result = await controller.getLearningStats(mockRequest, undefined);

      expect(feedbackService.getLearningStats).toHaveBeenCalledWith('tenant-456', undefined);
      expect(result).toEqual({ success: true, stats });
    });

    it('should return learning stats with userId filter', async () => {
      const stats: LearningProfileStats[] = [];
      feedbackService.getLearningStats.mockResolvedValue(stats);

      await controller.getLearningStats(mockRequest, 'specific-user');

      expect(feedbackService.getLearningStats).toHaveBeenCalledWith('tenant-456', 'specific-user');
    });
  });

  describe('getAggregateStats', () => {
    it('should return aggregate statistics', async () => {
      const stats = {
        totalAttempts: 500,
        overallApprovalRate: 0.88,
        overallSuccessRate: 0.92,
        agentBreakdown: {
          EmailAgent: {
            totalAttempts: 300,
            approvalRate: 0.9,
            actionTypes: ['SEND_EMAIL', 'DRAFT_EMAIL'],
          },
          CalendarAgent: {
            totalAttempts: 200,
            approvalRate: 0.85,
            actionTypes: ['CREATE_EVENT'],
          },
        },
      };
      feedbackService.getAggregateStats.mockResolvedValue(stats);

      const result = await controller.getAggregateStats(mockRequest);

      expect(feedbackService.getAggregateStats).toHaveBeenCalledWith('tenant-456');
      expect(result).toEqual({ success: true, stats });
    });
  });

  describe('getFeedbackHistory', () => {
    it('should return feedback history with default pagination', async () => {
      const feedbackData = {
        feedback: [
          {
            id: 'fb-1',
            actionId: 'action-1',
            agentName: 'EmailAgent',
            wasApproved: true,
            wasExecuted: true,
            wasSuccessful: true,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      };
      feedbackService.getFeedbackHistory.mockResolvedValue(feedbackData);

      const result = await controller.getFeedbackHistory(mockRequest);

      expect(feedbackService.getFeedbackHistory).toHaveBeenCalledWith('tenant-456', {
        userId: 'user-123',
        agentName: undefined,
        limit: 50,
        offset: 0,
      });
      expect(result).toEqual({ success: true, ...feedbackData });
    });

    it('should respect custom pagination and agent filter', async () => {
      feedbackService.getFeedbackHistory.mockResolvedValue({
        feedback: [],
        total: 0,
        limit: 10,
        offset: 20,
      });

      await controller.getFeedbackHistory(mockRequest, 10, 20, 'CalendarAgent');

      expect(feedbackService.getFeedbackHistory).toHaveBeenCalledWith('tenant-456', {
        userId: 'user-123',
        agentName: 'CalendarAgent',
        limit: 10,
        offset: 20,
      });
    });
  });

  describe('resetLearning', () => {
    it('should reset all learning when no agentName provided', async () => {
      feedbackService.resetLearningProfile.mockResolvedValue();

      const result = await controller.resetLearning(mockRequest, {});

      expect(feedbackService.resetLearningProfile).toHaveBeenCalledWith(
        'tenant-456',
        'user-123',
        'SupervisorAgent',
      );
      expect(result).toEqual({ success: true, message: 'All learning profiles reset' });
    });

    it('should reset learning for specific agent', async () => {
      feedbackService.resetLearningProfile.mockResolvedValue();

      const result = await controller.resetLearning(mockRequest, { agentName: 'EmailAgent' });

      expect(feedbackService.resetLearningProfile).toHaveBeenCalledWith(
        'tenant-456',
        'user-123',
        'EmailAgent',
        undefined,
      );
      expect(result.message).toContain('EmailAgent');
    });

    it('should reset learning for specific agent and action type', async () => {
      feedbackService.resetLearningProfile.mockResolvedValue();

      const result = await controller.resetLearning(mockRequest, {
        agentName: 'EmailAgent',
        actionType: 'SEND_EMAIL',
      });

      expect(feedbackService.resetLearningProfile).toHaveBeenCalledWith(
        'tenant-456',
        'user-123',
        'EmailAgent',
        'SEND_EMAIL',
      );
      expect(result.message).toContain('EmailAgent:SEND_EMAIL');
    });
  });

  describe('streamChat', () => {
    it('should stream chat response via SSE', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      // Mock the async generator
      async function* mockStreamChat() {
        yield 'Hello';
        yield ' there';
        yield '!';
      }
      voltAgentService.streamChat.mockReturnValue(mockStreamChat());

      await controller.streamChat(
        mockRequest,
        { message: 'Hi', locale: 'en' },
        mockRes as any,
      );

      // Verify SSE headers
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.flushHeaders).toHaveBeenCalled();

      // Verify chunks were sent
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"chunk"'),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"done"'),
      );
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle streaming errors', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      // Mock generator that throws
      async function* mockStreamChatError() {
        yield 'Start';
        throw new Error('Connection lost');
      }
      voltAgentService.streamChat.mockReturnValue(mockStreamChatError());

      await controller.streamChat(
        mockRequest,
        { message: 'Hi' },
        mockRes as any,
      );

      // Should send error event
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"'),
      );
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('Connection lost'),
      );
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  describe('getPendingActions', () => {
    it('should return pending actions for tenant', async () => {
      const suspended = [
        {
          executionId: 'exec-1',
          tenantId: 'tenant-456',
          userId: 'user-123',
          action: {
            actionType: 'SEND_EMAIL',
            severity: 'MEDIUM',
            summary: 'Send email',
            payload: { to: 'test@example.com' },
          },
          suspendReason: 'Requires approval',
          suspendedAt: new Date(),
        },
      ];
      voltAgentService.getSuspendedWorkflows.mockReturnValue(suspended);

      const result = await controller.getPendingActions(mockRequest);

      expect(voltAgentService.getSuspendedWorkflows).toHaveBeenCalledWith('tenant-456');
      expect(result.total).toBe(1);
      expect(result.actions[0].executionId).toBe('exec-1');
    });
  });

  describe('approveAction', () => {
    it('should approve pending action', async () => {
      const suspended = {
        executionId: 'exec-1',
        tenantId: 'tenant-456',
        userId: 'user-123',
        action: { actionType: 'SEND_EMAIL' },
      };
      voltAgentService.getSuspendedWorkflow.mockReturnValue(suspended);
      voltAgentService.resumeApproval.mockResolvedValue({ approved: true });

      const result = await controller.approveAction(mockRequest, 'exec-1');

      expect(voltAgentService.resumeApproval).toHaveBeenCalledWith('exec-1', {
        approved: true,
        approvedBy: 'user-123',
      });
      expect(result.status).toBe('approved');
    });

    it('should throw NotFoundException for missing workflow', async () => {
      voltAgentService.getSuspendedWorkflow.mockReturnValue(undefined);

      await expect(controller.approveAction(mockRequest, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for different tenant', async () => {
      voltAgentService.getSuspendedWorkflow.mockReturnValue({
        executionId: 'exec-1',
        tenantId: 'other-tenant',
        userId: 'user-123',
      });

      await expect(controller.approveAction(mockRequest, 'exec-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rejectAction', () => {
    it('should reject pending action with reason', async () => {
      const suspended = {
        executionId: 'exec-1',
        tenantId: 'tenant-456',
        userId: 'user-123',
        action: { actionType: 'SEND_EMAIL' },
      };
      voltAgentService.getSuspendedWorkflow.mockReturnValue(suspended);
      voltAgentService.resumeApproval.mockResolvedValue({ approved: false });

      const result = await controller.rejectAction(mockRequest, 'exec-1', {
        approved: false,
        rejectionReason: 'Not needed',
      });

      expect(voltAgentService.resumeApproval).toHaveBeenCalledWith('exec-1', {
        approved: false,
        approvedBy: 'user-123',
        rejectionReason: 'Not needed',
      });
      expect(result.status).toBe('rejected');
    });
  });

  describe('getPerformanceStats', () => {
    it('should return performance telemetry statistics', async () => {
      const mockStats = {
        totalOperations: 150,
        avgDuration: 245.5,
        successRate: 98.5,
        totalTokens: 75000,
      };
      voltAgentService.getMetricsStats.mockResolvedValue(mockStats);

      const result = await controller.getPerformanceStats(mockRequest);

      expect(voltAgentService.getMetricsStats).toHaveBeenCalledWith('SupervisorAgent');
      expect(result).toEqual({
        success: true,
        stats: {
          totalOperations: 150,
          avgLatencyMs: 246,
          successRate: 98.5,
          totalTokens: 75000,
        },
      });
    });
  });

  describe('getRecentMetrics', () => {
    it('should return recent agent metrics with defaults', async () => {
      const mockMetrics = [
        {
          agentName: 'SupervisorAgent',
          operationId: 'op-1',
          tenantId: 'tenant-456',
          duration: 200,
          totalTokens: 500,
          toolCalls: 2,
          success: true,
          timestamp: Date.now(),
        },
        {
          agentName: 'EmailAgent',
          operationId: 'op-2',
          tenantId: 'tenant-456',
          duration: 150,
          totalTokens: 300,
          toolCalls: 1,
          success: true,
          timestamp: Date.now(),
        },
      ];
      voltAgentService.getRecentMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getRecentMetrics(mockRequest, undefined, undefined);

      expect(voltAgentService.getRecentMetrics).toHaveBeenCalledWith(undefined, 100);
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.metrics).toHaveLength(2);
      expect(result.metrics[0].agentName).toBe('SupervisorAgent');
    });

    it('should filter by agent name and limit', async () => {
      voltAgentService.getRecentMetrics.mockResolvedValue([]);

      await controller.getRecentMetrics(mockRequest, 'EmailAgent', 50);

      expect(voltAgentService.getRecentMetrics).toHaveBeenCalledWith('EmailAgent', 50);
    });
  });
});
