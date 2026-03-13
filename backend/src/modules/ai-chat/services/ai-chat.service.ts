import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
} from '@nestjs/common';
import {
  streamText,
  generateText,
  createUIMessageStream,
  stepCountIs,
} from 'ai';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { ConversationService } from './conversation.service';
import { HitlService } from './hitl.service';
import { PiiDetectionService } from '../../ai/guards/pii-detection-sentinel.service';
import { PiiResolutionService } from '../../ai/guards/pii-resolution.service';
import { AuditService } from '../../../common/services/audit.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import {
  getAiCircuitBreaker,
  CircuitBreakerOpenError,
} from '../../ai/utils/index';
import { buildSystemPrompt, buildRuntimeContext } from '../constants/system-prompt';
import {
  EmailToolsService,
  CalendarToolsService,
  ContactToolsService,
  FolderToolsService,
  RagToolsService,
  ConversationToolsService,
  SandboxToolsService,
  ProductivityToolsService,
} from '../tools/index';
import { IntentRouterService } from '../tools/intent-router.service';
import { MemoryService } from './memory.service';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';

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

/** Rate limit: 30 requests per 60 seconds per user */
const CHAT_RATE_LIMIT_MAX = 30;
const CHAT_RATE_LIMIT_WINDOW = 60;

