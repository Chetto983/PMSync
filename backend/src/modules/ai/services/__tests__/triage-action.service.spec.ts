import { Test, TestingModule } from '@nestjs/testing';
import { TriageActionService } from '../triage-action.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FollowUpStatus, FollowUpType } from '@prisma/client';
import type { UnifiedEmailAnalysis } from '../../types/email-insights.types';

const mockPrisma = {
  emailFollowUp: {
    upsert: jest.fn(),
  },
  providerConfig: {
    findMany: jest.fn(),
  },
};

function makeAnalysis(overrides: Partial<UnifiedEmailAnalysis> = {}): UnifiedEmailAnalysis {
  return {
    summary: 'Test summary',
    sentiment: 'neutral',
    tone: 'formal',
    priority: 3,
    urgency: 'medium',
    labels: [],
    keyTopics: [],
    intent: 'fyi',
    escalationRisk: false,
    hasDeadline: false,
    deadlineDate: null,
    needsFollowUp: false,
    followUpDate: null,
    followUpReason: null,
    confidence: 0.8,
    reasoning: 'Test reasoning',
    ...overrides,
  };
}

const ctx = {
  emailId: 'email-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  from: 'external@example.com',
  subject: 'Test Subject',
};

describe('TriageActionService', () => {
  let service: TriageActionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriageActionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TriageActionService>(TriageActionService);
  });

  describe('processTriageSignals', () => {
    it('should return empty result when no follow-up or deadline signals', async () => {
      const analysis = makeAnalysis();
      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.followUpCreated).toBe(false);
      expect(result.followUpId).toBeNull();
      expect(mockPrisma.emailFollowUp.upsert).not.toHaveBeenCalled();
    });

    it('should create follow-up when needsFollowUp is true', async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-1',
        followUpType: FollowUpType.TODO,
      });

      const analysis = makeAnalysis({
        needsFollowUp: true,
        followUpReason: 'User asked a question',
      });

      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.followUpCreated).toBe(true);
      expect(result.followUpId).toBe('fu-1');
      expect(result.followUpType).toBe(FollowUpType.TODO);
      expect(mockPrisma.emailFollowUp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { emailId_tenantId: { emailId: 'email-1', tenantId: 'tenant-1' } },
          create: expect.objectContaining({
            status: FollowUpStatus.PENDING,
            followUpType: FollowUpType.TODO,
            reason: expect.stringContaining('User asked a question'),
          }),
        }),
      );
    });

    it('should skip passive notifications even if the model flagged follow-up', async () => {
      const analysis = makeAnalysis({
        labels: ['Updates'],
        intent: 'fyi',
        needsFollowUp: true,
        followUpReason: 'Review changelog later',
      });
      const notificationCtx = {
        ...ctx,
        from: 'Notifications <noreply@github.com>',
        subject: 'Weekly release notes digest',
      };

      const result = await service.processTriageSignals(notificationCtx, analysis);

      expect(result.followUpCreated).toBe(false);
      expect(mockPrisma.emailFollowUp.upsert).not.toHaveBeenCalled();
    });

    it('should create follow-up when hasDeadline is true', async () => {
      const deadline = new Date('2026-04-01T10:00:00Z');
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-2',
        followUpType: FollowUpType.TODO,
      });

      const analysis = makeAnalysis({
        hasDeadline: true,
        deadlineDate: deadline,
      });

      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.followUpCreated).toBe(true);
      expect(result.dueDate).toEqual(deadline);
      expect(mockPrisma.emailFollowUp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            dueDate: deadline,
            detectedDeadline: deadline,
            deadlineSource: 'triage',
          }),
        }),
      );
    });

    it('should use followUpDate when no deadlineDate', async () => {
      const followUpDate = new Date('2026-04-05T09:00:00Z');
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-3',
        followUpType: FollowUpType.TODO,
      });

      const analysis = makeAnalysis({
        needsFollowUp: true,
        followUpDate,
      });

      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.dueDate).toEqual(followUpDate);
    });

    it('should still create follow-up for actionable update emails', async () => {
      const followUpDate = new Date('2026-04-05T09:00:00Z');
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-3b',
        followUpType: FollowUpType.TODO,
      });

      const analysis = makeAnalysis({
        labels: ['Updates', 'Action Items'],
        intent: 'action_required',
        needsFollowUp: true,
        followUpDate,
        followUpReason: 'Confirm deployment ETA',
      });
      const notificationCtx = {
        ...ctx,
        from: 'Alerts <alerts@buildkite.com>',
        subject: 'Deployment failed - confirm ETA',
      };

      const result = await service.processTriageSignals(notificationCtx, analysis);

      expect(result.followUpCreated).toBe(true);
      expect(result.dueDate).toEqual(followUpDate);
      expect(mockPrisma.emailFollowUp.upsert).toHaveBeenCalled();
    });

    it('should use default 3 business day due date when no dates provided', async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-4',
        followUpType: FollowUpType.TODO,
      });

      const analysis = makeAnalysis({ needsFollowUp: true });

      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.followUpCreated).toBe(true);
      expect(result.dueDate).toBeDefined();
      // Default due date should be in the future
      expect(result.dueDate!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should detect WAITING_FOR when sender matches user provider email', async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([
        { email: 'user@company.com' },
      ]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-5',
        followUpType: FollowUpType.WAITING_FOR,
      });

      const analysis = makeAnalysis({ needsFollowUp: true });
      const userCtx = { ...ctx, from: 'User Name <user@company.com>' };

      const result = await service.processTriageSignals(userCtx, analysis);

      expect(result.followUpType).toBe(FollowUpType.WAITING_FOR);
    });

    it('should detect TODO when sender does not match user email', async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([
        { email: 'user@company.com' },
      ]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({
        id: 'fu-6',
        followUpType: FollowUpType.TODO,
      });

      const analysis = makeAnalysis({ needsFollowUp: true });

      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.followUpType).toBe(FollowUpType.TODO);
    });

    // Phase 77: ActionQueue reminder tests removed (AI SDK native HITL)

    it('should return empty result on prisma error (non-blocking)', async () => {
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockRejectedValue(new Error('DB connection lost'));

      const analysis = makeAnalysis({ needsFollowUp: true });

      const result = await service.processTriageSignals(ctx, analysis);

      expect(result.followUpCreated).toBe(false);
      expect(result.followUpId).toBeNull();
    });

    it('should build reason from deadline and follow-up reason', async () => {
      const deadline = new Date('2026-04-01');
      mockPrisma.providerConfig.findMany.mockResolvedValue([]);
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({ id: 'fu-11' });

      const analysis = makeAnalysis({
        hasDeadline: true,
        deadlineDate: deadline,
        needsFollowUp: true,
        followUpReason: 'Client waiting for proposal',
      });

      await service.processTriageSignals(ctx, analysis);

      const upsertCall = mockPrisma.emailFollowUp.upsert.mock.calls[0][0];
      expect(upsertCall.create.reason).toContain('Deadline:');
      expect(upsertCall.create.reason).toContain('Client waiting for proposal');
    });
  });
});
