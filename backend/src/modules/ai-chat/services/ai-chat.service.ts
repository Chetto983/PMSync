import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
} from '@nestjs/common';
import {
  generateText,
  ToolLoopAgent,
  stepCountIs,
  type StepResult,
  type ToolSet,
} from 'ai';
import { Prisma } from '@prisma/client';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { ConversationService } from './conversation.service';
import { PiiDetectionService } from '../../ai/guards/pii-detection-sentinel.service';
import { PiiResolutionService } from '../../ai/guards/pii-resolution.service';
import { AuditService } from '../../../common/services/audit.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import {
  getAiCircuitBreaker,
  CircuitBreakerOpenError,
} from '../../ai/utils/index';
import {
  buildSystemPrompt,
  buildExtendedRuntimeContext,
} from '../constants/system-prompt';
import {
  EmailToolsService,
  CalendarToolsService,
  ContactToolsService,
  FolderToolsService,
  RagToolsService,
  ConversationToolsService,
  SandboxToolsService,
  ProductivityToolsService,
  ReminderToolsService,
} from '../tools/index';
import { MemoryService } from './memory.service';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  extractSafeMessageTextForModel,
  redactModelMessagesForModel,
  redactTextForModel,
} from '../utils/model-redaction';

/**
 * Parameters for streamChat method.
 */
export interface StreamChatParams {
  tenantId: string;
  userId: string;
  message: string;
  conversationId?: string;
  model?: string;
  locale?: string;
  abortSignal?: AbortSignal;
}

/** Rate limit: 30 requests per 60 seconds per user */
const CHAT_RATE_LIMIT_MAX = 30;
const CHAT_RATE_LIMIT_WINDOW = 60;

