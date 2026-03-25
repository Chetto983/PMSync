/**
 * TelegramWebhookService — Handles Telegram webhook updates.
 *
 * - /start {token}: QR code link flow — binds chatId to user via Redis token
 * - callback_query done:{reminderId}: Complete reminder via inline button
 * - callback_query approve:{id} / reject:{id}: HITL tool approval via inline buttons
 * - Plain text: relays to AI chat and sends response back (Telegram as chat interface)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotService } from './telegram-bot.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { AiChatService, type PendingToolApproval } from '../../ai-chat/services/ai-chat.service';
import { ConversationService } from '../../ai-chat/services/conversation.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { AuditService } from '../../../common/services/audit.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

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

/** State stored in Redis while waiting for user to approve/reject a tool call */
interface TelegramPendingApprovalState {
  approvals: PendingToolApproval[];
  conversationId: string;
  chatId: string;
  tenantId: string;
  userId: string;
  /** The response messages from the first generateChat call, needed for re-submit */
  responseMessages: Array<{ role: string; content: unknown }>;
  /** Telegram message_ids of approval cards (for editing after resolution) */
  approvalMessageIds: number[];
}

/** 24 hours TTL for pending approvals */
const APPROVAL_TTL_SECONDS = 86_400;

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
    private readonly conversationService: ConversationService,
    private readonly auditService: AuditService,
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
      // Webhook is @Public() — no tenant context available, bypass scoping
      await withoutTenantScopingAsync(() =>
        this.prisma.telegramSettings.upsert({
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
        }),
      );

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

    // Handle /clear — reset AI chat conversation
    if (text === '/clear') {
      await this.handleClearConversation(chatId);
      return;
    }

    // Ignore other slash commands
    if (text.startsWith('/')) return;

    // Relay plain text to AI chat
    await this.handleChatRelay(chatId, text);
  }

  /**
   * Relay a Telegram message to the AI chat and send the response back.
   * Maintains persistent conversation history via aiConversationId on TelegramSettings.
   * When a tool needs HITL approval, sends inline keyboard buttons instead of the AI text.
   */
  private async handleChatRelay(chatId: string, text: string): Promise<void> {
    const settings = await this.resolveSettings(chatId);
    if (!settings) return;

    await this.telegramBot.sendChatAction(chatId, 'typing');

    try {
      const result = await CorrelationContext.run(
        { tenantId: settings.tenantId, userId: settings.userId },
        async () => {
          const conversationId = await this.ensureConversation(
            settings.id,
            settings.aiConversationId,
            settings.tenantId,
            settings.userId,
          );

          return this.aiChatService.generateChat({
            tenantId: settings.tenantId,
            userId: settings.userId,
            message: text,
            conversationId,
            abortSignal: AbortSignal.timeout(60_000),
          });
        },
      );

      // HITL: if the AI wants to call tools that need approval, pause and ask
      if (result.pendingApprovals.length > 0) {
        await this.sendApprovalRequests(
          chatId,
          result,
          settings.tenantId,
          settings.userId,
        );
        return;
      }

      await this.sendAiResponse(chatId, result.text, settings.userId);
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
   * Store pending approvals in Redis and send inline keyboard buttons for each tool.
   */
  private async sendApprovalRequests(
    chatId: string,
    result: { text: string; conversationId: string; pendingApprovals: PendingToolApproval[]; responseMessages?: Array<{ role: string; content: unknown }> },
    tenantId: string,
    userId: string,
  ): Promise<void> {
    // Use the first approval's ID as the group key — all buttons share this key
    const groupId = result.pendingApprovals[0].approvalId;

    // If the AI generated text before the tool call, send it first
    if (result.text?.trim()) {
      const chunks = this.splitMessage(result.text);
      for (const chunk of chunks) {
        await this.telegramBot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      }
    }

    // Send one approval card per tool, collect message_ids for later editing
    const approvalMessageIds: number[] = [];
    for (const approval of result.pendingApprovals) {
      const msgId = await this.telegramBot.sendToolApproval(
        chatId,
        groupId,
        approval.toolName,
        approval.input,
      );
      if (msgId) approvalMessageIds.push(msgId);
    }

    // Store state AFTER sending cards (we now have message_ids)
    const state: TelegramPendingApprovalState = {
      approvals: result.pendingApprovals,
      conversationId: result.conversationId,
      chatId,
      tenantId,
      userId,
      responseMessages: result.responseMessages ?? [],
      approvalMessageIds,
    };

    await this.cache.set(groupId, state, {
      ttl: APPROVAL_TTL_SECONDS,
      namespace: CacheNamespace.TELEGRAM_APPROVAL,
    });

    this.logger.log(
      `HITL: ${result.pendingApprovals.length} approval(s) sent to chatId=${chatId} group=${groupId}`,
    );
  }

  /**
   * Handle approve/reject callback for a pending tool approval.
   * Resumes the AI conversation with the approval response.
   */
  private async handleApprovalCallback(
    callbackQueryId: string,
    groupId: string,
    approved: boolean,
    chatId: string,
  ): Promise<void> {
    const state = await this.cache.get<TelegramPendingApprovalState>(groupId, {
      namespace: CacheNamespace.TELEGRAM_APPROVAL,
    });

    if (!state) {
      await this.telegramBot.answerCallbackQuery(
        callbackQueryId,
        'Approvazione scaduta o già gestita.',
      );
      return;
    }

    // Delete the Redis key (single-use — prevents double-click)
    await this.cache.del(groupId, { namespace: CacheNamespace.TELEGRAM_APPROVAL });

    const decision = approved ? 'approved' : 'rejected';
    const label = approved ? 'Approvato' : 'Rifiutato';
    await this.telegramBot.answerCallbackQuery(callbackQueryId, label);

    // Edit all approval card messages to show resolution and remove buttons
    const statusIcon = approved ? '\u{2705}' : '\u{274C}';
    const toolNames = state.approvals.map((a) => a.toolName).join(', ');
    const editText = `${statusIcon} *${label}*: ${toolNames}`;
    for (const msgId of state.approvalMessageIds) {
      await this.telegramBot.editMessageText(chatId, msgId, editText);
    }

    // Audit logging (fire-and-forget)
    for (const a of state.approvals) {
      this.auditService.logHitlDecision({
        tenantId: state.tenantId,
        userId: state.userId,
        toolName: a.toolName,
        toolCallId: a.toolCallId,
        decision,
        conversationId: state.conversationId,
      });
    }

    if (!approved) {
      // Rejected — no AI re-submit needed, just confirm
      await this.telegramBot.sendMessage(chatId, '\u{274C} Azione rifiutata.');
      return;
    }

    // Approved — resume AI with approval response
    await this.telegramBot.sendChatAction(chatId, 'typing');

    try {
      const messages = [
        ...state.responseMessages,
        {
          role: 'tool',
          content: state.approvals.map((a) => ({
            type: 'tool-approval-response',
            approvalId: a.approvalId,
            approved: true,
          })),
        },
      ];

      const result = await CorrelationContext.run(
        { tenantId: state.tenantId, userId: state.userId },
        () =>
          this.aiChatService.generateChat({
            tenantId: state!.tenantId,
            userId: state!.userId,
            message: '',
            conversationId: state!.conversationId,
            modelMessagesOverride: messages as Array<{ role: string; content: unknown }>,
            abortSignal: AbortSignal.timeout(60_000),
          }),
      );

      // Recursive: if the resumed call also needs approval, send new buttons
      if (result.pendingApprovals.length > 0) {
        await this.sendApprovalRequests(
          chatId,
          result,
          state.tenantId,
          state.userId,
        );
        return;
      }

      await this.sendAiResponse(chatId, result.text, state.userId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`HITL resume error for groupId=${groupId}: ${msg}`);
      await this.telegramBot.sendMessage(
        chatId,
        'Errore durante l\'esecuzione. Riprova.',
      );
    }
  }

  /** Look up linked Telegram settings by chatId, send error if not found */
  private async resolveSettings(chatId: string) {
    const settings = await withoutTenantScopingAsync(() =>
      this.prisma.telegramSettings.findFirst({
        where: { telegramChatId: chatId, isActive: true },
        select: { id: true, tenantId: true, userId: true, aiConversationId: true },
      }),
    );

    if (!settings) {
      await this.telegramBot.sendMessage(
        chatId,
        'Account non collegato. Vai su PMSync > Impostazioni > Telegram per collegare il tuo account.',
      );
      return null;
    }
    return settings;
  }

  /** Send AI text response, split into chunks if needed */
  private async sendAiResponse(chatId: string, text: string, userId: string): Promise<void> {
    if (!text.trim()) {
      await this.telegramBot.sendMessage(chatId, 'Nessuna risposta generata.');
      return;
    }

    const chunks = this.splitMessage(text);
    for (const chunk of chunks) {
      await this.telegramBot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
    }
    this.logger.debug(`Chat relay: chatId=${chatId} userId=${userId} len=${text.length}`);
  }

  /**
   * Ensure a persistent AiConversation exists for this Telegram chat.
   * Creates one on first message and stores the ID in TelegramSettings.
   */
  private async ensureConversation(
    settingsId: string,
    existingConversationId: string | null,
    tenantId: string,
    userId: string,
  ): Promise<string> {
    if (existingConversationId) {
      // Verify conversation still exists (may have been deleted from web UI)
      const exists = await this.prisma.aiConversation.findFirst({
        where: { id: existingConversationId, tenantId, userId },
        select: { id: true },
      });
      if (exists) return existingConversationId;
    }

    // Create a new conversation via ConversationService
    const conversation = await this.conversationService.getOrCreateConversation(
      undefined,
      tenantId,
      userId,
    );

    // Persist the conversation ID on TelegramSettings
    await this.prisma.telegramSettings.update({
      where: { id: settingsId },
      data: { aiConversationId: conversation.id },
    });

    this.logger.log(`Created Telegram conversation: ${conversation.id} for settings ${settingsId}`);
    return conversation.id;
  }

  /**
   * Handle /clear — reset the Telegram AI chat conversation.
   * Detaches the current conversation so next message starts fresh.
   */
  private async handleClearConversation(chatId: string): Promise<void> {
    const settings = await withoutTenantScopingAsync(() =>
      this.prisma.telegramSettings.findFirst({
        where: { telegramChatId: chatId, isActive: true },
        select: { id: true, aiConversationId: true },
      }),
    );

    if (!settings) {
      await this.telegramBot.sendMessage(
        chatId,
        'Account non collegato. Vai su PMSync > Impostazioni > Telegram per collegare il tuo account.',
      );
      return;
    }

    if (settings.aiConversationId) {
      await withoutTenantScopingAsync(() =>
        this.prisma.telegramSettings.update({
          where: { id: settings.id },
          data: { aiConversationId: null },
        }),
      );
    }

    await this.telegramBot.sendMessage(chatId, 'Conversazione cancellata. Il prossimo messaggio inizierà una nuova chat.');
    this.logger.log(`Telegram conversation cleared for settings ${settings.id}`);
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
    const { id: callbackQueryId, data, from } = query;

    if (!data) return;

    const chatId = String(from.id);

    // Handle HITL approve/reject callbacks
    if (data.startsWith('approve:')) {
      const approvalId = data.replace('approve:', '');
      await this.handleApprovalCallback(callbackQueryId, approvalId, true, chatId);
      return;
    }
    if (data.startsWith('reject:')) {
      const approvalId = data.replace('reject:', '');
      await this.handleApprovalCallback(callbackQueryId, approvalId, false, chatId);
      return;
    }

    // Handle "done:{reminderId}" callback
    if (data.startsWith('done:')) {
      const reminderId = data.replace('done:', '');

      try {
        // SEC: Resolve the user via chatId to enforce tenant boundary.
        // Without this, a crafted callback_data could complete another tenant's reminder.
        // Webhook is @Public() — no tenant context, bypass scoping
        const settings = await withoutTenantScopingAsync(() =>
          this.prisma.telegramSettings.findFirst({
            where: { telegramChatId: chatId, isActive: true },
            select: { tenantId: true, userId: true },
          }),
        );

        if (!settings) {
          await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Account non collegato');
          return;
        }

        const reminder = await withoutTenantScopingAsync(() =>
          this.prisma.reminder.findFirst({
            where: {
              id: reminderId,
              tenantId: settings.tenantId,
              userId: settings.userId,
              status: ReminderStatus.attivo,
            },
          }),
        );

        if (!reminder) {
          await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Reminder non trovato');
          return;
        }

        await withoutTenantScopingAsync(() =>
          this.prisma.reminder.update({
            where: { id: reminderId },
            data: { status: ReminderStatus.completato, completatoAt: new Date() },
          }),
        );

        await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Completato!');

        this.logger.log(`Reminder ${reminderId} completed via Telegram callback by user ${settings.userId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Callback query error for reminder ${reminderId}: ${msg}`);
        await this.telegramBot.answerCallbackQuery(callbackQueryId, 'Errore');
      }
    }
  }
}
