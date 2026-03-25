/**
 * TelegramBotService — Wrapper for Telegram Bot API.
 *
 * Handles message sending, digest formatting, and webhook setup.
 * Gracefully degrades if TELEGRAM_BOT_TOKEN is not configured.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatToolPreview } from '../utils/tool-preview';

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
    return !!(await this.sendMessageRaw(chatId, text, options));
  }

  /**
   * Send a message and return the Telegram message_id (or null on failure).
   * Used when we need the message_id for later editing (e.g. HITL approval cards).
   */
  private async sendMessageRaw(
    chatId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<number | null> {
    if (!this.botToken) {
      this.logger.warn('Cannot send message: TELEGRAM_BOT_TOKEN not configured');
      return null;
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
        return null;
      }

      const json = await response.json() as { result?: { message_id?: number } };
      return json.result?.message_id ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Telegram sendMessage error: ${msg}`);
      return null;
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
   * Send a chat action (e.g., 'typing') to indicate the bot is processing.
   */
  async sendChatAction(chatId: string, action: 'typing' | 'upload_photo' | 'upload_document'): Promise<void> {
    if (!this.botToken) return;

    try {
      await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendChatAction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action }),
        },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`sendChatAction failed: ${msg}`);
    }
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

  /**
   * Send a tool approval request with inline Approve/Reject buttons.
   * @param groupId - Redis key for the approval group (used in callback_data)
   * @returns Telegram message_id (for later editing) or null on failure
   */
  async sendToolApproval(
    chatId: string,
    groupId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<number | null> {
    const toolEmoji = this.getToolEmoji(toolName);
    const previewLines = formatToolPreview(toolName, input);

    const text =
      `${toolEmoji} *Tool: ${toolName}*\n` +
      previewLines.map((l) => `  ${l}`).join('\n') +
      `\n\nRequires your approval.`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '\u{2705} Approve', callback_data: `approve:${groupId}` },
          { text: '\u{274C} Reject', callback_data: `reject:${groupId}` },
        ],
      ],
    };

    // Try Markdown first, fallback to plain text if parsing fails
    const msgId = await this.sendMessageRaw(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    });

    if (msgId) return msgId;

    // Fallback: strip Markdown formatting and send as plain text
    const plainText = text.replace(/\*/g, '').replace(/\\/g, '');
    this.logger.warn('sendToolApproval: Markdown failed, retrying as plain text');
    return this.sendMessageRaw(chatId, plainText, { reply_markup: replyMarkup });
  }

  /**
   * Edit an existing message text (removes inline keyboard by default).
   * Used to update approval cards after user decides.
   */
  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    parseMode: 'Markdown' | 'HTML' = 'Markdown',
  ): Promise<void> {
    if (!this.botToken) return;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.botToken}/editMessageText`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: parseMode,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.warn(`editMessageText failed: ${response.status} ${errorBody}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`editMessageText error: ${msg}`);
    }
  }

  private getToolEmoji(toolName: string): string {
    const map: Record<string, string> = {
      send_email: '\u{2709}\u{FE0F}',
      reply_email: '\u{21A9}\u{FE0F}',
      forward_email: '\u{27A1}\u{FE0F}',
      delete_email: '\u{1F5D1}\u{FE0F}',
      archive_email: '\u{1F4E6}',
      move_email: '\u{1F4C2}',
      draft_email: '\u{1F4DD}',
      create_event: '\u{1F4C5}',
      update_event: '\u{1F504}',
      delete_event: '\u{274C}',
      create_contact: '\u{1F464}',
      update_contact: '\u{270F}\u{FE0F}',
      delete_contact: '\u{1F6AB}',
    };
    return map[toolName] ?? '\u{1F527}';
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
