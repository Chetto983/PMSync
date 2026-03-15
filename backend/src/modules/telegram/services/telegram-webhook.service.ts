/**
 * TelegramWebhookService — Handles Telegram webhook updates.
 *
 * - /start {token}: QR code link flow — binds chatId to user via Redis token
 * - callback_query done:{reminderId}: Complete reminder via inline button
 * - Plain text: relays to AI chat and sends response back (Telegram as chat interface)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotService } from './telegram-bot.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { AiChatService } from '../../ai-chat/services/ai-chat.service';

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
  };
  message?: {
    text?: string;
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
  };
}

interface LinkTokenPayload {
  tenantId: string;
  userId: string;
}

@Injectable()
export class TelegramWebhookService {
  private readonly logger = new Logger(TelegramWebhookService.name);

  /** Max Telegram message length (API limit is 4096) */
  private static readonly TG_MAX_LENGTH = 4000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBot: TelegramBotService,
    private readonly cache: CacheService,
    private readonly aiChatService: AiChatService,
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message?.text) {
      await this.handleMessage(update.message);
    }
  }

  /**
   * Handle /start {token} — QR code link flow.
   */
  private async handleMessage(message: {
    text?: string;
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
  }): Promise<void> {
    const text = message.text?.trim() ?? '';
    const chatId = String(message.chat.id);

    // Handle /start with link token
    if (text.startsWith('/start ')) {
      const token = text.replace('/start ', '').trim();
      if (!token) {
        await this.telegramBot.sendMessage(chatId, 'Token non valido. Genera un nuovo QR code da PMSync.');
        return;
      }

      const payload = await this.cache.get<LinkTokenPayload>(token, {
        namespace: CacheNamespace.TELEGRAM_LINK,
      });

      if (!payload) {
        await this.telegramBot.sendMessage(
          chatId,
          'Link scaduto o non valido. Genera un nuovo QR code dalle impostazioni di PMSync.',
        );
        return;
      }

      // Delete token (single use)
      await this.cache.del(token, { namespace: CacheNamespace.TELEGRAM_LINK });

      // Upsert TelegramSettings with the chatId
      await this.prisma.telegramSettings.upsert({
        where: { userId: payload.userId },
        create: {
          tenantId: payload.tenantId,
          userId: payload.userId,
          telegramChatId: chatId,
          isActive: true,
        },
        update: {
          telegramChatId: chatId,
          isActive: true,
        },
      });

      const userName = message.from?.first_name ?? 'utente';
      await this.telegramBot.sendMessage(
        chatId,
        `Collegamento riuscito, ${userName}! ` +
        'Riceverai i promemoria nei tuoi slot configurati.\n\n' +
        'Puoi gestire le impostazioni da PMSync > Impostazioni > Telegram.',
      );

      this.logger.log(`Telegram linked: chatId=${chatId} userId=${payload.userId}`);
      return;
    }

    // Handle plain /start (no token)
    if (text === '/start') {
      await this.telegramBot.sendMessage(
        chatId,
        'Benvenuto in *PMSync Follow-Up AI*!\n\n' +
        'Per collegare il tuo account, vai su:\n' +
        'PMSync > Impostazioni > Telegram\n' +
        'e scansiona il QR code.',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // Ignore other slash commands
    if (text.startsWith('/')) return;

    // Relay plain text to AI chat
    await this.handleChatRelay(chatId, text);
  }

  /**
   * Relay a Telegram message to the AI chat and send the response back.
   * Looks up user by chatId, calls AiChatService.streamChat(), collects
   * the full text response, and sends it as a Telegram message.
   */
  private async handleChatRelay(chatId: string, text: string): Promise<void> {
    // Look up linked user by chatId
    const settings = await this.prisma.telegramSettings.findFirst({
      where: { telegramChatId: chatId, isActive: true },
      select: { tenantId: true, userId: true },
    });

    if (!settings) {
      await this.telegramBot.sendMessage(
        chatId,
        'Account non collegato. Vai su PMSync > Impostazioni > Telegram per collegare il tuo account.',
      );
      return;
    }

    // Send typing indicator while AI processes
    await this.telegramBot.sendChatAction(chatId, 'typing');

    try {
      const stream = await this.aiChatService.streamChat({
        tenantId: settings.tenantId,
        userId: settings.userId,
        message: text,
      });

      const responseText = await this.collectStreamText(stream);

      if (!responseText.trim()) {
        await this.telegramBot.sendMessage(chatId, 'Nessuna risposta generata.');
        return;
      }

      // Split long messages (Telegram 4096 char limit)
      const chunks = this.splitMessage(responseText);
      for (const chunk of chunks) {
        await this.telegramBot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      }

      this.logger.debug(`Chat relay: chatId=${chatId} userId=${settings.userId} len=${responseText.length}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Chat relay error for chatId=${chatId}: ${msg}`);
      await this.telegramBot.sendMessage(
        chatId,
        'Si è verificato un errore. Riprova tra qualche istante.',
      );
    }
  }

  /**
   * Consume a UI message stream and extract all text content.
   * The data stream protocol sends text chunks as lines starting with `0:`.
   */
  private async collectStreamText(stream: ReadableStream): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete line in buffer

        for (const line of lines) {
          // Data stream protocol: text chunks are `0:"escaped text"`
          if (line.startsWith('0:')) {
            try {
              const parsed = JSON.parse(line.slice(2));
              if (typeof parsed === 'string') {
                fullText += parsed;
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('0:')) {
        try {
          const parsed = JSON.parse(buffer.slice(2));
          if (typeof parsed === 'string') {
            fullText += parsed;
          }
        } catch {
          // Skip
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText;
  }

  /**
   * Split a message into chunks that fit Telegram's 4096 char limit.
   */
  private splitMessage(text: string): string[] {
    if (text.length <= TelegramWebhookService.TG_MAX_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= TelegramWebhookService.TG_MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }
      // Try to split at last newline before limit
      const slice = remaining.slice(0, TelegramWebhookService.TG_MAX_LENGTH);
      const lastNewline = slice.lastIndexOf('\n');
      const splitAt = lastNewline > 0 ? lastNewline + 1 : TelegramWebhookService.TG_MAX_LENGTH;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }
    return chunks;
  }

  private async handleCallbackQuery(query: {
    id: string;
    data?: string;
    from: { id: number };
  }): Promise<void> {
    const { id: callbackQueryId, data } = query;

    if (!data) return;

    // Handle "done:{reminderId}" callback
    if (data.startsWith('done:')) {
      const reminderId = data.replace('done:', '');

      try {
        const reminder = await this.prisma.reminder.findFirst({
          where: { id: reminderId, status: ReminderStatus.attivo },
        });

        if (!reminder) {
          await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Reminder non trovato');
          return;
        }

        await this.prisma.reminder.update({
          where: { id: reminderId },
          data: { status: ReminderStatus.completato, completatoAt: new Date() },
        });

        await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Completato!');

        this.logger.log(`Reminder ${reminderId} completed via Telegram callback`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Callback query error for reminder ${reminderId}: ${msg}`);
        await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Errore');
      }
    }
  }
}
