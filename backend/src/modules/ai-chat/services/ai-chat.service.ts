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
  ReminderToolsService,
} from '../tools/index';
import { IntentRouterService } from '../tools/intent-router.service';
import { SkillsLoaderService } from '../skills/skills-loader.service';
import { MemoryService } from './memory.service';
import type { PrimaryIntent } from '../../ai/nlp/intent-taxonomy';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';

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
 * Intents that must ground themselves via at least one tool call on step 0.
 * This prevents generic "I cannot access your inbox" style answers for
 * queries that clearly require live workspace data.
 */
const TOOL_REQUIRED_INTENTS = new Set<PrimaryIntent>([
  'email_search',
  'email_read',
  'email_summarize',
  'email_triage',
  'follow_up_manage',
  'calendar_view',
  'contact_search',
  'folder_list',
  'status_check',
  'data_analysis',
]);

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
    // Phase 25 Plan 02: Intent routing + memory injection
    private readonly intentRouterService: IntentRouterService,
    // Phase SKILLS: Contextual skill loading based on intent
    private readonly skillsLoaderService: SkillsLoaderService,
    private readonly memoryService: MemoryService,
    // Phase 32: Tool discovery via registry (domain modules self-register)
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
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
    const runtimeContextMeta = await this.getRuntimeContextMetadata(
      tenantId,
      userId,
      locale,
    );
    const runtimeContext = buildRuntimeContext(
      runtimeContextMeta.timezone,
      runtimeContextMeta.providerType,
      runtimeContextMeta.locale,
    );
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

    // 8. Build dynamic system prompt with current date/timezone + memory + skills injection
    const basePrompt = buildSystemPrompt();

    // Phase SKILLS: Classify intent early so we can inject relevant skill docs
    const intentResult = await this.intentRouterService.classifyAndRoute(message);
    const skillBlock = this.skillsLoaderService.getSkillsForIntent(intentResult.intent);

    const memories = await this.memoryService.getRelevantMemories(
      tenantId,
      userId,
      message,
      3,
    );
    const memoryBlock = this.memoryService.formatMemoriesForPrompt(memories);

    // Compose: base prompt + skills + memory
    let systemPromptWithMemory = basePrompt;
    if (skillBlock) systemPromptWithMemory += skillBlock;
    if (memoryBlock) systemPromptWithMemory += '\n\n' + memoryBlock;

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
              const activeTools = intentResult.activeTools.filter((toolName) =>
                allToolNames.includes(toolName),
              );

              // Step 0: reuse intent classified above (already done for skill injection)
              this.logger.debug(
                `Intent: ${intentResult.intent} (${intentResult.confidence.toFixed(2)}), tools: ${activeTools.join(', ')}`,
              );
              return {
                activeTools: activeTools as (keyof typeof tools)[],
                toolChoice:
                  activeTools.length > 0 &&
                  TOOL_REQUIRED_INTENTS.has(intentResult.intent)
                    ? 'required'
                    : undefined,
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

            // Phase 77: HITL via ActionQueue removed -- AI SDK handles approval natively
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

            // Generate smart title after second response (4 messages: u1+a1+u2+a2)
            this.maybeGenerateSmartTitle(conversation.id, tenantId).catch(
              (err) =>
                this.logger.warn(
                  `Title generation failed: ${err.message}`,
                ),
            );

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
  }> {
    if (!this.prisma) {
      return {
        locale: requestedLocale,
      };
    }

    const [preferences, provider] = await Promise.all([
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { timezone: true, language: true },
      }),
      this.prisma.providerConfig.findFirst({
        where: {
          tenantId,
          isActive: true,
          supportsEmail: true,
        },
        select: { providerType: true },
      }),
    ]);

    return {
      timezone: preferences?.timezone ?? undefined,
      providerType: provider?.providerType ?? undefined,
      locale: requestedLocale ?? preferences?.language ?? undefined,
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
      await this.conversationService.getMessageCount(conversationId);

    // Only generate on the second exchange (4 messages)
    if (messageCount !== 4) return;

    const messages = await this.conversationService.getRecentMessages(
      conversationId,
      4,
    );

    if (messages.length < 4) return;

    const messageText = messages
      .map((m) => {
        const content = m.content as Record<string, unknown>;
        const text =
          typeof content === 'string'
            ? content
            : (content as { text?: string })?.text ?? JSON.stringify(content);
        return `${m.role}: ${text.slice(0, 200)}`;
      })
      .join('\n');

    const { text: title } = await generateText({
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
