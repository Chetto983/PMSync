import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramBotService } from '../telegram-bot.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const mockConfigValues: Record<string, string | undefined> = {};

const mockConfigService = {
  get: jest.fn((key: string) => mockConfigValues[key]),
};

const mockPrismaService = {};

function mockFetchOk(body: unknown = { ok: true }) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

function mockFetchFail(status = 400, body = 'Bad Request') {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({ ok: false, description: body }),
  });
}

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  let module: TestingModule;

  beforeEach(async () => {
    // Reset config values
    Object.keys(mockConfigValues).forEach((k) => delete mockConfigValues[k]);

    module = await Test.createTestingModule({
      providers: [
        TelegramBotService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TelegramBotService>(TelegramBotService);
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // Helper: init with token + optional webhook config
  // ----------------------------------------------------------------
  async function initWithToken(opts?: {
    webhookUrl?: string;
    webhookSecret?: string;
  }) {
    mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'test-bot-token';
    if (opts?.webhookUrl) mockConfigValues['TELEGRAM_WEBHOOK_URL'] = opts.webhookUrl;
    if (opts?.webhookSecret)
      mockConfigValues['TELEGRAM_WEBHOOK_SECRET'] = opts.webhookSecret;
    await service.onModuleInit();
  }

  // ================================================================
  // onModuleInit
  // ================================================================
  describe('onModuleInit', () => {
    it('should disable service when TELEGRAM_BOT_TOKEN is not set', async () => {
      global.fetch = mockFetchOk();
      await service.onModuleInit();

      expect(service.isEnabled).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should enable service when bot token is set', async () => {
      global.fetch = mockFetchOk();
      mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'tok-123';
      await service.onModuleInit();

      expect(service.isEnabled).toBe(true);
    });

    it('should set webhook when URL is configured', async () => {
      global.fetch = mockFetchOk();
      mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'tok-123';
      mockConfigValues['TELEGRAM_WEBHOOK_URL'] = 'https://example.com/hook';
      mockConfigValues['TELEGRAM_WEBHOOK_SECRET'] = 'sec-456';
      await service.onModuleInit();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.telegram.org/bottok-123/setWebhook');
      const body = JSON.parse(opts.body);
      expect(body.url).toBe('https://example.com/hook');
      expect(body.secret_token).toBe('sec-456');
    });

    it('should not include secret_token when TELEGRAM_WEBHOOK_SECRET is unset', async () => {
      global.fetch = mockFetchOk();
      mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'tok-123';
      mockConfigValues['TELEGRAM_WEBHOOK_URL'] = 'https://example.com/hook';
      await service.onModuleInit();

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.secret_token).toBeUndefined();
    });

    it('should not crash when setWebhook API fails', async () => {
      global.fetch = mockFetchFail(500, 'Internal');
      mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'tok-123';
      mockConfigValues['TELEGRAM_WEBHOOK_URL'] = 'https://example.com/hook';

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('should not crash when setWebhook throws network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'tok-123';
      mockConfigValues['TELEGRAM_WEBHOOK_URL'] = 'https://example.com/hook';

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('should skip webhook setup when no URL configured', async () => {
      global.fetch = mockFetchOk();
      mockConfigValues['TELEGRAM_BOT_TOKEN'] = 'tok-123';
      await service.onModuleInit();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // isEnabled
  // ================================================================
  describe('isEnabled', () => {
    it('should return false before init', () => {
      expect(service.isEnabled).toBe(false);
    });

    it('should return true after init with token', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      expect(service.isEnabled).toBe(true);
    });
  });

  // ================================================================
  // getWebhookSecret
  // ================================================================
  describe('getWebhookSecret', () => {
    it('should return null when no secret configured', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      expect(service.getWebhookSecret()).toBeNull();
    });

    it('should return the configured secret', async () => {
      global.fetch = mockFetchOk();
      await initWithToken({ webhookSecret: 'my-secret' });
      expect(service.getWebhookSecret()).toBe('my-secret');
    });
  });

  // ================================================================
  // sendMessage
  // ================================================================
  describe('sendMessage', () => {
    it('should return false when bot token is not set', async () => {
      global.fetch = mockFetchOk();
      await service.onModuleInit();

      const result = await service.sendMessage('123', 'hello');
      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should POST to Telegram API and return true on success', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();

      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      const result = await service.sendMessage('chat-42', 'Hello there');
      expect(result).toBe(true);

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(
        'https://api.telegram.org/bottest-bot-token/sendMessage',
      );
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.chat_id).toBe('chat-42');
      expect(body.text).toBe('Hello there');
      expect(body.parse_mode).toBe('Markdown');
    });

    it('should use provided parse_mode', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendMessage('c1', 'hi', { parse_mode: 'HTML' });
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.parse_mode).toBe('HTML');
    });

    it('should include reply_markup when provided', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      const markup = {
        inline_keyboard: [[{ text: 'Click', callback_data: 'act:1' }]],
      };
      await service.sendMessage('c1', 'hi', { reply_markup: markup });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.reply_markup).toEqual(markup);
    });

    it('should return false when API returns error status', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchFail(403, 'Forbidden');

      const result = await service.sendMessage('c1', 'hi');
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      const result = await service.sendMessage('c1', 'hi');
      expect(result).toBe(false);
    });
  });

  // ================================================================
  // sendDigest
  // ================================================================
  describe('sendDigest', () => {
    const makeReminder = (overrides?: Partial<{
      id: string;
      titolo: string;
      contatto: string | null;
      azione: string;
      scadenzaDatetime: Date | null;
      condizioneTipo: string;
      condizioneDettaglio: string | null;
      monitoraEmail: boolean;
    }>) => ({
      id: 'rem-1',
      titolo: 'Chiama Mario',
      contatto: 'Mario Rossi',
      azione: 'chiama',
      scadenzaDatetime: null,
      condizioneTipo: 'time',
      condizioneDettaglio: null,
      monitoraEmail: false,
      ...overrides,
    });

    it('should return true immediately for empty reminders', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      const result = await service.sendDigest('c1', 'mattina', []);
      expect(result).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should format digest with header and slot label', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendDigest('c1', 'mattina', [makeReminder()]);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('*FOLLOW-UP AI \u2014 Mattina*');
      expect(body.text).toContain('Chiama Mario');
      expect(body.text).toContain('Mario Rossi');
      expect(body.text).toContain('1 attivi');
      expect(body.text).toContain('0 monitora mail');
    });

    it('should use slot name as-is for unknown slots', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendDigest('c1', 'custom-slot', [makeReminder()]);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('custom-slot');
    });

    it('should include inline keyboard with done buttons', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendDigest('c1', 'sera', [
        makeReminder({ id: 'r1', titolo: 'Task A' }),
        makeReminder({ id: 'r2', titolo: 'Task B' }),
      ]);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.reply_markup.inline_keyboard).toEqual([
        [{ text: 'Done: Task A', callback_data: 'done:r1' }],
        [{ text: 'Done: Task B', callback_data: 'done:r2' }],
      ]);
    });

    it('should count monitored email reminders', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendDigest('c1', 'pomeriggio', [
        makeReminder({ monitoraEmail: true }),
        makeReminder({ id: 'r2', monitoraEmail: false }),
        makeReminder({ id: 'r3', monitoraEmail: true }),
      ]);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('3 attivi');
      expect(body.text).toContain('2 monitora mail');
    });

    it('should include scadenza date when present', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      const date = new Date('2026-03-20T14:30:00Z');
      await service.sendDigest('c1', 'mattina', [
        makeReminder({ scadenzaDatetime: date }),
      ]);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('Scadenza:');
    });

    it('should include condizioneDettaglio when present', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendDigest('c1', 'mattina', [
        makeReminder({ condizioneDettaglio: 'Entro venerdì' }),
      ]);

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('Entro venerdì');
    });
  });

  // ================================================================
  // sendImmediateAlert
  // ================================================================
  describe('sendImmediateAlert', () => {
    it('should send alert with email subject', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendImmediateAlert('c1', 'Reminder Title', 'Re: Invoice');

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('*EMAIL RILEVATA*');
      expect(body.text).toContain('Reminder Title');
      expect(body.text).toContain('Oggetto: _Re: Invoice_');
      expect(body.text).toContain('Controlla la mail');
    });

    it('should send alert without email subject', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendImmediateAlert('c1', 'Follow up');

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.text).toContain('Follow up');
      expect(body.text).not.toContain('Oggetto:');
    });
  });

  // ================================================================
  // sendChatAction
  // ================================================================
  describe('sendChatAction', () => {
    it('should do nothing when bot token is not set', async () => {
      global.fetch = mockFetchOk();
      await service.onModuleInit();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendChatAction('c1', 'typing');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should POST sendChatAction to Telegram API', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.sendChatAction('c1', 'typing');

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(
        'https://api.telegram.org/bottest-bot-token/sendChatAction',
      );
      const body = JSON.parse(opts.body);
      expect(body.chat_id).toBe('c1');
      expect(body.action).toBe('typing');
    });

    it('should not throw on network error', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(
        service.sendChatAction('c1', 'typing'),
      ).resolves.toBeUndefined();
    });
  });

  // ================================================================
  // answerCallbackQuery
  // ================================================================
  describe('answerCallbackQuery', () => {
    it('should do nothing when bot token is not set', async () => {
      global.fetch = mockFetchOk();
      await service.onModuleInit();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.answerCallbackQuery('q1', 'Done!');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should POST answerCallbackQuery to Telegram API', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = mockFetchOk();

      await service.answerCallbackQuery('query-99', 'Completato!');

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(
        'https://api.telegram.org/bottest-bot-token/answerCallbackQuery',
      );
      const body = JSON.parse(opts.body);
      expect(body.callback_query_id).toBe('query-99');
      expect(body.text).toBe('Completato!');
    });

    it('should not throw on network error', async () => {
      global.fetch = mockFetchOk();
      await initWithToken();
      jest.clearAllMocks();
      global.fetch = jest.fn().mockRejectedValue(new Error('refused'));

      await expect(
        service.answerCallbackQuery('q1', 'ok'),
      ).resolves.toBeUndefined();
    });
  });
});
