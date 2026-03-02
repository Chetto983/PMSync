import { Injectable, Logger } from '@nestjs/common';
import {
  streamText,
  generateText,
  createUIMessageStream,
  stepCountIs,
} from 'ai';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { ConversationService } from './conversation.service';
import { SYSTEM_PROMPT } from '../constants/system-prompt';

/**
 * Parameters for streamChat method.
 */
export interface StreamChatParams {
  tenantId: string;
  userId: string;
  message: string;
  conversationId?: string;
  model?: string;
  abortSignal?: AbortSignal;
}

/**
 * AiChatService -- Core chat orchestration with AI SDK v6.
 *
 * Pipeline: Controller -> AiChatService.streamChat() -> streamText
 *
 * This is the Plan 01 skeleton. Plan 02 decorates it with:
 * - PII tokenization/detokenization
 * - Audit logging
 * - Consent guard
 * - Rate limiting
 * - Circuit breaker
 * - HITL approval
 *
 * Phase 24: Backend Core Pipeline
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Stream a chat response.
   *
   * 1. Get or create conversation
   * 2. Save user message
   * 3. Load conversation history (last 10 messages + summary)
   * 4. Create UI message stream wrapping streamText
   * 5. Return ReadableStream for piping to response
   */
  async streamChat(params: StreamChatParams): Promise<ReadableStream> {
    const {
      tenantId,
      userId,
      message,
      conversationId,
      model,
      abortSignal,
    } = params;

    // 1. Get or create conversation
    const conversation =
      await this.conversationService.getOrCreateConversation(
        conversationId,
        tenantId,
        userId,
      );

    // 2. Save user message to conversation
    await this.conversationService.saveUserMessage(
      conversation.id,
      message,
    );

    // 3. Load conversation history (last 10 messages + summary)
    const messages = await this.conversationService.getMessagesForContext(
      conversation.id,
    );

    // 4. Append current user message
    messages.push({ role: 'user', content: message });

    // 5. Create UI message stream
    return createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: this.mistralProvider.getChatModel(model),
          system: SYSTEM_PROMPT,
          messages,
          // tools: {} -- empty for now, Plan 02 adds tools with PII resolution
          stopWhen: stepCountIs(5),
          abortSignal,
          onStepFinish: async ({ text, usage }) => {
            // Persist assistant message after each step
            if (text) {
              await this.conversationService
                .saveAssistantMessage(
                  conversation.id,
                  { type: 'text', text },
                  usage?.totalTokens,
                )
                .catch((err) =>
                  this.logger.warn(
                    `Failed to persist step: ${err.message}`,
                  ),
                );
            }
          },
          onFinish: async ({ text }) => {
            // Generate title for new conversations (first message)
            if (!conversationId && text) {
              const title = text
                .slice(0, 100)
                .replace(/\n/g, ' ')
                .trim();
              await this.conversationService
                .updateConversationTitle(
                  conversation.id,
                  title || 'New conversation',
                )
                .catch((err) =>
                  this.logger.warn(
                    `Failed to set title: ${err.message}`,
                  ),
                );
            }

            // Check if summary generation is needed (> 20 messages)
            this.maybeTriggerSummaryGeneration(conversation.id).catch(
              (err) =>
                this.logger.warn(
                  `Summary generation failed: ${err.message}`,
                ),
            );
          },
        });

        // Merge streamText output into UI message stream
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: false,
            onError: (error) =>
              error instanceof Error ? error.message : String(error),
          }),
        );
      },
    });
  }

  /**
   * Async summary generation for long conversations.
   *
   * Triggers when conversation exceeds 20 messages.
   * Summarizes older messages (all except the last 10)
   * and stores the summary in AiConversation.summary.
   *
   * Fire-and-forget from onFinish callback -- failures are logged, not thrown.
   */
  private async maybeTriggerSummaryGeneration(
    conversationId: string,
  ): Promise<void> {
    const messageCount =
      await this.conversationService.getMessageCount(conversationId);

    if (messageCount <= 20) return;

    // Load older messages to summarize
    const olderMessages =
      await this.conversationService.getOlderMessages(conversationId, 10);

    if (olderMessages.length === 0) return;

    // Format messages for summarization prompt
    const messageText = olderMessages
      .map((m) => {
        const content = m.content as Record<string, unknown>;
        const text =
          typeof content === 'string'
            ? content
            : (content as { text?: string })?.text ?? JSON.stringify(content);
        return `${m.role}: ${text}`;
      })
      .join('\n');

    const { text: summary } = await generateText({
      model: this.mistralProvider.getChatModel(),
      system:
        'Summarize the following conversation history in 2-3 concise paragraphs. ' +
        'Preserve key facts, decisions, and action items. ' +
        'Write in the same language as the conversation.',
      messages: [{ role: 'user', content: messageText }],
    });

    await this.conversationService.updateConversationSummary(
      conversationId,
      summary,
    );

    this.logger.log(
      `Summary generated for conversation ${conversationId} (${olderMessages.length} messages summarized)`,
    );
  }
}
