import { Test, TestingModule } from '@nestjs/testing';
import { FollowUpDetectionService } from '../follow-up-detection.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OpenRouterProviderService } from '../../../openrouter/openrouter-provider.service';
import { UsageTrackingService } from '../../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from '../ai-run-ledger.service';

// Mock 'ai' module to avoid real LLM calls
jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: { object: jest.fn() },
  NoObjectGeneratedError: { isInstance: jest.fn().mockReturnValue(false) },
}));

import { generateText } from 'ai';

const mockPrisma = {
  email: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  emailFollowUp: {
    upsert: jest.fn(),
  },
};

const mockMistralProvider = {
  getChatModel: jest.fn().mockReturnValue('mock-model'),
};

const mockUsageTracking = {
  trackUsage: jest.fn(),
};

const mockLedger = {
  recordRun: jest.fn().mockReturnValue(Promise.resolve()),
};

describe('FollowUpDetectionService', () => {
  let service: FollowUpDetectionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpDetectionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OpenRouterProviderService, useValue: mockMistralProvider },
        { provide: UsageTrackingService, useValue: mockUsageTracking },
        { provide: AiRunLedgerService, useValue: mockLedger },
      ],
    }).compile();

    service = module.get<FollowUpDetectionService>(FollowUpDetectionService);
  });

  describe('detectFollowUps', () => {
    it('should return empty when no un-triaged emails found', async () => {
      mockPrisma.email.findMany.mockResolvedValue([]);

      const result = await service.detectFollowUps('tenant-1');

      expect(result.data.detectedFollowUps).toEqual([]);
      expect(result.data.batchSummary.totalAnalyzed).toBe(0);
      expect(generateText).not.toHaveBeenCalled();
    });

    it('should filter for un-triaged emails without existing follow-ups', async () => {
      mockPrisma.email.findMany.mockResolvedValue([]);

      await service.detectFollowUps('tenant-1', 48);

      expect(mockPrisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            isDeleted: false,
            isAutoTriaged: false,
            followUp: { is: null },
          }),
        }),
      );
    });

    it('should call LLM and persist detected follow-ups', async () => {
      const emails = [
        {
          id: 'email-1',
          subject: 'Urgent request',
          from: 'boss@company.com',
          to: ['user@company.com'],
          bodyText: 'Please send the report by Friday.',
          receivedAt: new Date(),
        },
      ];
      mockPrisma.email.findMany.mockResolvedValue(emails);

      const llmOutput = {
        detectedFollowUps: [
          {
            emailId: 'email-1',
            reason: 'Direct request with deadline',
            suggestedDueDate: '2026-04-01T09:00:00Z',
            urgency: 'high',
            confidence: 0.9,
          },
        ],
        batchSummary: { totalAnalyzed: 1, totalDetected: 1, highUrgencyCount: 1 },
      };

      (generateText as jest.Mock).mockResolvedValue({
        output: llmOutput,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      });

      // Mock for persistDetectedFollowUps
      mockPrisma.email.findFirst.mockResolvedValue({
        provider: { userId: 'user-1' },
      });
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({ id: 'fu-1' });

      const result = await service.detectFollowUps('tenant-1');

      expect(result.data.detectedFollowUps).toHaveLength(1);
      expect(result.data.detectedFollowUps[0].emailId).toBe('email-1');
      expect(generateText).toHaveBeenCalledTimes(1);

      // Verify persistence
      expect(mockPrisma.emailFollowUp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { emailId_tenantId: { emailId: 'email-1', tenantId: 'tenant-1' } },
          create: expect.objectContaining({
            emailId: 'email-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            reason: 'Direct request with deadline',
            status: 'PENDING',
            followUpType: 'TODO',
            confidence: 0.9,
          }),
        }),
      );
    });
  });

  describe('persistDetectedFollowUps', () => {
    // Access private method
    const callPersist = (svc: FollowUpDetectionService, output: any, tenantId: string) =>
      (svc as any).persistDetectedFollowUps(output, tenantId);

    it('should skip when no detectedFollowUps', async () => {
      await callPersist(service, { detectedFollowUps: [] }, 'tenant-1');

      expect(mockPrisma.emailFollowUp.upsert).not.toHaveBeenCalled();
    });

    it('should skip when userId cannot be resolved', async () => {
      mockPrisma.email.findFirst.mockResolvedValue(null);

      await callPersist(service, {
        detectedFollowUps: [
          { emailId: 'email-orphan', reason: 'test', suggestedDueDate: null, urgency: 'low', confidence: 0.5 },
        ],
      }, 'tenant-1');

      expect(mockPrisma.emailFollowUp.upsert).not.toHaveBeenCalled();
    });

    it('should use default due date (3 days) when suggestedDueDate is null', async () => {
      mockPrisma.email.findFirst.mockResolvedValue({
        provider: { userId: 'user-1' },
      });
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({ id: 'fu-2' });

      await callPersist(service, {
        detectedFollowUps: [
          { emailId: 'email-2', reason: 'needs follow-up', suggestedDueDate: null, urgency: 'low', confidence: 0.6 },
        ],
      }, 'tenant-1');

      const createArg = mockPrisma.emailFollowUp.upsert.mock.calls[0][0].create;
      // Default due date should be ~3 days from now
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      expect(createArg.dueDate.getTime()).toBeGreaterThan(Date.now() + threeDaysMs - 60000);
      expect(createArg.dueDate.getTime()).toBeLessThan(Date.now() + threeDaysMs + 60000);
    });

    it('should gracefully handle upsert errors (FK violation)', async () => {
      mockPrisma.email.findFirst.mockResolvedValue({
        provider: { userId: 'user-1' },
      });
      mockPrisma.emailFollowUp.upsert.mockRejectedValue(new Error('P2003: FK violation'));

      // Should not throw
      await expect(
        callPersist(service, {
          detectedFollowUps: [
            { emailId: 'email-deleted', reason: 'test', suggestedDueDate: null, urgency: 'low', confidence: 0.5 },
          ],
        }, 'tenant-1'),
      ).resolves.toBeUndefined();
    });

    it('should persist multiple follow-ups in sequence', async () => {
      mockPrisma.email.findFirst.mockResolvedValue({
        provider: { userId: 'user-1' },
      });
      mockPrisma.emailFollowUp.upsert.mockResolvedValue({ id: 'fu-new' });

      await callPersist(service, {
        detectedFollowUps: [
          { emailId: 'email-a', reason: 'reason a', suggestedDueDate: '2026-04-01T09:00:00Z', urgency: 'high', confidence: 0.9 },
          { emailId: 'email-b', reason: 'reason b', suggestedDueDate: '2026-04-02T09:00:00Z', urgency: 'medium', confidence: 0.7 },
        ],
      }, 'tenant-1');

      expect(mockPrisma.emailFollowUp.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.email.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
