/**
 * TelegramBotService — Wrapper for Telegram Bot API.
 *
 * Handles message sending, digest formatting, and webhook setup.
 * Gracefully degrades if TELEGRAM_BOT_TOKEN is not configured.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

interface InlineButton {
  text: string;
  callback_data: string;
}

interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'HTML';
  reply_markup?: {
    inline_keyboard: InlineButton[][];
  };
}

interface ReminderDigestItem {
  id: string;
  titolo: string;
  contatto: string | null;
  azione: string;
  scadenzaDatetime: Date | null;
  condizioneTipo: string;
  condizioneDettaglio: string | null;
  monitoraEmail: boolean;
}

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);
  private botToken: string | null = null;
  private webhookUrl: string | null = null;
  private webhookSecret: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? null;
    this.webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL') ?? null;
    this.webhookSecret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? null;

    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram features disabled');
      return;
    }

    if (this.webhookUrl) {
      await this.setWebhook();
    }
  }

  get isEnabled(): boolean {
    return !!this.botToken;
  }

  getWebhookSecret(): string | null {
    return this.webhookSecret;
  }

  /**
   * Send a text message to a Telegram chat.
   */
  async sendMessage(
    chatId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Cannot send message: TELEGRAM_BOT_TOKEN not configured');
      return false;
    }

    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode ?? 'Markdown',
      };
      if (options?.reply_markup) {
        body.reply_markup = options.reply_markup;
      }

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Telegram sendMessage failed: ${response.status} ${errorBody}`);
        return false;
      }

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Telegram sendMessage error: ${msg}`);
      return false;
    }
  }

  /**
   * Send a grouped digest of reminders for a time slot.
   */
  async sendDigest(
    chatId: string,
    slot: string,
    reminders: ReminderDigestItem[],
  ): Promise<boolean> {
    if (!reminders.length) return true;

    const slotLabels: Record<string, string> = {
      mattina: 'Mattina',
      pomeriggio: 'Pomeriggio',
      sera: 'Sera',
    };

    const header = `*FOLLOW-UP AI — ${slotLabels[slot] ?? slot}*\n`;
    const separator = '\n─────────────────────\n';

    const items = reminders.map((r) => {
      const emoji = this.getActionEmoji(r.azione);
      const contactLine = r.contatto ? ` — ${r.contatto}` : '';
      const condLine = r.condizioneDettaglio
        ? `\n${r.condizioneDettaglio}`
        : '';
      const dateLine = r.scadenzaDatetime
        ? `\nScadenza: ${this.formatDate(r.scadenzaDatetime)}`
        : '';
      return `${emoji} *${r.titolo}*${contactLine}${condLine}${dateLine}`;
    });

    const activeCount = reminders.length;
    const monitorCount = reminders.filter((r) => r.monitoraEmail).length;
    const footer = `\n${activeCount} attivi · ${monitorCount} monitora mail`;

    const text = header + items.join(separator) + separator + footer;

    const inlineKeyboard = reminders.map((r) => [
      { text: `Done: ${r.titolo.substring(0, 25)}`, callback_data: `done:${r.id}` },
    ]);

    return this.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  }

  /**
   * Send an immediate alert when an email condition triggers.
   */
  async sendImmediateAlert(
    chatId: string,
    reminderTitolo: string,
    emailSubject?: string,
  ): Promise<boolean> {
    const subjectLine = emailSubject
      ? `\nOggetto: _${emailSubject}_`
      : '';
    const text =
      `*EMAIL RILEVATA*\n\n` +
      `${reminderTitolo}${subjectLine}\n` +
      `Controlla la mail e aggiorna lo stato`;

    return this.sendMessage(chatId, text);
  }

  /**
   * Answer a callback query (acknowledge button press).
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    text: string,
  ): Promise<void> {
    if (!this.botToken) return;

    try {
      await fetch(
        `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text,
          }),
        },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`answerCallbackQuery failed: ${msg}`);
    }
  }

  private async setWebhook(): Promise<void> {
    try {
      const body: Record<string, unknown> = { url: this.webhookUrl };
      if (this.webhookSecret) {
        body.secret_token = this.webhookSecret;
      }

      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (response.ok) {
        this.logger.log(`Telegram webhook set to ${this.webhookUrl}`);
      } else {
        const errorBody = await response.text();
        this.logger.error(`Failed to set Telegram webhook: ${errorBody}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`setWebhook error: ${msg}`);
    }
  }

  private getActionEmoji(azione: string): string {
    const map: Record<string, string> = {
      chiama: '\u{1F4DE}',
      scrivi_mail: '\u{2709}\u{FE0F}',
      verifica: '\u{1F50D}',
      conferma: '\u{2705}',
      controlla: '\u{1F4CA}',
      altro: '\u{1F4CB}',
    };
    return map[azione] ?? '\u{1F4CB}';
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
