/**
 * TelegramWebhookService — Handles Telegram webhook updates.
 *
 * - /start {token}: QR code link flow — binds chatId to user via Redis token
 * - callback_query done:{reminderId}: Complete reminder via inline button
 */
import { Injectable, Logger } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotService } from './telegram-bot.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBot: TelegramBotService,
    private readonly cache: CacheService,
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