/**
 * AiChatService -- Core chat orchestration with AI SDK v6.
 *
 * Pipeline: rate limit -> circuit breaker -> PII tokenize -> streamText
 * Phase 25: 20 tools via 5 ToolsService classes, intent routing, memory injection
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly conversationService: ConversationService,
    private readonly hitlService: HitlService,
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
    // Phase 25 Plan 02: Intent routing + memory injection
    private readonly intentRouterService: IntentRouterService,
    private readonly memoryService: MemoryService,
    // Phase 32: Tool discovery via registry (domain modules self-register)
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
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
   * 5. Save original message, send redacted to LLM
   * 6. Load conversation history
   * 7. Create UI message stream wrapping streamText
   * 8. Audit log + usage tracking
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

    // 5. Save original message to conversation, send redacted to LLM
    await this.conversationService.saveUserMessage(
      conversation.id,
      message, // Save original
    );

    // 6. Load conversation history (last 10 messages + summary)
    const messages = await this.conversationService.getMessagesForContext(
      conversation.id,
    );

    // Append current user message with runtime context (redacted for LLM)
    // Phase AI-AUDIT: Runtime context separated from system prompt (nanobot pattern)
    const runtimeContext = buildRuntimeContext();
    messages.push({ role: 'user', content: `${runtimeContext}\n\n${llmMessage}` });

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

    // 8. Build dynamic system prompt with current date/timezone + memory injection
    const basePrompt = buildSystemPrompt(); // Injects current date/time
    const memories = await this.memoryService.getRelevantMemories(
      tenantId,
      userId,
      message,
      3,
    );
    const memoryBlock = this.memoryService.formatMemoriesForPrompt(memories);
    const systemPromptWithMemory = memoryBlock
      ? basePrompt + '\n\n' + memoryBlock
      : basePrompt;

    // 9. Create UI message stream
    // Note: conversationId continuity is handled by backend auto-resolve in ConversationService
    const chatStartTime = Date.now();
    return createUIMessageStream({
      execute: async ({ writer }) => {
        const tools = this.createToolSet(tenantId, userId, conversation.id);
        const allToolNames = Object.keys(tools);

        const result = streamText({
          model: this.mistralProvider.getChatModel(model),
          system: systemPromptWithMemory,
          messages,
          tools,
          // Phase 25 Plan 02: Intent-based tool routing via prepareStep
          // Type assertion needed: activeTools is string[] from IntentRouterService,
          // but AI SDK expects exact tool name literals. Safe because all names
          // come from INTENT_TOOL_MAP which mirrors createToolSet() keys.
          prepareStep: async ({ stepNumber, steps }) => {
            if (stepNumber === 0) {
              // Step 0: classify intent, serve only relevant tools
              const classification =
                await this.intentRouterService.classifyAndRoute(message);
              this.logger.debug(
                `Intent: ${classification.intent} (${classification.confidence.toFixed(2)}), tools: ${classification.activeTools.join(', ')}`,
              );
              return {
                activeTools:
                  classification.activeTools as (keyof typeof tools)[],
              };
            }
            // Subsequent steps: expand based on what tools were just called
            const lastStep = steps[steps.length - 1];
            const lastToolCalls = lastStep?.toolCalls ?? [];
            const expanded = this.intentRouterService.expandForFollowUp(
              lastToolCalls,
              allToolNames,
            );
            return {
              activeTools: expanded as (keyof typeof tools)[],
            };
          },
          stopWhen: stepCountIs(5),
          abortSignal,
          onStepFinish: async ({ text, usage, toolCalls, content }) => {
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

            // Audit tool calls (fire-and-forget)
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

            // HITL: Detect tool-approval-request in content
            if (content?.length) {
              for (const part of content) {
                if (part.type === 'tool-approval-request') {
                  const tc = part.toolCall;
                  try {
                    const pendingAction =
                      await this.hitlService.createPendingAction({
                        tenantId,
                        userId,
                        conversationId: conversation.id,
                        actionType: this.mapToolToActionType(tc.toolName),
                        actionPayload: tc.input as Record<string, unknown>,
                        confidence: 0.8,
                        reasoning: `Tool ${tc.toolName} requires approval before execution`,
                      });

                    // Emit needs-approval chunk with ActionQueue details
                    // Using type assertion since UIMessageChunk doesn't include custom data types by default
                    (writer as any).write({
                      type: 'data-needs-approval',
                      data: {
                        actionId: pendingAction.id,
                        actionType: pendingAction.actionType,
                        actionPayload: pendingAction.actionPayload,
                        confidence: pendingAction.confidence,
                        reasoning: pendingAction.reasoning,
                        expiresAt: pendingAction.expiresAt,
                        toolCallId: tc.toolCallId,
                      },
                    });
                  } catch (err) {
                    this.logger.error(
                      `Failed to create HITL action: ${err instanceof Error ? err.message : String(err)}`,
                    );
                  }
                }
              }
            }
          },
          onFinish: async ({ text, usage }) => {
            // Circuit breaker: record success
            circuitBreaker.reset(); // Reset failures on success

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

            // Usage tracking (fire-and-forget)
            if (this.usageTrackingService && usage) {
              this.usageTrackingService
                .trackUsage(tenantId, 'ai-calls', 1)
                .catch((err) =>
                  this.logger.warn(
                    `Usage tracking failed: ${err instanceof Error ? err.message : String(err)}`,
                  ),
                );
            }

            // Phase 35: Fire-and-forget ledger write
            this.ledgerService?.recordRun({
              tenantId,
              userId,
              runType: 'chat',
              model: model || 'mistral-small-latest',
              promptTokens: usage?.inputTokens ?? 0,
              completionTokens: usage?.outputTokens ?? 0,
              totalTokens: usage?.totalTokens ?? 0,
              latencyMs: Date.now() - chatStartTime,
              toolCallCount: 0,
            }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

            // Check if summary generation is needed (> 20 messages)
            this.maybeTriggerSummaryGeneration(conversation.id, tenantId).catch(
              (err) =>
                this.logger.warn(
                  `Summary generation failed: ${err.message}`,
                ),
            );
          },
          onError: (error) => {
            // Circuit breaker: record failure so the breaker can open on repeated errors
            if (
              error instanceof Error &&
              !(error instanceof CircuitBreakerOpenError)
            ) {
              this.logger.warn(
                `Stream error, recording circuit breaker failure: ${error.message}`,
              );
              circuitBreaker.recordFailure();
            }
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
      // Phase AI-AUDIT: Conversation tools (ask_user) + sandbox (run_code)
      ...this.conversationToolsService.getTools(),
      ...this.sandboxToolsService.getTools(),
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

  /**
   * Map tool name to ActionType enum for ActionQueue.
   *
   * Phase 25: Complete mapping for all HITL-enabled tools.
   */
  private mapToolToActionType(toolName: string): string {
    const mapping: Record<string, string> = {
      send_email: 'SEND_EMAIL',
      reply_email: 'REPLY_EMAIL',
      forward_email: 'FORWARD_EMAIL',
      delete_email: 'DELETE_EMAIL',
      delete_event: 'DELETE_EMAIL', // Destructive calendar action — no DELETE_EVENT enum yet
    };
    const actionType = mapping[toolName];
    if (!actionType) {
      this.logger.warn(`No ActionType mapping for tool "${toolName}", using CREATE_TASK`);
      return 'CREATE_TASK';
    }
    return actionType;
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
    tenantId = 'system',
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

    const summaryStart = Date.now();
    const { text: summary, usage } = await generateText({
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
