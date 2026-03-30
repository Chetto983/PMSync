import { Test, TestingModule } from '@nestjs/testing';
import { ReminderStatus } from '@prisma/client';
import { TelegramWebhookService } from '../telegram-webhook.service';
import { TelegramBotService } from '../telegram-bot.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CacheService,
  CacheNamespace,
} from '../../../../common/services/cache.service';
import { AiChatService } from '../../../ai-chat/services/ai-chat.service';
import { ConversationService } from '../../../ai-chat/services/conversation.service';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';
import { AuditService } from '../../../../common/services/audit.service';
import { PiiResolutionService } from '../../../ai/guards/pii-resolution.service';

describe('TelegramWebhookService', () => {
  let service: TelegramWebhookService;

  const mockPrisma = {
    telegramSettings: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({} as any),
    },
    aiConversation: {
      findFirst: jest.fn(),
    },
    reminder: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockBotService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    sendToolApproval: jest.fn().mockResolvedValue(101),
    editMessageText: jest.fn().mockResolvedValue(undefined),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockAiChatService = {
    streamChat: jest.fn(),
    generateChat: jest.fn(),
  };

  const mockConversationService = {
    getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
  };

  const mockAuditService = {
    logHitlDecision: jest.fn().mockResolvedValue(undefined),
  };

  const mockPiiResolutionService = {
    resolveText: jest.fn().mockImplementation(async (_tenantId, _conversationId, value) => value),
    resolvePayload: jest.fn().mockImplementation(async (_tenantId, _conversationId, value) => value),
    resolveValue: jest.fn().mockImplementation(async (_tenantId, _conversationId, value) => value),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    jest
      .spyOn(CorrelationContext, 'run')
      .mockImplementation((_ctx: any, cb: () => any) => cb());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TelegramBotService, useValue: mockBotService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: AiChatService, useValue: mockAiChatService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PiiResolutionService, useValue: mockPiiResolutionService },
      ],
    }).compile();

    service = module.get(TelegramWebhookService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleUpdate routing', () => {
    it('routes callback_query to handleCallbackQuery', async () => {
      const spy = jest
        .spyOn(service as any, 'handleCallbackQuery')
        .mockResolvedValue(undefined);

      const update = {
        callback_query: { id: 'cq1', data: 'done:rem1', from: { id: 123 } },
      };
      await service.handleUpdate(update as any);

      expect(spy).toHaveBeenCalledWith(update.callback_query);
    });

    it('routes message with text to handleMessage', async () => {
      const spy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      const update = { message: { chat: { id: 123 }, text: 'hello' } };
      await service.handleUpdate(update as any);

      expect(spy).toHaveBeenCalledWith(update.message);
    });

    it('ignores messages without text', async () => {
      const spy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      await service.handleUpdate({ message: { chat: { id: 123 } } } as any);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('/start handling', () => {
    it('links a user for a valid token', async () => {
      const payload = { userId: 'user1', tenantId: 'tenant1' };
      mockCacheService.get.mockResolvedValue(payload);
      mockPrisma.telegramSettings.upsert.mockResolvedValue({} as any);

      await service.handleUpdate({
        message: {
          chat: { id: 99999 },
          text: '/start valid-token-abc',
          from: { id: 77, first_name: 'Davide' },
        },
      } as any);

      expect(mockCacheService.get).toHaveBeenCalledWith('valid-token-abc', {
        namespace: CacheNamespace.TELEGRAM_LINK,
      });
      expect(mockCacheService.del).toHaveBeenCalledWith('valid-token-abc', {
        namespace: CacheNamespace.TELEGRAM_LINK,
      });
      expect(mockPrisma.telegramSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user1' },
          create: expect.objectContaining({
            telegramChatId: '99999',
            tenantId: 'tenant1',
            userId: 'user1',
          }),
          update: expect.objectContaining({ telegramChatId: '99999' }),
        }),
      );
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '99999',
        expect.stringContaining('Successfully linked'),
      );
    });

    it('returns an error for an expired token', async () => {
      mockCacheService.get.mockResolvedValue(null);

      await service.handleUpdate({
        message: { chat: { id: 99999 }, text: '/start expired-token' },
      } as any);

      expect(mockPrisma.telegramSettings.upsert).not.toHaveBeenCalled();
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '99999',
        expect.stringContaining('scaduto'),
      );
    });

    it('sends the welcome message for plain /start', async () => {
      await service.handleUpdate({
        message: { chat: { id: 99999 }, text: '/start' },
      } as any);

      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '99999',
        expect.stringContaining('Welcome'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });
  });

  describe('plain text relay', () => {
    const chatId = 12345;
    const linkedSettings = {
      id: 'settings-1',
      tenantId: 'tenant1',
      userId: 'user1',
      aiConversationId: null,
    };

    beforeEach(() => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(linkedSettings);
    });

    it('relays a plain text message to AI chat and sends the response back', async () => {
      mockAiChatService.generateChat.mockResolvedValue({
        text: 'Hello world',
        conversationId: 'conv-1',
        pendingApprovals: [],
      });

      await service.handleUpdate({
        message: { chat: { id: chatId }, text: 'What is the weather?' },
      } as any);

      expect(mockPrisma.telegramSettings.findFirst).toHaveBeenCalledWith({
        where: { telegramChatId: String(chatId), isActive: true },
        select: { id: true, tenantId: true, userId: true, aiConversationId: true },
      });
      expect(mockAiChatService.generateChat).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant1',
          userId: 'user1',
          message: 'What is the weather?',
          conversationId: 'conv-1',
        }),
      );
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        String(chatId),
        'Hello world',
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('sends an error when the account is not linked', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(null);

      await service.handleUpdate({
        message: { chat: { id: chatId }, text: 'hello' },
      } as any);

      expect(mockAiChatService.generateChat).not.toHaveBeenCalled();
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        String(chatId),
        expect.stringContaining('not linked'),
      );
    });

    it('splits long responses into multiple Telegram messages', async () => {
      const longText = ('A'.repeat(3900) + '\n').repeat(2);
      mockAiChatService.generateChat.mockResolvedValue({
        text: longText,
        conversationId: 'conv-1',
        pendingApprovals: [],
      });

      await service.handleUpdate({
        message: { chat: { id: chatId }, text: 'give long response' },
      } as any);

      expect(mockBotService.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
      for (const call of mockBotService.sendMessage.mock.calls) {
        expect(call[1].length).toBeLessThanOrEqual(4000);
      }
    });

    it('stores pending approvals and sends approval cards when AI pauses for HITL', async () => {
      const pendingApproval = {
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        toolName: 'send_email',
        input: { to: 'test@example.com', subject: 'Hello' },
      };
      mockAiChatService.generateChat.mockResolvedValue({
        text: 'Please review this action.',
        conversationId: 'conv-1',
        pendingApprovals: [pendingApproval],
        responseMessages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'send_email',
                input: pendingApproval.input,
              },
            ],
          },
        ],
      });

      await service.handleUpdate({
        message: { chat: { id: chatId }, text: 'Send that email' },
      } as any);

      expect(mockBotService.sendToolApproval).toHaveBeenCalledWith(
        String(chatId),
        'approval-1',
        'send_email',
        pendingApproval.input,
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'approval-1',
        expect.objectContaining({
          conversationId: 'conv-1',
          approvals: [pendingApproval],
          approvalMessageIds: [101],
        }),
        expect.objectContaining({
          namespace: CacheNamespace.TELEGRAM_APPROVAL,
        }),
      );
    });
  });

  describe('HITL callback handling', () => {
    const pendingApproval = {
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      toolName: 'send_email',
      input: { to: 'test@example.com', subject: 'Hello' },
    };

    const approvalState = {
      approvals: [pendingApproval],
      conversationId: 'conv-1',
      chatId: '77777',
      tenantId: 'tenant1',
      userId: 'user1',
      responseMessages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'send_email',
              input: pendingApproval.input,
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-1',
              toolCallId: 'call-1',
            },
          ],
        },
      ],
      approvalMessageIds: [101],
    };

    it('resubmits approved callbacks with approved=true and sends the resolved response', async () => {
      mockCacheService.get.mockResolvedValue(approvalState);
      mockAiChatService.generateChat.mockResolvedValue({
        text: 'Email queued.',
        conversationId: 'conv-1',
        pendingApprovals: [],
      });

      await service.handleUpdate({
        callback_query: { id: 'cq-1', data: 'approve:approval-1', from: { id: 77777 } },
      } as any);

      expect(mockCacheService.del).toHaveBeenCalledWith('approval-1', {
        namespace: CacheNamespace.TELEGRAM_APPROVAL,
      });
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cq-1',
        'Approved',
      );
      expect(mockBotService.editMessageText).toHaveBeenCalledWith(
        '77777',
        101,
        expect.stringContaining('Approved'),
        'plain',
      );
      expect(mockAiChatService.generateChat).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant1',
          userId: 'user1',
          conversationId: 'conv-1',
          message: '',
          modelMessagesOverride: expect.arrayContaining([
            expect.objectContaining({ role: 'assistant' }),
            expect.objectContaining({
              role: 'tool',
              content: [
                expect.objectContaining({
                  type: 'tool-approval-response',
                  approvalId: 'approval-1',
                  approved: true,
                }),
              ],
            }),
          ]),
        }),
      );
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '77777',
        'Email queued.',
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
      expect(mockAuditService.logHitlDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'approved',
          toolName: 'send_email',
        }),
      );
    });

    it('does not execute the tool when the callback is rejected', async () => {
      mockCacheService.get.mockResolvedValue(approvalState);

      await service.handleUpdate({
        callback_query: { id: 'cq-2', data: 'reject:approval-1', from: { id: 77777 } },
      } as any);

      expect(mockAiChatService.generateChat).not.toHaveBeenCalled();
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cq-2',
        'Rejected',
      );
      expect(mockBotService.editMessageText).toHaveBeenCalledWith(
        '77777',
        101,
        expect.stringContaining('Rejected'),
        'plain',
      );
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '77777',
        expect.stringContaining('Action rejected.'),
      );
      expect(mockAuditService.logHitlDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'rejected',
          toolName: 'send_email',
        }),
      );
    });

    it('returns an expired message when the approval is gone from cache', async () => {
      mockCacheService.get.mockResolvedValue(null);

      await service.handleUpdate({
        callback_query: { id: 'cq-3', data: 'approve:approval-1', from: { id: 77777 } },
      } as any);

      expect(mockAiChatService.generateChat).not.toHaveBeenCalled();
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cq-3',
        'Approval expired or already handled.',
      );
    });
  });

  describe('handleCallbackQuery done:{reminderId}', () => {
    const callbackQuery = {
      id: 'cb1',
      data: 'done:reminder-123',
      from: { id: 55555 },
    };

    const settings = { tenantId: 'tenant1', userId: 'user1' };

    it('completes the reminder with tenant scoping', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(settings);
      mockPrisma.reminder.findFirst.mockResolvedValue({
        id: 'reminder-123',
        tenantId: 'tenant1',
        userId: 'user1',
        status: ReminderStatus.attivo,
      } as any);
      mockPrisma.reminder.update.mockResolvedValue({} as any);

      await service.handleUpdate({ callback_query: callbackQuery } as any);

      expect(mockPrisma.telegramSettings.findFirst).toHaveBeenCalledWith({
        where: { telegramChatId: '55555', isActive: true },
        select: { tenantId: true, userId: true },
      });
      expect(mockPrisma.reminder.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'reminder-123',
          tenantId: 'tenant1',
          userId: 'user1',
          status: ReminderStatus.attivo,
        },
      });
      expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-123' },
        data: expect.objectContaining({
          status: ReminderStatus.completato,
        }),
      });
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cb1',
        'Completato!',
      );
    });

    it('rejects unlinked users', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(null);

      await service.handleUpdate({ callback_query: callbackQuery } as any);

      expect(mockPrisma.reminder.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cb1',
        expect.stringContaining('not linked'),
      );
    });

    it('rejects missing reminders', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(settings);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);

      await service.handleUpdate({ callback_query: callbackQuery } as any);

      expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cb1',
        expect.stringContaining('non trovato'),
      );
    });
  });
});
