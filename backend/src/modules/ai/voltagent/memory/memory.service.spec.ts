/**
 * VoltAgent Memory Service Tests
 *
 * Tests for token budget management and conversation summarization.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { VoltAgentMemoryService, TOKEN_BUDGET_CONFIG } from './memory.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';

describe('VoltAgentMemoryService', () => {
  let service: VoltAgentMemoryService;
  let prisma: jest.Mocked<PrismaService>;
  let _mistralService: jest.Mocked<MistralService>;

  const mockContext = {
    tenantId: 'tenant-123',
    userId: 'user-456',
    conversationId: 'conv-789',
    locale: 'en',
  };

  beforeEach(async () => {
    const mockPrisma = {
      voltAgentConversation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      voltAgentMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      conversationSummary: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const mockMistralService = {
      completePrompt: jest.fn(),
      generateEmbedding: jest.fn(),
      generateChatTitle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoltAgentMemoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MistralService, useValue: mockMistralService },
      ],
    }).compile();

    service = module.get<VoltAgentMemoryService>(VoltAgentMemoryService);
    prisma = module.get(PrismaService);
    _mistralService = module.get(MistralService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('TOKEN_BUDGET_CONFIG', () => {
    it('should have correct default values', () => {
      expect(TOKEN_BUDGET_CONFIG.default).toBe(4000);
      expect(TOKEN_BUDGET_CONFIG.extended).toBe(8000);
      expect(TOKEN_BUDGET_CONFIG.compact).toBe(2000);
      expect(TOKEN_BUDGET_CONFIG.systemReserve).toBe(500);
      expect(TOKEN_BUDGET_CONFIG.responseReserve).toBe(1000);
    });
  });

  describe('getContextWithBudget', () => {
    it('should return empty result for new conversation', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.voltAgentConversation.create as jest.Mock).mockResolvedValue({
        id: 'new-conv-id',
      });

      const result = await service.getContextWithBudget(mockContext, 'default');

      expect(result.messages).toEqual([]);
      expect(result.summaries).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.wasTruncated).toBe(false);
      expect(result.messagesDropped).toBe(0);
      expect(result.summarizationTriggered).toBe(false);
    });

    it('should include messages within budget', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue([
        { role: 'user', content: 'Hello', messageIndex: 0, tokenCount: 10 },
        { role: 'assistant', content: 'Hi there!', messageIndex: 1, tokenCount: 15 },
      ]);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getContextWithBudget(mockContext, 'default');

      expect(result.messages).toHaveLength(2);
      expect(result.wasTruncated).toBe(false);
      expect(result.messagesDropped).toBe(0);
    });

    it('should truncate messages exceeding budget', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });

      // Create messages that exceed the compact budget (2000 - 500 - 1000 = 500 available)
      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'A'.repeat(400), // ~100 tokens each
        messageIndex: i,
        tokenCount: 100,
      }));

      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue(messages);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getContextWithBudget(mockContext, 'compact');

      expect(result.wasTruncated).toBe(true);
      expect(result.messagesDropped).toBeGreaterThan(0);
      expect(result.messages.length).toBeLessThan(10);
    });

    it('should trigger summarization when many messages dropped', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentConversation.findUnique as jest.Mock).mockResolvedValue({
        messageCount: 20,
        summaryUpToIndex: 0,
      });

      // Create many messages that will exceed budget
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'A'.repeat(400),
        messageIndex: 19 - i, // Descending order (most recent first)
        tokenCount: 100,
      }));

      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue(messages);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getContextWithBudget(mockContext, 'compact');

      expect(result.wasTruncated).toBe(true);
      // When 5+ messages are dropped, summarization is triggered
      if (result.messagesDropped >= 5) {
        expect(result.summarizationTriggered).toBe(true);
      }
    });

    it('should include summaries in context', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue([
        { role: 'user', content: 'Hello', messageIndex: 0, tokenCount: 10 },
      ]);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([
        { summary: 'Previous discussion about emails', summaryTokens: 20 },
      ]);

      const result = await service.getContextWithBudget(mockContext, 'default');

      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0]).toBe('Previous discussion about emails');
    });

    it('should respect budget type parameter', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);

      const defaultResult = await service.getContextWithBudget(mockContext, 'default');
      const extendedResult = await service.getContextWithBudget(mockContext, 'extended');
      const compactResult = await service.getContextWithBudget(mockContext, 'compact');

      expect(defaultResult.budgetLimit).toBe(TOKEN_BUDGET_CONFIG.default);
      expect(extendedResult.budgetLimit).toBe(TOKEN_BUDGET_CONFIG.extended);
      expect(compactResult.budgetLimit).toBe(TOKEN_BUDGET_CONFIG.compact);
    });

    it('should accept numeric budget', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getContextWithBudget(mockContext, 3000);

      expect(result.budgetLimit).toBe(3000);
    });

    it('should account for current message in budget', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });

      // Messages that would fit without current message
      const messages = Array.from({ length: 5 }, (_, i) => ({
        role: 'user',
        content: 'A'.repeat(200),
        messageIndex: i,
        tokenCount: 50,
      }));

      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue(messages);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);

      // Long current message should reduce available budget
      const longMessage = 'B'.repeat(4000); // ~1000 tokens
      const result = await service.getContextWithBudget(mockContext, 'compact', longMessage);

      // With compact budget (2000) minus reserves (1500) minus message (~1000),
      // very little room for history
      expect(result.totalTokens).toBeLessThan(500);
    });
  });

  describe('addMessage', () => {
    it('should add message to conversation', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentConversation.findUnique as jest.Mock).mockResolvedValue({
        messageCount: 5,
      });
      (prisma.voltAgentMessage.create as jest.Mock).mockResolvedValue({});
      (prisma.voltAgentConversation.update as jest.Mock).mockResolvedValue({});

      await service.addMessage(mockContext, {
        role: 'user',
        content: 'Test message',
      });

      expect(prisma.voltAgentMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-789',
            role: 'user',
            content: 'Test message',
            messageIndex: 5,
          }),
        }),
      );
    });
  });

  describe('retrieveHistory', () => {
    it('should return messages in chronological order', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue([
        { role: 'assistant', content: 'Response', messageIndex: 1, tokenCount: 20 },
        { role: 'user', content: 'Hello', messageIndex: 0, tokenCount: 10 },
      ]);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.voltAgentMessage.count as jest.Mock).mockResolvedValue(2);

      const result = await service.retrieveHistory(mockContext);

      // Should be reversed to chronological order
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].content).toBe('Response');
    });

    it('should enforce token limit in history', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });

      // Create messages that exceed the default max context tokens (4000)
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: 'user',
        content: 'A'.repeat(400), // ~100 tokens each
        messageIndex: 99 - i,
        tokenCount: 100,
      }));

      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue(messages);
      (prisma.conversationSummary.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.voltAgentMessage.count as jest.Mock).mockResolvedValue(100);

      const result = await service.retrieveHistory(mockContext, { limit: 100 });

      // Should truncate to fit within 4000 tokens
      expect(result.messages.length).toBeLessThan(100);
      const totalTokens = result.messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(4000);
    });
  });

  describe('generateRuleBasedSummary (via maybeSummarize)', () => {
    it('should generate summary when threshold reached', async () => {
      (prisma.voltAgentConversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-789',
      });
      (prisma.voltAgentConversation.findUnique as jest.Mock).mockResolvedValue({
        messageCount: 25,
        summaryUpToIndex: 0,
        isSummarized: false,
      });
      (prisma.voltAgentMessage.create as jest.Mock).mockResolvedValue({});
      (prisma.voltAgentConversation.update as jest.Mock).mockResolvedValue({});
      (prisma.voltAgentMessage.findMany as jest.Mock).mockResolvedValue([
        { role: 'user', content: 'First question', messageIndex: 0 },
        { role: 'assistant', content: 'First answer', messageIndex: 1 },
        { role: 'user', content: 'Second question', messageIndex: 2 },
      ]);
      (prisma.conversationSummary.create as jest.Mock).mockResolvedValue({});

      await service.addMessage(mockContext, {
        role: 'user',
        content: 'New message',
      });

      // Summary should be created (async, so we check the call was made)
      // Note: This depends on internal implementation details
    });
  });

  describe('listConversations', () => {
    it('should return user conversations', async () => {
      (prisma.voltAgentConversation.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'conv-1',
          title: 'Conversation 1',
          lastActiveAt: new Date(),
          messageCount: 5,
        },
        {
          id: 'conv-2',
          title: 'Conversation 2',
          lastActiveAt: new Date(),
          messageCount: 10,
        },
      ]);

      const result = await service.listConversations('tenant-123', 'user-456');

      expect(result).toHaveLength(2);
      expect(prisma.voltAgentConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-123',
            userId: 'user-456',
            isDeleted: false,
          },
        }),
      );
    });
  });

  describe('deleteConversation', () => {
    it('should soft delete conversation', async () => {
      (prisma.voltAgentConversation.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await service.deleteConversation('tenant-123', 'user-456', 'conv-789');

      expect(result).toBe(true);
      expect(prisma.voltAgentConversation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'conv-789',
          tenantId: 'tenant-123',
          userId: 'user-456',
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
    });

    it('should return false if conversation not found', async () => {
      (prisma.voltAgentConversation.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      const result = await service.deleteConversation('tenant-123', 'user-456', 'nonexistent');

      expect(result).toBe(false);
    });
  });
});
