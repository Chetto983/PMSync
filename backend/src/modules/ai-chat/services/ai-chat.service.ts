import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
} from '@nestjs/common';
import {
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
  ReminderToolsService,
} from '../tools/index';
import { EmailProductivityToolsService } from '../tools/email-productivity-tools.service';
import { FollowUpToolsService } from '../tools/follow-up-tools.service';
import { MemoryService } from './memory.service';
import { ChatEnrichmentService } from './chat-enrichment.service';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';
import {
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
    // Phase 87: Split productivity tools into focused services
    private readonly emailProductivityToolsService: EmailProductivityToolsService,
    private readonly followUpToolsService: FollowUpToolsService,
    // Phase REMINDER: Smart follow-up reminder tools
    private readonly reminderToolsService: ReminderToolsService,
    private readonly memoryService: MemoryService,
    // Phase 87: Extracted enrichment service (title, summary, runtime context)
    private readonly chatEnrichmentService: ChatEnrichmentService,
    @Optional()
    @Inject(UsageTrackingService)
    private readonly usageTrackingService?: UsageTrackingService,
    // Phase 35: AI Run Ledger telemetry
    @Optional() private readonly ledgerService?: AiRunLedgerService,
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
      this.chatEnrichmentService.getRuntimeContextMetadata(tenantId, userId, locale),
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
    // Track saved message count to avoid TOCTOU race on title/summary triggers.
    // Starts at 1 for the user message saved above.
    let savedMessageCount = 1;
    const tools = this.createToolSet(tenantId, userId, conversation.id);
    const agent = new ToolLoopAgent({
      id: 'ai-chat',
      model: this.mistralProvider.getChatModel(model),
      instructions: systemPromptWithMemory,
      tools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(5),
      prepareStep: async ({ stepNumber }) => {
        // Step 1+: always 'auto' so the model can synthesize tool results into text.
        if (stepNumber > 0) return {};

        // Step 0: force tool use for substantive requests so the model
        // gathers real data instead of hallucinating. Skip for short
        // follow-ups (e.g. "1", "yes", "ok", "grazie") that don't need tools.
        const trimmed = message.trim();
        const wordCount = trimmed.split(/\s+/).length;
        if (trimmed.length <= 30 && wordCount <= 3) return {};

        // Use 'required' to force tool call before generating text.
        // Mistral small sometimes fails validation with 'required', so
        // we use 'auto' as base but the system prompt instructs tool use.
        return { toolChoice: 'required' as const };
      },
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
            .then(() => { savedMessageCount++; })
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
          ).then(() => { savedMessageCount += toolResults.length; })
          .catch((err) =>
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
          model: this.mistralProvider.getChatModelName(model),
          promptTokens: usage?.inputTokens ?? 0,
          completionTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
          latencyMs: Date.now() - chatStartTime,
          toolCallCount,
        }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

        this.chatEnrichmentService.maybeGenerateSmartTitle(conversation.id, tenantId, savedMessageCount).catch(
          (err) =>
            this.logger.warn(
              `Title generation failed: ${err.message}`,
            ),
        );

        this.chatEnrichmentService.maybeTriggerSummaryGeneration(conversation.id, tenantId, savedMessageCount).catch(
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
    // RACE-4: All tool results persisted in a single transaction via saveToolMessagesBatch.
    await this.conversationService.saveToolMessagesBatch(
      conversationId,
      toolResults.map((toolResult) => ({
        content: this.serializeToolResult(toolResult),
        toolCallId: toolResult.toolCallId,
        stepIndex,
      })),
    );
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

  /** Create tool set with PII resolution via closure. */
  private createToolSet(tenantId: string, userId: string, conversationId: string) {
    const piiResolve = async (payload: Record<string, unknown>) =>
      this.piiResolutionService.resolvePayload(tenantId, conversationId, payload);

    const toolSets = {
      ...this.emailToolsService.getTools(tenantId, piiResolve),
      ...this.calendarToolsService.getTools(tenantId, piiResolve),
      ...this.contactToolsService.getTools(tenantId, piiResolve),
      ...this.folderToolsService.getTools(tenantId, piiResolve),
      ...this.ragToolsService.getTools(tenantId, userId, piiResolve),
      ...this.emailProductivityToolsService.getTools(tenantId),
      ...this.followUpToolsService.getTools(tenantId, userId),
      ...this.reminderToolsService.getTools(tenantId, userId),
      ...this.conversationToolsService.getTools(),
      ...this.sandboxToolsService.getTools(tenantId),
    };

    // Runtime duplicate check
    const toolNames = Object.keys(toolSets);
    if (toolNames.length !== new Set(toolNames).size) {
      const dupes = toolNames.filter((n, i) => toolNames.indexOf(n) !== i);
      throw new Error(`Duplicate tool names: ${dupes.join(', ')}`);
    }
    this.logger.debug(`Tool set created: ${toolNames.length} tools`);
    return toolSets;
  }
}
