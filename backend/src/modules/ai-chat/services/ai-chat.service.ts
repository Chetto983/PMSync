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
  InvalidPromptError,
  convertToModelMessages,
  NoSuchToolError,
  type UIMessage,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
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
import { selectFewShotExamples } from '../constants/few-shot-examples';
import { getToolDomain } from '../constants/tool-domains';
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
import { MemoryService, type MemoryResult } from './memory.service';
import { ChatEnrichmentService } from './chat-enrichment.service';
import { QueryRouterService } from './query-router.service';
import { EntityGraphService } from './entity-graph.service';
import { ContextAssemblyService } from './context-assembly.service';
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
  /** Full client UIMessages for HITL approval re-submits */
  clientMessages?: Array<Record<string, unknown>>;
  /** Pre-built model messages for non-UI approval re-submits (Telegram) */
  modelMessagesOverride?: Array<{ role: string; content: unknown }>;
}

/** Pending tool approval extracted from generateChat result */
export interface PendingToolApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/** Extended result from generateChat that may include pending approvals */
export interface GenerateChatResult {
  text: string;
  conversationId: string;
  pendingApprovals: PendingToolApproval[];
  /** Response messages to persist for re-submit (only present when approvals pending) */
  responseMessages?: Array<{ role: string; content: unknown }>;
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
    private readonly prisma: PrismaService,
    private readonly mistralProvider: OpenRouterProviderService,
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
    // Graph RAG Step 1: Query complexity router
    private readonly queryRouterService: QueryRouterService,
    // Phase 109: Graph RAG entity graph + context assembly
    @Optional() private readonly entityGraphService?: EntityGraphService,
    @Optional() private readonly contextAssemblyService?: ContextAssemblyService,
    @Optional()
    @Inject(UsageTrackingService)
    private readonly usageTrackingService?: UsageTrackingService,
    // Phase 35: AI Run Ledger telemetry
    @Optional() private readonly ledgerService?: AiRunLedgerService,
  ) {}

  /**
   * Shared preparation: rate limit, circuit breaker, conversation, PII,
   * context loading, message sanitization, system prompt, agent creation.
   * Returns everything needed for both stream and generate paths.
   */
  private async prepareChatAgent(params: StreamChatParams) {
    const { tenantId, userId, message, conversationId, model, locale } = params;

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

    const isApprovalResubmit = !!params.clientMessages?.length || !!params.modelMessagesOverride?.length;

    // Graph RAG Step 1: Classify query complexity before tool creation
    const classification = this.queryRouterService.classify(message);
    this.logger.log(
      `[QueryRouter] "${message.slice(0, 60)}" → ${classification.complexity} (${classification.confidence.toFixed(2)}) [${classification.signals.join(', ')}]`,
    );

    // Phase 108: Load HITL sensitivity preference for dynamic needsApproval
    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { hitlSensitivity: true },
    });
    const sensitivity = userPrefs?.hitlSensitivity ?? 'HIGH_ONLY';
    this.logger.log(`[HITL] sensitivity=${sensitivity} (raw=${userPrefs?.hitlSensitivity ?? 'null'}) userId=${userId}`);

    // Phase 109: Select few-shot examples based on query complexity
    const fewShotExamples = selectFewShotExamples(classification);

    let messages: { role: string; content: unknown }[];
    let systemPromptWithMemory = buildSystemPrompt(
      fewShotExamples.length > 0 ? fewShotExamples.join('\n\n') : undefined,
    );
    const tools = this.createToolSet(tenantId, userId, conversation.id, sensitivity);
    // Track assembled context token counts for ledger
    let assembledRawTokens = 0;
    let assembledContextTokens = 0;

    if (isApprovalResubmit) {
      if (params.modelMessagesOverride?.length) {
        // Telegram approval re-submit: pre-built model messages with approval responses.
        // modelMessagesOverride contains: result.response.messages (assistant message
        // with tool-call + tool-approval-request parts) + approval-response tool message.
        //
        // We do NOT load full DB history here — onStepFinish already saved the
        // assistant's tool-call to DB, so loading history would duplicate it and
        // cause an infinite HITL loop. Instead, prepend only the user's last message
        // so the provider sees a valid user-first sequence.
        this.logger.log(
          `HITL Telegram approval re-submit for conversation ${conversation.id}`,
        );
        const lastUserMsg = await this.conversationService.getLastUserMessage(
          conversation.id, tenantId,
        );
        messages = [
          { role: 'user', content: lastUserMsg ?? '' },
          ...params.modelMessagesOverride,
        ];
      } else {
        // Web HITL approval re-submit: convert client UIMessages to ModelMessages.
        // The client sends the full messages[] with approval responses embedded
        // in tool parts. convertToModelMessages() handles the conversion including
        // tool-approval-request and tool-approval-response parts.
        this.logger.log(
          `HITL approval re-submit for conversation ${conversation.id}`,
        );
        messages = await convertToModelMessages(
          params.clientMessages as unknown as UIMessage[],
          { tools },
        ) as { role: string; content: unknown }[];

        // Debug: log converted model messages structure for HITL diagnosis
        for (const msg of messages) {
          const parts = Array.isArray(msg.content) ? msg.content : [];
          const types = parts.map((p: { type?: string }) => p.type).filter(Boolean);
          if (types.length > 0) {
            this.logger.log(`[HITL-debug] role=${msg.role} parts=[${types.join(', ')}]`);
          } else {
            const preview = typeof msg.content === 'string' ? msg.content.slice(0, 80) : JSON.stringify(msg.content).slice(0, 80);
            this.logger.log(`[HITL-debug] role=${msg.role} content=${preview}`);
          }
        }
      }
    } else {
      // Normal message flow: load server-side history + PII + save message

      // 4. PII tokenize user message BEFORE LLM sees it
      const piiResult = this.piiDetectionService.detect(message);
      const llmMessage = piiResult.hasPii
        ? piiResult.redactedText
        : message;

      if (piiResult.hasPii) {
        await this.piiResolutionService.storeMapping(
          tenantId,
          conversation.id,
          piiResult.details,
        );
      }

      // 5. Load/redact prior context + memories
      const [contextMessages, runtimeContextMeta, memories] = await Promise.all([
        this.conversationService.getMessagesForContext(conversation.id, 20, tenantId),
        this.chatEnrichmentService.getRuntimeContextMetadata(tenantId, userId, locale),
        this.memoryService.getRelevantMemories(tenantId, userId, llmMessage, 5),
      ]);
      messages = redactModelMessagesForModel(
        this.piiDetectionService,
        contextMessages,
      );

      // 6. Save original message to conversation
      await this.conversationService.saveUserMessage(conversation.id, message);

      // Append current user message with runtime context (redacted)
      const runtimeContext = buildExtendedRuntimeContext(runtimeContextMeta);
      messages.push({
        role: 'user',
        content: redactTextForModel(
          this.piiDetectionService,
          `${runtimeContext}\n\n${llmMessage}`,
        ),
      });

      // Sanitize message sequence for model compatibility
      this.sanitizeMessages(messages);

      // Phase 109: Proactive graph context assembly (breadth context for system prompt)
      if (this.entityGraphService && this.contextAssemblyService) {
        try {
          const seedIds = await this.entityGraphService.findSeedNodes(tenantId, llmMessage, 5);
          const graphResults = seedIds.length > 0
            ? await this.entityGraphService.traverse(tenantId, seedIds, { maxHops: 2 })
            : [];

          // Phase 110: Extract entity IDs from graph traversal for anchored memory lookup
          const contactIds: string[] = [];
          const emailIds: string[] = [];
          for (const node of graphResults) {
            if (node.externalId) {
              if (node.nodeType === 'contact') contactIds.push(node.externalId);
              else if (node.nodeType === 'email') emailIds.push(node.externalId);
            }
          }

          // Fetch entity-anchored memories and merge with vector memories (entity-first for priority)
          const entityMemories = await this.memoryService.getMemoriesByEntities(
            tenantId, userId, contactIds, emailIds, 10,
          );
          const seenIds = new Set<string>();
          const mergedMemories: MemoryResult[] = [];
          for (const m of entityMemories) {
            if (m.id && !seenIds.has(m.id)) { seenIds.add(m.id); mergedMemories.push(m); }
          }
          for (const m of memories) {
            if (m.id && !seenIds.has(m.id)) { seenIds.add(m.id); mergedMemories.push(m); }
          }

          const assembled = this.contextAssemblyService.assemble(
            graphResults,
            mergedMemories.length > 0 ? mergedMemories : memories,
            fewShotExamples,
          );
          assembledRawTokens = assembled.rawTokenCount;
          assembledContextTokens = assembled.assembledTokenCount;

          // Inject assembled graph + memory context into system prompt
          const contextBlock = [assembled.graphContext, assembled.memoryContext]
            .filter(Boolean)
            .join('\n\n');
          if (contextBlock) {
            systemPromptWithMemory += '\n\n' + redactTextForModel(
              this.piiDetectionService,
              contextBlock,
            );
          }
        } catch (err) {
          this.logger.warn(
            `Graph context assembly failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        // Fallback: append memory context to system prompt (pre-Graph RAG behavior)
        const memoryBlock = redactTextForModel(
          this.piiDetectionService,
          this.memoryService.formatMemoriesForPrompt(memories),
        );
        if (memoryBlock) systemPromptWithMemory += '\n\n' + memoryBlock;
      }
    }


    // 7. Audit log (fire-and-forget)
    this.auditService
      .logAudit(tenantId, userId, 'ai_chat', 'AiConversation', conversation.id, {
        messageLength: message.length,
        isApprovalResubmit,
      })
      .catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));

    // 9. Create the agent
    const chatStartTime = Date.now();
    let completedStepCount = 0;
    let savedMessageCount = isApprovalResubmit ? 0 : 1;

    const toolNames = Object.keys(tools);

    const agent = new ToolLoopAgent({
      id: 'ai-chat',
      model: this.mistralProvider.getChatModel(model),
      instructions: systemPromptWithMemory,
      tools,
      toolChoice: 'auto',
      // MiniMax M2.7: low temperature for deterministic tool selection.
      // Default 1.0 is too high — causes inconsistent parameter generation.
      temperature: 0.3,
      stopWhen: stepCountIs(8),

      // Dynamic tool routing: step 0 respects query complexity (Graph RAG Step 1),
      // subsequent steps get the active domain + utility tools to reduce confusion.
      prepareStep: async ({ steps, stepNumber }) => {
        if (stepNumber === 0) {
          // Graph RAG Step 1: For simple queries, exclude heavy domains on step 0
          const excludedDomains = this.queryRouterService.getExcludedDomains(
            classification.complexity,
          );
          if (excludedDomains.length > 0) {
            const excludedSet = new Set(excludedDomains);
            const activeTools = toolNames.filter((name) => {
              const domain = getToolDomain(name);
              return !domain || !excludedSet.has(domain);
            }) as Array<keyof typeof tools>;
            return { activeTools };
          }
          return {};
        }

        const usedTools = new Set<string>();
        for (const step of steps) {
          for (const tc of step.toolCalls ?? []) {
            usedTools.add(tc.toolName);
          }
        }
        if (usedTools.size === 0) return {};

        const activeDomains = new Set<string>();
        for (const name of usedTools) {
          const domain = getToolDomain(name);
          if (domain) activeDomains.add(domain);
        }

        // Always include utility + knowledge domains
        activeDomains.add('utility');
        activeDomains.add('knowledge');

        const activeTools = toolNames.filter((name) => {
          const domain = getToolDomain(name);
          return !domain || activeDomains.has(domain);
        }) as Array<keyof typeof tools>;

        return { activeTools };
      },

      // Auto-repair malformed tool calls: re-prompt the model with the error
      // so it can fix its own JSON instead of failing the step.
      experimental_repairToolCall: async ({
        toolCall,
        tools: _availableTools,
        inputSchema,
        error,
      }) => {
        if (error instanceof NoSuchToolError) {
          return null; // can't repair a non-existent tool
        }

        const schema = await inputSchema({ toolName: toolCall.toolName });
        const repairModel = this.mistralProvider.getChatModel(model);
        const { text } = await import('ai').then((ai) =>
          ai.generateText({
            model: repairModel,
            system: `Fix this tool call JSON. The tool "${toolCall.toolName}" expects this schema: ${JSON.stringify(schema)}. Return ONLY the corrected JSON arguments, nothing else.`,
            prompt: `Tool call arguments:\n${toolCall.input}\n\nError: ${error.message}`,
          }),
        );

        try {
          return { ...toolCall, input: text };
        } catch {
          return null; // give up if repair fails
        }
      },
      onStepFinish: async ({ text, reasoning, usage, toolCalls, toolResults }) => {
        const stepIndex = completedStepCount++;

        // Build assistant message content parts.
        // CRITICAL: When tool calls exist, we MUST save them as part of the
        // assistant message so that conversation history reconstruction produces
        // valid ModelMessage[] — tool results reference toolCallIds that must
        // exist in a preceding assistant message.
        //
        // MiniMax M2.7 Interleaved Thinking: reasoning blocks are preserved
        // in history to maintain multi-turn reasoning chain coherence.
        // Resolve PII placeholders before persisting — the LLM outputs redacted
        // tokens (EMAIL_REDACTED:xxx) in its text and tool-call args. We resolve
        // them here so conversation history displayed in the frontend is clean.
        const resolvedText = text
          ? await this.piiResolutionService.resolveText(tenantId, conversation.id, text)
          : text;

        const contentParts: Prisma.InputJsonValue[] = [];
        if (reasoning?.length) {
          const reasoningText = reasoning.map((r) => r.text).join('\n');
          if (reasoningText) {
            contentParts.push({ type: 'reasoning', text: reasoningText });
          }
        }
        if (resolvedText) {
          contentParts.push({ type: 'text', text: resolvedText });
        }
        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            const resolvedInput = await this.piiResolutionService.resolvePayload(
              tenantId, conversation.id, tc.input as Record<string, unknown>,
            );
            contentParts.push({
              type: 'tool-call',
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: resolvedInput as Prisma.InputJsonValue,
            });
          }
        }

        if (contentParts.length > 0) {
          // Save as array if we have tool calls (multi-part), string-wrapped if text-only
          const content: Prisma.InputJsonValue =
            contentParts.length === 1 && !toolCalls?.length
              ? contentParts[0]
              : contentParts;

          await this.conversationService
            .saveAssistantMessage(
              conversation.id,
              content,
              usage?.totalTokens,
              stepIndex,
            )
            .then(() => { savedMessageCount++; })
            .catch((err) =>
              this.logger.warn(`Failed to persist step: ${err.message}`),
            );
        }

        if (toolResults?.length) {
          await this.persistToolResults(conversation.id, stepIndex, toolResults)
            .then(() => { savedMessageCount += toolResults.length; })
            .catch((err) =>
              this.logger.warn(`Failed to persist tool results: ${err.message}`),
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
                this.logger.warn(`Tool audit failed: ${err.message}`),
              );
          }
        }

        // Phase 108: Log HITL approval/rejection decisions
        if (toolResults?.length) {
          for (const tr of toolResults) {
            const resultObj = tr.output as Record<string, unknown> | undefined;
            if (resultObj && typeof resultObj === 'object' && 'approved' in resultObj) {
              this.auditService.logHitlDecision({
                tenantId,
                userId,
                toolName: tr.toolName,
                toolCallId: tr.toolCallId,
                decision: resultObj.approved ? 'approved' : 'rejected',
                conversationId: conversation.id,
              }).catch(() => {}); // fire-and-forget
            }
          }
        }
      },
      onFinish: async ({ text, usage, steps }) => {
        circuitBreaker.reset();

        if (!conversationId && text) {
          const title = text.slice(0, 100).replace(/\n/g, ' ').trim();
          await this.conversationService
            .updateConversationTitle(conversation.id, title || 'New conversation')
            .catch((err) => this.logger.warn(`Failed to set title: ${err.message}`));
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
          rawContextTokens: assembledRawTokens || undefined,
          assembledContextTokens: assembledContextTokens || undefined,
        }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

        this.chatEnrichmentService.maybeGenerateSmartTitle(
          conversation.id, tenantId, savedMessageCount,
        ).catch((err) => this.logger.warn(`Title generation failed: ${err.message}`));

        this.chatEnrichmentService.maybeTriggerSummaryGeneration(
          conversation.id, tenantId, savedMessageCount,
        ).catch((err) => this.logger.warn(`Summary generation failed: ${err.message}`));
      },
    });

    return { agent, messages, circuitBreaker, conversation, clientMessages: params.clientMessages };
  }

  /**
   * Stream a chat response (for web frontend via SSE).
   * Returns a UI message stream consumed by AI SDK useChat().
   */
  async streamChat(params: StreamChatParams): Promise<ReadableStream> {
    const { agent, messages, circuitBreaker, conversation, clientMessages } =
      await this.prepareChatAgent(params);

    try {
      const result = await agent.stream({
        messages: this.ensureValidMessages(messages),
        abortSignal: params.abortSignal,
      });

      const uiStream = result.toUIMessageStream({
        sendReasoning: true,
        // Pass original UIMessages so the SDK can match tool results back to
        // tool invocations during HITL approval resubmits (vercel/ai#10196).
        originalMessages: clientMessages as UIMessage[] | undefined,
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

      // Pipe through PII resolution transform so the frontend never sees
      // EMAIL_REDACTED / PHONE_REDACTED tokens in tool-call args or text.
      return this.piiResolveStream(
        uiStream,
        params.tenantId,
        conversation.id,
      );
    } catch (error) {
      // Recovery: if history causes schema validation failure, retry with only
      // user messages (drops corrupted tool/assistant parts from old format).
      if (error instanceof InvalidPromptError) {
        this.logger.warn(
          `InvalidPromptError — retrying with stripped history: ${error.message}`,
        );
        const cleanMessages = this.stripToUserMessages(messages);
        const result = await agent.stream({
          messages: cleanMessages,
          abortSignal: params.abortSignal,
        });
        return this.piiResolveStream(
          result.toUIMessageStream({ sendReasoning: true }),
          params.tenantId,
          conversation.id,
        );
      }

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

  /**
   * Generate a chat response (non-streaming, for Telegram and other non-SSE consumers).
   * Uses AI SDK native agent.generate() — no manual stream parsing needed.
   */
  async generateChat(params: StreamChatParams): Promise<GenerateChatResult> {
    const { agent, messages, circuitBreaker, conversation } =
      await this.prepareChatAgent(params);

    try {
      const result = await agent.generate({
        messages: this.ensureValidMessages(messages),
        abortSignal: params.abortSignal,
      });

      return this.buildGenerateChatResult(result, conversation.id);
    } catch (error) {
      // Recovery: if history causes schema validation failure, retry with only
      // user messages (drops corrupted tool/assistant parts from old format).
      if (error instanceof InvalidPromptError) {
        this.logger.warn(
          `InvalidPromptError — retrying with stripped history: ${error.message}`,
        );
        const cleanMessages = this.stripToUserMessages(messages);
        const result = await agent.generate({
          messages: cleanMessages,
          abortSignal: params.abortSignal,
        });
        return this.buildGenerateChatResult(result, conversation.id);
      }

      if (
        error instanceof Error &&
        !(error instanceof CircuitBreakerOpenError)
      ) {
        this.logger.warn(
          `Agent generate failed, recording circuit breaker failure: ${error.message}`,
        );
        circuitBreaker.recordFailure();
      }
      throw error;
    }
  }

  /**
   * Extract pending tool approvals from generate result content.
   * When tools have needsApproval, the SDK stops the loop and returns
   * tool-approval-request parts instead of executing the tool.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildGenerateChatResult(result: any, conversationId: string): GenerateChatResult {
    const pendingApprovals: PendingToolApproval[] = [];

    for (const part of result.content) {
      if (part.type === 'tool-approval-request') {
        const toolCall = part.toolCall as { toolName: string; toolCallId: string; input: Record<string, unknown> };
        pendingApprovals.push({
          approvalId: part.approvalId as string,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      }
    }

    if (pendingApprovals.length > 0) {
      this.logger.log(
        `generateChat: ${pendingApprovals.length} tool(s) need approval: ${pendingApprovals.map((a) => a.toolName).join(', ')}`,
      );
    }

    // When the LLM goes straight to a tool-call without generating text,
    // result.text is empty. Build a summary so the user knows what's happening.
    let text = result.text;
    if (!text?.trim() && pendingApprovals.length > 0) {
      const toolLabels: Record<string, string> = {
        send_email: 'send an email',
        reply_email: 'reply to an email',
        forward_email: 'forward an email',
        draft_email: 'create a draft',
        delete_email: 'delete an email',
        delete_contact: 'delete a contact',
        delete_event: 'delete an event',
        create_event: 'create an event',
        update_event: 'update an event',
        create_contact: 'create a contact',
        update_contact: 'update a contact',
      };
      const actions = pendingApprovals.map(
        (a) => toolLabels[a.toolName] ?? a.toolName,
      );
      text = `I'd like to ${actions.join(' and ')}. Please review the details below:`;
    }

    return {
      text,
      conversationId,
      pendingApprovals,
      responseMessages: pendingApprovals.length > 0
        ? result.response.messages as Array<{ role: string; content: unknown }>
        : undefined,
    };
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

  /**
   * Sanitize message array in-place for model compatibility.
   * Fixes issues from corrupted conversation history (failed AI responses).
   */
  private sanitizeMessages(messages: { role: string; content: unknown }[]): void {
    // 1. Drop leading tool/assistant messages (orphaned from truncated history)
    while (
      messages.length > 0 &&
      (messages[0].role === 'tool' || messages[0].role === 'assistant')
    ) {
      messages.shift();
    }

    // 2. Drop orphaned tool messages (not preceded by assistant or tool-after-assistant).
    // Multiple tool calls in one step produce consecutive tool messages — all valid.
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'tool') {
        // Walk backwards past other tool messages to find the anchor
        let anchor = i - 1;
        while (anchor >= 0 && messages[anchor].role === 'tool') {
          anchor--;
        }
        if (anchor < 0 || messages[anchor].role !== 'assistant') {
          messages.splice(i, 1);
        }
      }
    }

    // 3. Merge consecutive user messages
    for (let i = messages.length - 1; i > 0; i--) {
      if (
        messages[i].role === 'user' &&
        messages[i - 1].role === 'user' &&
        typeof messages[i].content === 'string' &&
        typeof messages[i - 1].content === 'string'
      ) {
        messages[i - 1].content =
          (messages[i - 1].content as string) + '\n' + (messages[i].content as string);
        messages.splice(i, 1);
      }
    }
  }

  /**
   * Ensure message array has valid ModelMessage[] structure.
   * Validates assistant messages with array content contain proper tool-call parts,
   * and that tool messages reference existing tool-call IDs.
   */
  private ensureValidMessages(messages: { role: string; content: unknown }[]): ModelMessage[] {
    const knownToolCallIds = new Set<string>();

    // Pass 1: collect valid toolCallIds from assistant messages, fix broken ones
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // Keep valid ModelMessage content parts: 'text', 'tool-call', and
        // HITL approval parts ('tool-approval-request'). Non-model parts
        // like 'reasoning' cause InvalidPromptError and are stripped.
        const validParts = (msg.content).filter((part) => {
          if (!part || typeof part !== 'object' || !('type' in part)) return false;
          if (part.type === 'tool-call') {
            if (!part.toolCallId || !part.toolName) return false;
            knownToolCallIds.add(part.toolCallId);
            return true;
          }
          // Preserve HITL approval-request parts — required by collectToolApprovals
          if (part.type === 'tool-approval-request') return true;
          return part.type === 'text';
        });
        if (validParts.length === 0) {
          // Degenerate array — convert to empty text
          msg.content = '';
        } else if (validParts.length !== (msg.content).length) {
          msg.content = validParts;
        }
      }
    }

    // Pass 2: drop tool messages referencing unknown toolCallIds,
    // collect answered toolCallIds, and normalize output format.
    // Also preserve HITL tool-approval-response messages.
    const answeredToolCallIds = new Set<string>();
    const filtered = messages.filter((msg) => {
      if (msg.role !== 'tool') return true;
      if (!Array.isArray(msg.content) || (msg.content).length === 0) return false;

      // HITL: preserve tool messages containing approval responses.
      // These have type 'tool-approval-response' with approvalId (not toolCallId).
      const hasApprovalResponse = (msg.content as any[]).some(
        (p) => p?.type === 'tool-approval-response',
      );
      if (hasApprovalResponse) return true;

      const part = (msg.content)[0] as any;
      const toolCallId = part?.toolCallId;
      if (typeof toolCallId !== 'string' || !knownToolCallIds.has(toolCallId)) return false;
      answeredToolCallIds.add(toolCallId);
      // Normalize tool-result output to AI SDK v6 typed format
      if (part?.type === 'tool-result' && part.output != null) {
        if (!part.output?.type || !('value' in (part.output ?? {}))) {
          part.output = typeof part.output === 'string'
            ? { type: 'text', value: part.output }
            : { type: 'json', value: part.output ?? {} };
        }
      }
      return true;
    });

    // Pass 3: strip tool-call parts from assistant messages when the
    // corresponding tool-result is missing (AI_MissingToolResultsError fix).
    // HITL exception: tool-calls awaiting approval have no tool-result yet —
    // they are answered by tool-approval-response, not tool-result.
    const hasAnyApprovalResponse = filtered.some(
      (msg) => msg.role === 'tool' && Array.isArray(msg.content)
        && (msg.content as any[]).some((p) => p?.type === 'tool-approval-response'),
    );
    for (const msg of filtered) {
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
      const hasOrphanedToolCall = (msg.content as any[]).some(
        (p) => p?.type === 'tool-call' && !answeredToolCallIds.has(p.toolCallId),
      );
      if (!hasOrphanedToolCall) continue;
      // If there are approval responses, keep tool-calls that have matching
      // approval-request parts (they're awaiting HITL execution, not orphaned).
      if (hasAnyApprovalResponse) continue;
      const cleaned = (msg.content as any[]).filter(
        (p) => p?.type !== 'tool-call' || answeredToolCallIds.has(p.toolCallId),
      );
      msg.content = cleaned.length > 0 ? cleaned : '';
    }

    return filtered as ModelMessage[];
  }

  /**
   * Last-resort fallback: keep only user text messages + the current user message (last).
   * Used when history is too corrupted for ensureValidMessages to fix.
   */
  private stripToUserMessages(messages: { role: string; content: unknown }[]): ModelMessage[] {
    const userMessages = messages.filter(
      (m) => m.role === 'user' && typeof m.content === 'string',
    );
    // Keep at most the last 3 user messages for context
    return userMessages.slice(-3) as ModelMessage[];
  }

  /**
   * Wrap a UI message stream to resolve PII placeholders before reaching the client.
   * The stream contains typed UIMessageChunk objects (not raw text). PII tokens
   * appear in tool-input-available.input, text-delta.delta, and reasoning-delta.delta.
   */
  private piiResolveStream(
    stream: ReadableStream,
    tenantId: string,
    conversationId: string,
  ): ReadableStream {
    const piiService = this.piiResolutionService;
    const PII_TOKEN = /_REDACTED:[a-f0-9]+/;

    const resolveStr = (s: string) =>
      piiService.resolveText(tenantId, conversationId, s);

    const resolveObj = (obj: Record<string, unknown>) =>
      piiService.resolvePayload(tenantId, conversationId, obj);

    const transform = new TransformStream({
      async transform(chunk: Record<string, unknown>, controller) {
        if (!chunk || typeof chunk !== 'object') {
          controller.enqueue(chunk);
          return;
        }

        const type = chunk.type as string;

        // Resolve PII in tool-call input (tool-input-available)
        if (type === 'tool-input-available' && chunk.input) {
          const inputStr = JSON.stringify(chunk.input);
          if (PII_TOKEN.test(inputStr)) {
            chunk = { ...chunk, input: await resolveObj(chunk.input as Record<string, unknown>) };
          }
        }

        // Resolve PII in text deltas
        if ((type === 'text-delta' || type === 'reasoning-delta') && typeof chunk.delta === 'string') {
          if (PII_TOKEN.test(chunk.delta)) {
            chunk = { ...chunk, delta: await resolveStr(chunk.delta) };
          }
        }

        controller.enqueue(chunk);
      },
    });

    return stream.pipeThrough(transform);
  }

  /** Create tool set with PII resolution via closure. */
  private createToolSet(tenantId: string, userId: string, conversationId: string, sensitivity: string) {
    const piiResolve = async (payload: Record<string, unknown>) =>
      this.piiResolutionService.resolvePayload(tenantId, conversationId, payload);

    const toolSets = {
      ...this.emailToolsService.getTools(tenantId, piiResolve, sensitivity),
      ...this.calendarToolsService.getTools(tenantId, piiResolve, sensitivity),
      ...this.contactToolsService.getTools(tenantId, piiResolve, sensitivity),
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
