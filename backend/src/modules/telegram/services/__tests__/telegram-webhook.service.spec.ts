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
  };

  const mockCacheService = {
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockAiChatService = {
    streamChat: jest.fn(),
    generateChat: jest.fn(),
  };

  const mockConversationService = {
    getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
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
      ],
    }).compile();

    service = module.get(TelegramWebhookService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. handleUpdate routing ─────────────────────────────────

  describe('handleUpdate routing', () => {
    it('should route callback_query to handleCallbackQuery', async () => {
      const spy = jest
        .spyOn(service as any, 'handleCallbackQuery')
        .mockResolvedValue(undefined);

      const update = {
        callback_query: { id: 'cq1', data: 'done:rem1', from: { id: 123 } },
      };
      await service.handleUpdate(update as any);

      expect(spy).toHaveBeenCalledWith(update.callback_query);
    });

    it('should route message with text to handleMessage', async () => {
      const spy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      const update = { message: { chat: { id: 123 }, text: 'hello' } };
      await service.handleUpdate(update as any);

      expect(spy).toHaveBeenCalledWith(update.message);
    });

    it('should do nothing for message without text', async () => {
      const spy = jest
        .spyOn(service as any, 'handleMessage')
        .mockResolvedValue(undefined);

      await service.handleUpdate({ message: { chat: { id: 123 } } } as any);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── 2. /start with valid token ──────────────────────────────

  describe('/start with valid token', () => {
    it('should link user and send success message', async () => {
      const payload = { userId: 'user1', tenantId: 'tenant1' };
      mockCacheService.get.mockResolvedValue(payload);
      mockPrisma.telegramSettings.upsert.mockResolvedValue({} as any);

      const update = {
        message: {
          chat: { id: 99999 },
          text: '/start valid-token-abc',
          from: { id: 77, first_name: 'Davide' },
        },
      };
      await service.handleUpdate(update as any);

      expect(mockCacheService.get).toHaveBeenCalledWith('valid-token-abc', {
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
        expect.stringContaining('riuscito'),
      );
    });
  });

  // ── 3. /start with expired token ────────────────────────────

  describe('/start with expired/invalid token', () => {
    it('should return error message when token not in cache', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const update = {
        message: { chat: { id: 99999 }, text: '/start expired-token' },
      };
      await service.handleUpdate(update as any);

      expect(mockCacheService.get).toHaveBeenCalledWith('expired-token', {
        namespace: CacheNamespace.TELEGRAM_LINK,
      });
      expect(mockPrisma.telegramSettings.upsert).not.toHaveBeenCalled();
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '99999',
        expect.stringContaining('scaduto'),
      );
    });
  });

  // ── 4. /start with no token ─────────────────────────────────

  describe('/start with no token', () => {
    it('should send welcome message', async () => {
      const update = {
        message: { chat: { id: 99999 }, text: '/start' },
      };
      await service.handleUpdate(update as any);

      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        '99999',
        expect.stringContaining('Benvenuto'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });
  });

  // ── 5. Plain text relay — success ───────────────────────────

  describe('plain text relay', () => {
    const chatId = 12345;
    const linkedSettings = { id: 'settings-1', tenantId: 'tenant1', userId: 'user1', aiConversationId: null };

    it('should relay to AI chat and send response back', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(linkedSettings);

      mockAiChatService.generateChat.mockResolvedValue({ text: 'Hello world', conversationId: 'conv-1' });

      const update = {
        message: { chat: { id: chatId }, text: 'What is the weather?' },
      };
      await service.handleUpdate(update as any);

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

    // ── 6. Unlinked user gets error ─────────────────────────

    it('should send error when user is not linked', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(null);

      const update = {
        message: { chat: { id: chatId }, text: 'hello' },
      };
      await service.handleUpdate(update as any);

      expect(mockAiChatService.generateChat).not.toHaveBeenCalled();
      expect(mockBotService.sendMessage).toHaveBeenCalledWith(
        String(chatId),
        expect.stringContaining('collegato'),
      );
    });

    // ── 7. Long response splits correctly ───────────────────

    it('should split long responses into multiple messages', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(linkedSettings);

      // Build a string > 4000 chars with newlines to allow splitting
      const longText = ('A'.repeat(3900) + '\n').repeat(2); // ~7802 chars
      mockAiChatService.generateChat.mockResolvedValue({ text: longText, conversationId: 'conv-1' });

      const update = {
        message: { chat: { id: chatId }, text: 'give long response' },
      };
      await service.handleUpdate(update as any);

      // Should have been called at least twice due to splitting
      expect(mockBotService.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
      for (const call of mockBotService.sendMessage.mock.calls) {
        expect(call[1].length).toBeLessThanOrEqual(4000);
      }
    });
  });

  // ── 8. Callback query done: — completes reminder ───────────

  describe('handleCallbackQuery done:{reminderId}', () => {
    const callbackQuery = {
      id: 'cb1',
      data: 'done:reminder-123',
      from: { id: 55555 },
    };

    const settings = { tenantId: 'tenant1', userId: 'user1' };

    it('should complete reminder with tenant scoping', async () => {
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

    // ── 9. Unlinked user gets rejection ─────────────────────

    it('should reject if user is not linked', async () => {
      mockPrisma.telegramSettings.findFirst.mockResolvedValue(null);

      await service.handleUpdate({ callback_query: callbackQuery } as any);

      expect(mockPrisma.reminder.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
      expect(mockBotService.answerCallbackQuery).toHaveBeenCalledWith(
        'cb1',
        expect.stringContaining('collegato'),
      );
    });

    // ── 10. Reminder not found / wrong tenant ───────────────

    it('should reject if reminder not found or wrong tenant', async () => {
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
