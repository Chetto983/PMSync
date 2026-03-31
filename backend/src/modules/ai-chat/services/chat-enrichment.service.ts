/**
 * ChatEnrichmentService -- Extracted from AiChatService for RULE-3 compliance.
 *
 * Handles conversation enrichment tasks:
 * - Smart title generation (LLM-based, triggers at 4 messages)
 * - Summary generation (LLM-based, triggers at context window intervals)
 * - Runtime context metadata (user preferences, provider, locale)
 *
 * Phase 87 Plan 04: Split from ai-chat.service.ts to stay under 500 lines.
 */
import {
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { generateText } from 'ai';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { ConversationService } from './conversation.service';
import { PiiDetectionService } from '../../ai/guards/pii-detection-sentinel.service';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { extractSafeMessageTextForModel } from '../utils/model-redaction';

@Injectable()
export class ChatEnrichmentService {
  private readonly logger = new Logger(ChatEnrichmentService.name);

  constructor(
    private readonly mistralProvider: OpenRouterProviderService,
    private readonly conversationService: ConversationService,
    private readonly piiDetectionService: PiiDetectionService,
    @Optional() private readonly ledgerService?: AiRunLedgerService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private async generateModelText(
    args: Parameters<typeof generateText>[0],
  ): ReturnType<typeof generateText> {
    return generateText(args);
  }

  async getRuntimeContextMetadata(
    tenantId: string,
    userId: string,
    requestedLocale?: string,
    requestedTimezone?: string,
  ): Promise<{
    timezone?: string;
    providerType?: string;
    locale?: string;
    displayName?: string;
    jobTitle?: string;
    communicationStyle?: string;
    responseLength?: string;
    proactivityLevel?: string;
    emailAccounts?: Array<{ email?: string; displayName?: string; providerType: string }>;
  }> {
    if (!this.prisma) {
      return {
        locale: requestedLocale,
        timezone: requestedTimezone,
      };
    }

    const [preferences, provider, user] = await Promise.all([
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          tenantId: true,
          timezone: true,
          language: true,
          jobTitle: true,
          communicationStyle: true,
          responseLength: true,
          proactivityLevel: true,
        },
      }),
      this.prisma.providerConfig.findMany({
        where: {
          tenantId,
          isActive: true,
          supportsEmail: true,
        },
        orderBy: { createdAt: 'asc' },
        select: { providerType: true, email: true, displayName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          tenantId: true,
          firstName: true,
          lastName: true,
          name: true,
        },
      }),
    ]);

    // Multi-tenant guard: verify fetched records belong to the requesting tenant
    if (preferences && preferences.tenantId !== tenantId) {
      this.logger.warn(`Tenant mismatch on UserPreferences: expected ${tenantId}, got ${preferences.tenantId}`);
      return { locale: requestedLocale };
    }
    if (user && user.tenantId !== tenantId) {
      this.logger.warn(`Tenant mismatch on User: expected ${tenantId}, got ${user.tenantId}`);
      return { locale: requestedLocale };
    }

    const displayName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
      user?.name?.trim() ||
      undefined;

    // Build email accounts list for multi-provider awareness
    const emailAccounts = (provider ?? []).map((p) => ({
      email: p.email ?? undefined,
      displayName: p.displayName ?? undefined,
      providerType: p.providerType,
    }));

    return {
      timezone: requestedTimezone ?? preferences?.timezone ?? undefined,
      providerType: (provider ?? [])[0]?.providerType ?? undefined,
      locale: requestedLocale ?? preferences?.language ?? undefined,
      displayName,
      jobTitle: preferences?.jobTitle ?? undefined,
      communicationStyle: preferences?.communicationStyle ?? undefined,
      responseLength: preferences?.responseLength ?? undefined,
      proactivityLevel: preferences?.proactivityLevel ?? undefined,
      emailAccounts: emailAccounts.length > 0 ? emailAccounts : undefined,
    };
  }

  /**
   * Generate a smart conversation title using LLM after the second exchange.
   *
   * Triggers at exactly 4 messages (user + assistant + user + assistant).
   * Uses a cheap/fast model call to create a concise title from the
   * conversation content, replacing the crude initial title.
   *
   * Fire-and-forget from onFinish callback.
   */
  async maybeGenerateSmartTitle(
    conversationId: string,
    tenantId: string,
    messageCount?: number,
  ): Promise<void> {
    // Use provided count from save operation to avoid TOCTOU race (RACE-2).
    // Falls back to DB query only if count not provided (backward compat).
    const count = messageCount ??
      await this.conversationService.getMessageCount(conversationId, tenantId);

    // Only generate on the second exchange (4 messages)
    if (count !== 4) return;

    const messages = await this.conversationService.getRecentMessages(
      conversationId,
      4,
      tenantId,
    );

    if (messages.length < 4) return;

    const messageText = messages
      .map((m) => {
        const text = extractSafeMessageTextForModel(
          this.piiDetectionService,
          m,
        );
        return `${m.role}: ${text.slice(0, 200)}`;
      })
      .join('\n');

    const { text: title } = await this.generateModelText({
      model: this.mistralProvider.getChatModel(),
      system:
        'Generate a short conversation title (max 6 words) for the following chat. ' +
        'The title should capture the main topic or intent. ' +
        'Write in the same language as the conversation. ' +
        'Return ONLY the title, no quotes, no punctuation at the end.',
      messages: [{ role: 'user', content: messageText }],
    });

    const cleanTitle = title.replace(/^["']|["']$/g, '').trim().slice(0, 80);

    if (cleanTitle) {
      await this.conversationService.updateConversationTitle(
        conversationId,
        cleanTitle,
      );
      this.logger.log(
        `Smart title generated for conversation ${conversationId}: "${cleanTitle}"`,
      );
    }
  }

  /**
   * CHAT-M1: Configurable context window for summary trigger.
   * Aligns with AI_CHAT_CONTEXT_WINDOW in ai-chat.service.ts.
   */
  private static readonly CONTEXT_WINDOW = Math.max(
    10,
    parseInt(process.env.AI_CHAT_CONTEXT_WINDOW ?? '20', 10) || 20,
  );

  /**
   * Async summary generation for long conversations.
   *
   * Triggers at context-window intervals with a tolerance window for
   * multi-step tool call bursts. Summarizes older messages (all except
   * the recent half of the context window) and stores in AiConversation.summary.
   *
   * Fire-and-forget from onFinish callback -- failures are logged, not thrown.
   */
  async maybeTriggerSummaryGeneration(
    conversationId: string,
    tenantId: string,
    messageCount?: number,
  ): Promise<void> {
    const contextWindow = ChatEnrichmentService.CONTEXT_WINDOW;
    const recentKeep = Math.floor(contextWindow / 2);
    const summaryInterval = recentKeep;

    // Use provided count from save operation to avoid TOCTOU race (RACE-2).
    // Falls back to DB query only if count not provided (backward compat).
    const count = messageCount ??
      await this.conversationService.getMessageCount(conversationId, tenantId);

    // Only at context-window intervals (e.g., 20, 30, 40 for window=20).
    // Prevents redundant LLM summary calls on every message after threshold.
    if (count < contextWindow || (count - contextWindow) % summaryInterval !== 0) return;

    // Load older messages to summarize (keep recent half verbatim)
    const olderMessages =
      await this.conversationService.getOlderMessages(conversationId, recentKeep, tenantId);

    if (olderMessages.length === 0) return;

    // Format messages for summarization prompt
    const messageText = olderMessages
      .map((m) => {
        const text = extractSafeMessageTextForModel(
          this.piiDetectionService,
          m,
        );
        return `${m.role}: ${text}`;
      })
      .join('\n');

    const summaryStart = Date.now();
    const { text: summary, usage } = await this.generateModelText({
      model: this.mistralProvider.getChatModel(),
      system: [
        'Summarize the following conversation history using this structured format.',
        'Write in the same language as the conversation.',
        '',
        '## Key Facts',
        'Bullet list of factual information established (names, dates, preferences).',
        '',
        '## Decisions Made',
        'Bullet list of decisions or actions the user confirmed.',
        '',
        '## Pending Actions',
        'Bullet list of unfinished tasks, follow-ups, or open questions.',
        '',
        '## Context',
        'One paragraph summarizing the overall conversation flow and tone.',
        '',
        'Omit any section that has no items. Be concise — max 200 words total.',
      ].join('\n'),
      messages: [{ role: 'user', content: messageText }],
    });

    // Phase 35: Fire-and-forget ledger for summary generation
    this.ledgerService?.recordRun({
      tenantId,
      userId: 'system',
      runType: 'chat-summary',
      model: this.mistralProvider.getChatModelName(),
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      latencyMs: Date.now() - summaryStart,
    }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

    await this.conversationService.updateConversationSummary(
      conversationId,
      summary,
    );

    this.logger.log(
      `Summary generated for conversation ${conversationId} (${olderMessages.length} messages summarized)`,
    );
  }
}