/**
 * AiChatService -- Core chat orchestration with AI SDK v6.
 *
 * Pipeline: rate limit -> circuit breaker -> PII tokenize -> ToolLoopAgent
 * Phase 25+: full tool access with memory injection and agent-native tool loops
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly conversationService: ConversationService,
    // Plan 02: Cross-cutting concerns
    private readonly piiDetectionService: PiiDetectionService,
    private readonly piiResolutionService: PiiResolutionService,
    private readonly auditService: AuditService,
    private readonly rateLimiterService: RedisRateLimiterService,
    // Phase 25: Tool services
    private readonly emailToolsService: EmailToolsService,
    private readonly calendarToolsService: CalendarToolsService,
    private readonly contactToolsService: ContactToolsService,
    private readonly folderToolsService: FolderToolsService,
    private readonly ragToolsService: RagToolsService,
    // Phase AI-AUDIT: Conversation + sandbox tools
    private readonly conversationToolsService: ConversationToolsService,
    private readonly sandboxToolsService: SandboxToolsService,
    // Phase CONSOLIDATION: Productivity tools (follow-ups, labels, stars, email index)
    private readonly productivityToolsService: ProductivityToolsService,
    // Phase REMINDER: Smart follow-up reminder tools
    private readonly reminderToolsService: ReminderToolsService,
    private readonly memoryService: MemoryService,
    @Optional()
    @Inject(UsageTrackingService)
    private readonly usageTrackingService?: UsageTrackingService,
    // Phase 35: AI Run Ledger telemetry
    @Optional() private readonly ledgerService?: AiRunLedgerService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Stream a chat response.
   *
   * 1. Rate limit check (per-user)
   * 2. Circuit breaker check
   * 3. Get or create conversation
   * 4. PII tokenize user message
   * 5. Load/redact prior context before appending the current turn
   * 6. Save the original message for conversation history
   * 7. Run ToolLoopAgent and stream UI messages
   * 8. Audit log + usage tracking
   */
  async streamChat(params: StreamChatParams): Promise<ReadableStream> {
    const {
      tenantId,
      userId,
      message,
      conversationId,
      model,
      locale,
      abortSignal,
    } = params;

    // 1. Rate limit check (per-user, 30 req/min)
    const rateLimitResult = await this.rateLimiterService.checkRateLimit(
      `ai-chat:${userId}`,
      CHAT_RATE_LIMIT_MAX,
      CHAT_RATE_LIMIT_WINDOW,
    );
    if (!rateLimitResult.allowed) {
      throw new HttpException(
        {
          message: 'Rate limit exceeded',
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Circuit breaker check
    const circuitBreaker = getAiCircuitBreaker('mistral', 'chat-stream');
    if (!circuitBreaker.isAllowed()) {
      throw new HttpException(
        { message: 'AI service temporarily unavailable' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 3. Get or create conversation
    const conversation =
      await this.conversationService.getOrCreateConversation(
        conversationId,
        tenantId,
        userId,
      );

    // 4. PII tokenize user message BEFORE LLM sees it
    const piiResult = this.piiDetectionService.detect(message);
    const llmMessage = piiResult.hasPii
      ? piiResult.redactedText
      : message;

    // Store PII mapping if PII detected
    if (piiResult.hasPii) {
      await this.piiResolutionService.storeMapping(
        tenantId,
        conversation.id,
        piiResult.details,
      );
    }

    // 5. Load/redact prior context before persisting the current raw turn.
    // This keeps the active model call from seeing raw PII or a duplicated user message.
    const [contextMessages, runtimeContextMeta, memories] = await Promise.all([
      this.conversationService.getMessagesForContext(conversation.id, 10, tenantId),
      this.getRuntimeContextMetadata(tenantId, userId, locale),
      this.memoryService.getRelevantMemories(
        tenantId,
        userId,
        llmMessage,
        3,
      ),
    ]);
    const messages = redactModelMessagesForModel(
      this.piiDetectionService,
      contextMessages,
    );

    // 6. Save original message to conversation after context load
    await this.conversationService.saveUserMessage(
      conversation.id,
      message, // Save original for audit/history; model sees only redacted content.
    );

    // Append current user message with runtime context (redacted for LLM)
    // Phase AI-AUDIT: Runtime context separated from system prompt (nanobot pattern)
    const runtimeContext = buildExtendedRuntimeContext(runtimeContextMeta);
    messages.push({
      role: 'user',
      content: redactTextForModel(
        this.piiDetectionService,
        `${runtimeContext}\n\n${llmMessage}`,
      ),
    });

    // 7. Audit log (fire-and-forget)
    this.auditService
      .logAudit(
        tenantId,
        userId,
        'ai_chat',
        'AiConversation',
        conversation.id,
        {
          messageLength: message.length,
          hasPii: piiResult.hasPii,
        },
      )
      .catch((err) =>
        this.logger.warn(`Audit log failed: ${err.message}`),
      );

    // 8. Build dynamic system prompt with current date/timezone + memory
    const basePrompt = buildSystemPrompt();

    const memoryBlock = redactTextForModel(
      this.piiDetectionService,
      this.memoryService.formatMemoriesForPrompt(memories),
    );

    // Compose: base prompt + memory
    let systemPromptWithMemory = basePrompt;
    if (memoryBlock) systemPromptWithMemory += '\n\n' + memoryBlock;

    // 9. Run the chat as a first-class AI SDK agent
    // Note: conversationId continuity is handled by backend auto-resolve in ConversationService
    const chatStartTime = Date.now();
    let completedStepCount = 0;
    const tools = this.createToolSet(tenantId, userId, conversation.id);
    const agent = new ToolLoopAgent({
      id: 'ai-chat',
      model: this.mistralProvider.getChatModel(model),
      instructions: systemPromptWithMemory,
      tools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(5),
      onStepFinish: async ({ text, usage, toolCalls, toolResults }) => {
        const stepIndex = completedStepCount++;

        if (text) {
          await this.conversationService
            .saveAssistantMessage(
              conversation.id,
              { type: 'text', text },
              usage?.totalTokens,
              stepIndex,
            )
            .catch((err) =>
              this.logger.warn(
                `Failed to persist step: ${err.message}`,
              ),
            );
        }

        if (toolResults?.length) {
          await this.persistToolResults(
            conversation.id,
            stepIndex,
            toolResults,
          ).catch((err) =>
            this.logger.warn(
              `Failed to persist tool results: ${err.message}`,
            ),
          );
        }

        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            this.auditService
              .logToolExecution({
                tenantId,
                userId,
                toolName: tc.toolName,
                agentName: 'ai-chat',
                inputSummary: JSON.stringify(tc.input).slice(0, 200),
                outputSummary: '(pending)',
                durationMs: 0,
                status: 'success',
              })
              .catch((err) =>
                this.logger.warn(
                  `Tool audit failed: ${err.message}`,
                ),
              );
          }
        }
      },
      onFinish: async ({ text, usage, steps }) => {
        circuitBreaker.reset();

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

        if (this.usageTrackingService && usage) {
          this.usageTrackingService
            .trackUsage(tenantId, 'ai-calls', 1)
            .catch((err) =>
              this.logger.warn(
                `Usage tracking failed: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }

        const toolCallCount = steps.reduce(
          (count, step) => count + (step.toolCalls?.length ?? 0),
          0,
        );

        this.ledgerService?.recordRun({
          tenantId,
          userId,
          runType: 'chat',
          model: model || 'mistral-small-latest',
          promptTokens: usage?.inputTokens ?? 0,
          completionTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
          latencyMs: Date.now() - chatStartTime,
          toolCallCount,
        }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

        this.maybeGenerateSmartTitle(conversation.id, tenantId).catch(
          (err) =>
            this.logger.warn(
              `Title generation failed: ${err.message}`,
            ),
        );

        this.maybeTriggerSummaryGeneration(conversation.id, tenantId).catch(
          (err) =>
            this.logger.warn(
              `Summary generation failed: ${err.message}`,
            ),
        );
      },
    });

    try {
      const result = await agent.stream({
        messages,
        abortSignal,
      });

      return result.toUIMessageStream({
        sendReasoning: false,
        onError: (error) => {
          if (
            error instanceof Error &&
            !(error instanceof CircuitBreakerOpenError)
          ) {
            this.logger.warn(
              `Stream error, recording circuit breaker failure: ${error.message}`,
            );
            circuitBreaker.recordFailure();
          }
          return error instanceof Error ? error.message : String(error);
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        !(error instanceof CircuitBreakerOpenError)
      ) {
        this.logger.warn(
          `Agent stream failed, recording circuit breaker failure: ${error.message}`,
        );
        circuitBreaker.recordFailure();
      }
      throw error;
    }
  }

  private async persistToolResults(
    conversationId: string,
    stepIndex: number,
    toolResults: StepResult<ToolSet>['toolResults'],
  ): Promise<void> {
    if (
      'saveToolMessagesBatch' in this.conversationService &&
      typeof this.conversationService.saveToolMessagesBatch === 'function'
    ) {
      await this.conversationService.saveToolMessagesBatch(
        conversationId,
        toolResults.map((toolResult) => ({
          content: this.serializeToolResult(toolResult),
          toolCallId: toolResult.toolCallId,
          stepIndex,
        })),
      );
      return;
    }

    for (const toolResult of toolResults) {
      await this.conversationService.saveToolMessage(
        conversationId,
        this.serializeToolResult(toolResult),
        toolResult.toolCallId,
        stepIndex,
      );
    }
  }

  private serializeToolResult(
    toolResult: StepResult<ToolSet>['toolResults'][number],
  ): Prisma.InputJsonValue {
    const serialized: Record<string, Prisma.InputJsonValue> = {
      type: 'tool-result',
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      input: toolResult.input as Prisma.InputJsonValue,
      output: toolResult.output as Prisma.InputJsonValue,
    };

    if ('dynamic' in toolResult && toolResult.dynamic !== undefined) {
      serialized.dynamic = toolResult.dynamic;
    }

    if (
      'providerExecuted' in toolResult &&
      toolResult.providerExecuted !== undefined
    ) {
      serialized.providerExecuted = toolResult.providerExecuted;
    }

    if ('preliminary' in toolResult && toolResult.preliminary !== undefined) {
      serialized.preliminary = toolResult.preliminary;
    }

    if ('title' in toolResult && toolResult.title !== undefined) {
      serialized.title = toolResult.title;
    }

    if (
      'providerMetadata' in toolResult &&
      toolResult.providerMetadata !== undefined
    ) {
      serialized.providerMetadata =
        toolResult.providerMetadata as Prisma.InputJsonValue;
    }

    return serialized as Prisma.InputJsonValue;
  }

  private async generateModelText(
    args: Parameters<typeof generateText>[0],
  ): ReturnType<typeof generateText> {
    return generateText(args);
  }

  /**
   * Create tool set with PII resolution via closure.
   *
   * Phase 25: Merges tools from 5 ToolsService classes.
   * Each service's getTools() receives tenantId, conversationId, and piiResolve closure.
   * Tools get PII-resolved args automatically -- no static getToolSet() export.
   */
  private createToolSet(tenantId: string, userId: string, conversationId: string) {
    const piiResolve = async (
      payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> =>
      this.piiResolutionService.resolvePayload(
        tenantId,
        conversationId,
        payload,
      );

    const toolSets = {
      ...this.emailToolsService.getTools(tenantId, conversationId, piiResolve),
      ...this.calendarToolsService.getTools(tenantId, conversationId, piiResolve),
      ...this.contactToolsService.getTools(tenantId, conversationId, piiResolve),
      ...this.folderToolsService.getTools(tenantId, conversationId, piiResolve),
      ...this.ragToolsService.getTools(tenantId, userId, conversationId, piiResolve),
      // Phase CONSOLIDATION: Productivity tools (follow-ups, labels, stars, email index)
      ...this.productivityToolsService.getTools(tenantId, userId, conversationId, piiResolve),
      // Phase REMINDER: Smart follow-up reminder tools
      ...this.reminderToolsService.getTools(tenantId, userId, conversationId, piiResolve),
      // Phase AI-AUDIT: Conversation tools (ask_user) + sandbox (run_code)
      ...this.conversationToolsService.getTools(),
      ...this.sandboxToolsService.getTools(tenantId),
    };

    // Runtime duplicate check -- fail fast if tool names collide
    const toolNames = Object.keys(toolSets);
    const uniqueNames = new Set(toolNames);
    if (toolNames.length !== uniqueNames.size) {
      const duplicates = toolNames.filter(
        (name, i) => toolNames.indexOf(name) !== i,
      );
      throw new Error(
        `Duplicate tool names detected: ${duplicates.join(', ')}`,
      );
    }

    this.logger.debug(`Tool set created: ${toolNames.length} tools`);

    return toolSets;
  }

  private async getRuntimeContextMetadata(
    tenantId: string,
    userId: string,
    requestedLocale?: string,
  ): Promise<{
    timezone?: string;
    providerType?: string;
    locale?: string;
    displayName?: string;
    jobTitle?: string;
    communicationStyle?: string;
    responseLength?: string;
    proactivityLevel?: string;
  }> {
    if (!this.prisma) {
      return {
        locale: requestedLocale,
      };
    }

    const [preferences, provider, user] = await Promise.all([
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          timezone: true,
          language: true,
          jobTitle: true,
          communicationStyle: true,
          responseLength: true,
          proactivityLevel: true,
        },
      }),
      this.prisma.providerConfig.findFirst({
        where: {
          tenantId,
          isActive: true,
          supportsEmail: true,
        },
        select: { providerType: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          name: true,
        },
      }),
    ]);

    const displayName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
      user?.name?.trim() ||
      undefined;

    return {
      timezone: preferences?.timezone ?? undefined,
      providerType: provider?.providerType ?? undefined,
      locale: requestedLocale ?? preferences?.language ?? undefined,
      displayName,
      jobTitle: preferences?.jobTitle ?? undefined,
      communicationStyle: preferences?.communicationStyle ?? undefined,
      responseLength: preferences?.responseLength ?? undefined,
      proactivityLevel: preferences?.proactivityLevel ?? undefined,
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
  private async maybeGenerateSmartTitle(
    conversationId: string,
    tenantId = 'system',
  ): Promise<void> {
    const messageCount =
      await this.conversationService.getMessageCount(conversationId, tenantId);

    // Only generate on the second exchange (4 messages)
    if (messageCount !== 4) return;

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
   * Async summary generation for long conversations.
   *
   * Triggers at 20-message intervals (20, 40, 60, ...) with a ±2 tolerance
   * window for multi-step tool call bursts. Summarizes older messages
   * (all except the last 10) and stores in AiConversation.summary.
   *
   * Fire-and-forget from onFinish callback -- failures are logged, not thrown.
   */
  private async maybeTriggerSummaryGeneration(
    conversationId: string,
    tenantId = 'system',
  ): Promise<void> {
    const messageCount =
      await this.conversationService.getMessageCount(conversationId, tenantId);

    // Only at 20-message intervals (±2 tolerance for multi-step bursts).
    // Prevents redundant LLM summary calls on every message after 20.
    if (messageCount < 20 || (messageCount - 20) % 10 !== 0) return;

    // Load older messages to summarize
    const olderMessages =
      await this.conversationService.getOlderMessages(conversationId, 10, tenantId);

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
      system:
        'Summarize the following conversation history in 2-3 concise paragraphs. ' +
        'Preserve key facts, decisions, and action items. ' +
        'Write in the same language as the conversation.',
      messages: [{ role: 'user', content: messageText }],
    });

    // Phase 35: Fire-and-forget ledger for summary generation
    this.ledgerService?.recordRun({
      tenantId,
      userId: 'system',
      runType: 'chat-summary',
      model: 'mistral-small-latest',
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
