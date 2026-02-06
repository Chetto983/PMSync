/**
 * VoltAgent Service
 *
 * NestJS facade for VoltAgent functionality.
 * Coordinates specialized services for chat, approval workflows, and metrics.
 * Implements tenant isolation via userId namespacing.
 *
 * Core responsibilities:
 * - chat() / streamChat(): Message processing with agent coordination
 * - Approval workflow delegation (HITL)
 * - Conversation management delegation
 * - Real-time event emission
 *
 * NOTE: Most functionality has been extracted to specialized services:
 * - ChatRequestProcessorService: Input validation, PII, rate limiting
 * - ChatContextBuilderService: Memory and context enrichment
 * - ChatResponseProcessorService: Output processing, HITL extraction
 * - AgentPoolService: Agent creation and caching
 * - AgentMetricsService: Observability and metrics
 * - ApprovalWorkflowService: HITL workflow management
 * - ConversationManagementService: Chat session CRUD
 */
import { Inject, Injectable, OnModuleInit, OnModuleDestroy, Optional, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Memory } from '@voltagent/core';
import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { CacheService } from '../../../common/services/cache.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
// NOTE: CorrelationContext and Agent type moved to ChatPrepareService (2026-01-27)
// NOTE: PrismaService removed - now used only by ChatPrepareService (2026-01-27)
import { HitlService } from './services/hitl.service';
// ModelRouterService removed - VoltAgent 2.x handles model routing natively
// Phase 3: Consolidated agents (10 → 3) - now handled by AgentPoolService
// NOTE: UserContext, ConnectedProvider moved to ChatPrepareService (2026-01-27)
import { AiQueueService } from './services/ai-queue.service';
import { AiError, AiErrorCode } from '../errors';
import { ActionSeverity } from './interfaces/agent-action.interface';
import { getTranslations, getErrorTranslations, type SupportedLocale } from './locales';
import { PiiResolutionService, type PiiMapping } from '../guards';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import type { AiAgentType } from '../../realtime/types/realtime.types';
import { createObservabilityHooks, type AgentMetrics, type DisposableHooks } from './observability';
import { type MistralModel } from './providers/mistral.provider';
import { ConversationManagementService } from './services/conversation-management.service';
import {
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from './workflows';
import { ApprovalWorkflowService, type SuspendedWorkflow as ApprovalSuspendedWorkflow } from './services/approval-workflow.service';
import { MemoryIntelligenceService } from './services/memory-intelligence.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { ChatResponseProcessorService, applyPiiMappings } from './services/chat-response-processor.service';
import { ChatRequestProcessorService } from './services/chat-request-processor.service';
import { ChatContextBuilderService, sanitizeLlmResponse, needsMemoryContext } from './services/chat-context-builder.service';
import { AgentMetricsService } from './services/agent-metrics.service';
import { AgentPoolService } from './services/agent-pool.service';
import { ChatPrepareService } from './services/chat-prepare.service';
import { MistralService } from '../services/mistral.service';

/**
 * Streaming-safe sanitizer - ZERO BUFFERING.
 * Applies sanitization immediately to each chunk.
 *
 * Design rationale:
 * - Internal markers ([Conversation History], etc.) only appear at start of LLM response
 * - They're never split across chunks (LLM outputs complete tokens)
 * - User markdown like [link] or **bold** must pass through intact
 * - CRITICAL: AI SDK requires text-delta events BEFORE text-end/finish
 */
function createStreamSanitizer(mappings: PiiMapping[]): {
  handleChunk: (chunk: string) => string;
  flush: () => string;
} {
  // Patterns that indicate leaked internal context
  const INTERNAL_PATTERNS = [
    /\[Conversation History\]/gi,
    /\[Current Message\]/gi,
    /\[Key Context\]/gi,
    /\[Recent Messages\]/gi,
    /\[User Memory\]/gi,
    /\[Conversation Summary[^\]]*\]/gi,
    /##\s*Learned Constraints[^\n]*/gi,
  ];

  return {
    handleChunk: (chunk: string) => {
      let text = chunk;

      // Apply internal pattern removal (immediate, no buffering)
      for (const pattern of INTERNAL_PATTERNS) {
        text = text.replace(pattern, '');
      }

      // Apply PII mappings (immediate, no buffering)
      text = applyPiiMappings(text, mappings);

      return text;
    },
    flush: () => '', // Nothing to flush - no buffering!
  };
}

export interface ChatOptions {
  userId: string;
  conversationId?: string;
  tenantId: string;
  locale?: string;
  model?: MistralModel;
  /** Skip semantic cache lookup */
  skipCache?: boolean;
  /** Prefer faster response (may use smaller model) */
  preferSpeed?: boolean;
  /** Prefer higher quality (may use larger model) */
  preferQuality?: boolean;
}

export interface ChatResult {
  text: string;
  requiresApproval?: boolean;
  pendingActions?: PendingAction[];
  /** Model used for generation */
  model?: MistralModel;
  /** Response was served from semantic cache */
  fromCache?: boolean;
  /** Cache similarity score if from cache */
  cacheSimilarity?: number;
  /** Conversation ID for session persistence */
  conversationId?: string;
}

export interface PendingAction {
  id: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
  summary: string;
}

/**
 * Re-export SuspendedWorkflow from ApprovalWorkflowService for API compatibility.
 * Other modules may import this type from voltagent.service.ts.
 */
export type SuspendedWorkflow = ApprovalSuspendedWorkflow;

@Injectable()
export class VoltAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoltAgentService.name);
  private memory: Memory | null = null;
  private observabilityHooks: DisposableHooks | null = null;

  constructor(
    private readonly configService: ConfigService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
    @Optional() @Inject(HitlService) private readonly hitlService?: HitlService,
    @Optional() @Inject(AiQueueService) private readonly aiQueueService?: AiQueueService,
    @Optional() @Inject(PiiResolutionService) private readonly piiResolutionService?: PiiResolutionService,
    @Optional() @Inject(RealtimeEventsService) private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional() @Inject(ConversationManagementService) private readonly conversationService?: ConversationManagementService,
    @Optional() @Inject(MemoryIntelligenceService) private readonly memoryIntelligenceService?: MemoryIntelligenceService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
    @Optional() @Inject(ChatResponseProcessorService) private readonly chatResponseProcessor?: ChatResponseProcessorService,
    @Optional() @Inject(ChatRequestProcessorService) private readonly chatRequestProcessor?: ChatRequestProcessorService,
    @Optional() @Inject(ChatContextBuilderService) private readonly chatContextBuilder?: ChatContextBuilderService,
    @Optional() @Inject(AgentMetricsService) private readonly agentMetricsService?: AgentMetricsService,
    @Optional() @Inject(ApprovalWorkflowService) private readonly approvalWorkflowService?: ApprovalWorkflowService,
    @Optional() @Inject(AgentPoolService) private readonly agentPoolService?: AgentPoolService,
    @Optional() @Inject(ChatPrepareService) private readonly chatPrepareService?: ChatPrepareService,
    @Optional() @Inject(RedisLockService) private readonly redisLockService?: RedisLockService,
    @Optional() @Inject(MistralService) private readonly mistralService?: MistralService,
  ) {
    this.logger.log(`[INIT] VoltAgentService: cache=${!!this.cacheService}, hitl=${!!this.hitlService}, memory=${!!this.memoryIntelligenceService}, lock=${!!this.redisLockService}`);
  }

  async onModuleInit() {
    // Initialize VoltAgent PostgreSQL memory for scalable multi-tenant storage
    // Uses DATABASE_URL from environment for connection
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (databaseUrl) {
      // FIX Bug #1: Retry memory initialization up to 3 times with exponential backoff
      const MAX_RETRIES = 3;
      const BASE_DELAY_MS = 1000;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const storage = new PostgreSQLMemoryAdapter({
            connection: databaseUrl,
            tablePrefix: 'voltagent_memory',
            schema: 'public',
            debug: process.env.NODE_ENV !== 'production',
          });
          this.memory = new Memory({ storage });
          this.logger.log('VoltAgent PostgreSQL memory initialized for tenant isolation');
          break; // Success, exit retry loop
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const isLastAttempt = attempt >= MAX_RETRIES;

          if (isLastAttempt) {
            // CRITICAL: Memory failed after all retries - agents will lose context
            this.logger.error('CRITICAL: VoltAgent memory initialization FAILED after all retries', {
              error: errorMsg,
              attempts: attempt,
              consequence: 'Agents will operate in stateless mode - no conversation history',
            });
            this.memory = null;
          } else {
            // Retry with exponential backoff
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            this.logger.warn(`VoltAgent memory init failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`, {
              error: errorMsg,
            });
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    } else {
      this.logger.warn('DATABASE_URL not configured, VoltAgent memory disabled');
      this.memory = null;
    }

    // Initialize observability hooks with NestJS logger adapter
    // CRITICAL: onPendingAction captures HITL actions from sub-agent tools
    // that would otherwise be lost during delegate_task execution
    this.observabilityHooks = createObservabilityHooks({
      logger: {
        info: (msg, ctx) => this.logger.log(msg, ctx),
        warn: (msg, ctx) => this.logger.warn(msg, ctx),
        error: (msg, ctx) => this.logger.error(msg, ctx),
        debug: (msg, ctx) => this.logger.debug(msg, ctx),
      },
      logToolCalls: process.env.NODE_ENV !== 'production',
      trackUsage: true,
      // Delegate metrics collection to AgentMetricsService (extracted 2026-01-22)
      onMetrics: (metrics) => this.agentMetricsService?.collectMetrics(metrics),
      // VOLT-04: Record tool execution metrics to Prometheus (2026-02-06)
      onToolMetrics: (toolMetrics) => {
        this.agentMetricsService?.recordToolDuration(
          toolMetrics.toolName,
          toolMetrics.status,
          toolMetrics.durationSeconds,
        );
      },
      // Capture HITL pending actions from tool results (including sub-agents)
      onPendingAction: async (action) => {
        if (!this.hitlService) {
          this.logger.warn('HITL pending action captured but hitlService not available', {
            actionType: action.actionType,
            agentName: action.agentName,
          });
          return;
        }

        await this.hitlService.createPendingAction({
          tenantId: action.tenantId,
          userId: action.userId || 'unknown',
          sessionId: action.sessionId,
          agentName: action.agentName,
          action: {
            type: action.actionType as import('./interfaces/agent-action.interface').AgentActionType,
            payload: action.payload,
            confidence: action.confidence ?? 0.8,
            severity: action.severity as ActionSeverity,
            reasoningSteps: action.summary,
          },
        });

        this.logger.log(`HITL pending action created via hook: ${action.actionType} from ${action.agentName}`);
      },
    });

    // ApprovalWorkflowService is now injected and self-initializes via OnModuleInit

    // NOTE: Metrics flush interval is now handled by AgentMetricsService (extracted 2026-01-22)

    this.logger.log('VoltAgent service initialized (metrics delegated to AgentMetricsService)');
  }

  private async resolveUserVisibleText(
    tenantId: string,
    sessionId: string,
    text: string,
  ): Promise<string> {
    if (!this.piiResolutionService || !text) {
      return text;
    }

    if (!this.piiResolutionService.containsPlaceholders(text)) {
      return text;
    }

    return this.piiResolutionService.resolveText(tenantId, sessionId, text);
  }

  /**
   * Get recent agent metrics for monitoring.
   * Delegates to AgentMetricsService (extracted 2026-01-22).
   */
  async getRecentMetrics(agentName?: string, limit = 100): Promise<AgentMetrics[]> {
    return this.agentMetricsService?.getRecentMetrics(agentName, limit) ?? [];
  }

  /**
   * Get aggregated metrics stats per tenant.
   * Delegates to AgentMetricsService (extracted 2026-01-22).
   */
  async getMetricsStats(agentName = 'SupervisorAgent'): Promise<{
    totalOperations: number;
    avgDuration: number;
    successRate: number;
    totalTokens: number;
  }> {
    return this.agentMetricsService?.getMetricsStats(agentName) ?? {
      totalOperations: 0,
      avgDuration: 0,
      successRate: 0,
      totalTokens: 0,
    };
  }

  async onModuleDestroy() {
    // NOTE: Metrics flush is now handled by AgentMetricsService lifecycle (extracted 2026-01-22)

    // Cleanup observability hooks to prevent interval memory leaks during hot reload
    if (this.observabilityHooks) {
      this.observabilityHooks.cleanup();
      this.observabilityHooks = null;
    }

    // Cleanup agents on shutdown (delegated to AgentPoolService)
    // Fire-and-forget cleanup - no need to await on shutdown
    void this.agentPoolService?.clearAgentCache();
  }


  // NOTE: getUserContext() moved to ChatPrepareService (2026-01-27)

  /**
   * Emit agent step event via WebSocket for real-time UI feedback.
   * Used to show live agent progress in the frontend.
   */
  private emitAgentStep(
    tenantId: string,
    sessionId: string,
    userId: string,
    agentType: AiAgentType,
    status: 'started' | 'processing' | 'tool_call' | 'completed' | 'error' | 'pending',
    action: string,
    options?: {
      toolName?: string;
      duration?: number;
      result?: string;
      error?: string;
      // Ask-user clarification fields
      question?: string;
      header?: string;
      options?: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    },
  ): void {
    if (!this.realtimeEventsService) return;

    const stepId = `${agentType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.realtimeEventsService.emitAiAgentStep(tenantId, {
      sessionId,
      userId,
      stepId,
      agentType,
      status,
      action,
      toolName: options?.toolName,
      duration: options?.duration,
      result: options?.result,
      error: options?.error,
      timestamp: new Date().toISOString(),
      // Include ask-user data if present
      ...(options?.question && {
        askUser: {
          question: options.question,
          header: options.header || 'Question',
          options: options.options || [],
          multiSelect: options.multiSelect || false,
        },
      }),
    });
  }

  /**
   * Process a chat message using the supervisor agent.
   * Uses tenant-isolated userId for memory operations.
   * Persists pending actions to database via HitlService.
   *
   * Performance Optimizations:
   * - Semantic caching: Returns cached response if similar query exists
   * - Model routing: Selects optimal model based on task complexity
   *
   * VOLT-04: Prometheus metrics instrumentation (2026-02-06)
   * - Records chat duration via ai_chat_response_duration_seconds histogram
   * - Records errors via ai_errors_total counter
   * - Records token usage via ai_tokens_total counter
   */
  async chat(message: string, options: ChatOptions): Promise<ChatResult> {
    const startTime = Date.now();
    // PERF: Timing instrumentation for performance debugging
    const timings: Record<string, number> = {};

    // VOLT-04: Start Prometheus timer for chat duration
    // Note: intent defaults to 'unknown' until ChatPrepareService detects it
    // Use imported MetricTimer type instead of typeof with optional chain
    let prometheusTimer: import('./services/agent-metrics.service').MetricTimer | undefined;
    const detectedIntent = 'unknown';
    let detectedModel = options.model || 'unknown';
    let detectedAgent = 'Supervisor';

    // Use ChatPrepareService for consolidated setup (refactored 2026-01-27)
    if (!this.chatPrepareService) {
      throw new AiError('ChatPrepareService not available', AiErrorCode.INTERNAL_ERROR, { retryable: false });
    }

    let ctx;
    const prepareStart = Date.now();
    try {
      ctx = await this.chatPrepareService.prepare(message, options, this.memory, this.observabilityHooks);
      timings['1_prepare'] = Date.now() - prepareStart;

      // VOLT-04: Update Prometheus labels with detected values
      detectedAgent = ctx.suggestedAgent || 'Supervisor';
      detectedModel = ctx.selectedModel || options.model || 'unknown';
      // Start timer after we know the labels
      prometheusTimer = this.agentMetricsService?.startChatTimer(detectedAgent, detectedModel, detectedIntent);
    } catch (error) {
      timings['1_prepare'] = Date.now() - prepareStart;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // VOLT-04: Record error metrics
      if (errorMsg.includes('Rate limit exceeded')) {
        this.agentMetricsService?.recordRateLimitHit(options.tenantId, detectedModel);
        this.logger.warn(`[chat] ${errorMsg}`);
        return { text: errorMsg, fromCache: false };
      }
      if (errorMsg.includes('cannot process this request')) {
        this.agentMetricsService?.recordError('chat', 'validation');
        this.logger.warn(`[chat] Prompt injection blocked`);
        return { text: errorMsg, fromCache: false };
      }

      // VOLT-04: Record internal error
      this.agentMetricsService?.recordError('chat', 'internal');
      throw error;
    }

    // Destructure only what we need for local use (rest accessed via ctx.)

    // NOTE: Memory extraction moved to AFTER LLM response (line ~545)
    // This allows capturing contact info from assistant responses too
    timings['2_memory_trigger'] = 0; // Legacy timing slot (kept for metrics)

    this.logger.log(`${ctx.logPrefix} [PERF] Pre-LLM timings: prepare=${timings['1_prepare']}ms | agent=${ctx.suggestedAgent} model=${ctx.selectedModel}`);

    // Emit real-time agent step: Intent analysis started
    this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'intent', 'started', 'Analyzing your request...');

    let result;
    const agentStartTime = Date.now();
    let attempts = 0;
    const MAX_RETRIES = 3;
    let currentMessage = ctx.enhancedMessage;

    while (attempts < MAX_RETRIES) {
      try {
        attempts++;
        // Emit: Supervisor processing
        this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'supervisor', 'processing', `Coordinating agents (Attempt ${attempts})...`);

        // Pass userId and conversationId for proper context in hooks (HITL, metrics, etc.)
        // VoltAgent memory issue fixed in latest version
        result = await ctx.agent.generateText(currentMessage, {
          // Tenant-isolated userId for multi-tenant data segregation
          userId: ctx.tenantUserId,
          // Session/conversation ID for message threading
          conversationId: ctx.sessionId,
          // VoltAgent retrieves conversation history from memory automatically
          // 5 messages = good balance of context vs token usage
          contextLimit: 5,
          // CRITICAL: Disable parallel tool calls for sequential tool execution
          // (multi-step workflows require one tool at a time)
          providerOptions: {
            mistral: {
              parallelToolCalls: false,
              // FIX: Mistral SDK strict validation fails with array content (AI_InvalidPromptError).
              // Disabling structuredOutputs bypasses the strict schema check.
              structuredOutputs: false,
            },
          },
        });

        // Emit: Intent completed
        this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'intent', 'completed', 'Request analyzed', {
          duration: Date.now() - agentStartTime,
        });

        // Emit: Supervisor completed (important for frontend to mark processing as done)
        this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'supervisor', 'completed', 'Agents coordinated', {
          duration: Date.now() - agentStartTime,
        });

        // RACE-04: Record success in circuit breaker
        if (this.mistralService) {
          this.mistralService.recordLlmSuccess();
        }

        this.logger.debug(`${ctx.logPrefix} [DEBUG] agent.generateText completed successfully`);
        break; // Success, exit loop
      } catch (genError) {
        const isLastAttempt = attempts >= MAX_RETRIES;
        const errorMessage = genError instanceof Error ? genError.message : String(genError);

        this.logger.warn(`${ctx.logPrefix} [DEBUG] agent.generateText FAILED (Attempt ${attempts}/${MAX_RETRIES}): ${errorMessage}`);

        // RACE-04: Handle LLM timeout gracefully - return fallback instead of throwing
        const aiError = genError instanceof AiError ? genError : AiError.fromError(genError);
        if (aiError.code === AiErrorCode.PROVIDER_TIMEOUT) {
          this.logger.warn(`${ctx.logPrefix} [RACE-04] LLM timeout for user ${options.userId}, returning fallback`);

          // Record timeout in circuit breaker
          if (this.mistralService) {
            this.mistralService.recordLlmFailure();
          }

          // VOLT-04: Record timeout error in Prometheus
          this.agentMetricsService?.recordError('chat', 'timeout');
          prometheusTimer?.end('error');

          // Emit: Timeout state (not error, as we're handling gracefully)
          this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'supervisor', 'completed', 'Request timed out (fallback)', {
            duration: Date.now() - agentStartTime,
          });

          // Return graceful fallback instead of throwing
          const fallbackMessage = this.mistralService
            ? this.mistralService.getGracefulTimeoutResponse(message, options.locale || 'en')
            : "I'm having trouble completing your request right now. Please try again in a moment.";

          return {
            text: fallbackMessage,
            requiresApproval: false,
            model: ctx.selectedModel,
            fromCache: false,
            conversationId: ctx.sessionId,
          } satisfies ChatResult;
        }

        if (isLastAttempt) {
          // VOLT-04: Record API error in Prometheus
          this.agentMetricsService?.recordError('chat', 'api_error');
          prometheusTimer?.end('error');

          // Emit: Error state
          this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'supervisor', 'error', 'Processing failed', {
            error: errorMessage,
          });
          this.logger.error(`${ctx.logPrefix} [DEBUG] Stack: ${genError instanceof Error ? genError.stack : 'no stack'}`);
          throw genError;
        }

        // Prepare context for retry
        const t = getTranslations(ctx.locale as SupportedLocale);
        const retryPrompt = t.mistral.errors.retryPrompt(errorMessage);

        // Append error feedback to the message for the next attempt
        // We add it as a system/user message simulation to guide the model
        currentMessage += `\n\n---\n\n${retryPrompt}`;

        // Short delay before retry to prevent thundering herd
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    if (!result) {
      // VOLT-04: Record error in Prometheus
      this.agentMetricsService?.recordError('chat', 'internal');
      prometheusTimer?.end('error');

      const errorT = getErrorTranslations('en');
      throw new Error(errorT.ai.agentFailed);
    }

    timings['3_llm_call'] = Date.now() - agentStartTime;

    // Log tool execution details if any
    if (result.steps?.length) {
      const stepDetails = result.steps.map((step: unknown, i: number) => {
        const s = step as { toolResults?: Array<{ toolName?: string }>; durationMs?: number };
        const tools = s.toolResults?.map(t => t.toolName).filter(Boolean).join(',') || 'none';
        return `step${i}:[${tools}]`;
      }).join(' ');
      this.logger.log(`${ctx.logPrefix} [PERF] LLM steps: ${stepDetails} | total=${timings['3_llm_call']}ms`);
    }

    // FIX: Return the sessionId to frontend so conversations persist across messages
    // The sessionId is either the provided conversationId or a newly generated one
    // Format includes tenantId for multi-tenant isolation
    const persistedConversationId: string = ctx.sessionId;

    // Sanitize response to remove any accidentally echoed internal context markers
    const sanitizedText = sanitizeLlmResponse(result.text);

    // Extract facts from ASSISTANT response (contact info, confirmations, etc.)
    // Combined with user message creates a conversational fact pair
    // RC-1 FIX: Use Redis lock to prevent concurrent memory corruption
    // P2.2 (Part 17): Gate extraction - only process messages likely to contain memories
    if (this.memoryIntelligenceService && options.userId && sanitizedText && needsMemoryContext(message)) {
      const conversationPair = `User: ${message}\nAssistant: ${sanitizedText}`;
      const memoryLockKey = `memory:user:${options.tenantId}:${options.userId}`;

      // Use Redis lock if available, otherwise fallback to fire-and-forget
      if (this.redisLockService) {
        this.redisLockService.tryWithLock(
          memoryLockKey,
          10000, // 10s TTL - memory processing should complete within this
          async () => {
            await this.memoryIntelligenceService!.processMemoryFromMessage(
              options.tenantId,
              options.userId,
              conversationPair,
            );
          },
          { maxRetries: 2, baseDelayMs: 50 },
        ).catch(err => {
          this.logger.warn(`${ctx.logPrefix} Memory extraction (response) failed: ${err.message}`);
        });
      } else {
        // Fallback: fire-and-forget (legacy behavior)
        this.memoryIntelligenceService.processMemoryFromMessage(
          options.tenantId,
          options.userId,
          conversationPair,
        ).catch(err => {
          this.logger.warn(`${ctx.logPrefix} Memory extraction (response) failed: ${err.message}`);
        });
      }
    }

    // NOTE: Conversation exists check removed - ChatPrepareService.prepare() already ensures it

    // Extract pending actions from tool results + database (for delegated actions)
    // CRITICAL FIX 2026-01-22: When UnifiedAgent executes tools,
    // tool results with requiresApproval are captured by onToolEnd hooks
    // and stored to database, but NOT visible in top-level result.steps. We must query both.
    const effectiveSessionId = persistedConversationId || options.conversationId || ctx.sessionId;
    let pendingActions: PendingAction[] = [];

    const postProcessStart = Date.now();
    if (this.chatResponseProcessor) {
      // Use the new service that handles both extraction methods
      const processed = await this.chatResponseProcessor.process(
        { text: result.text, steps: result.steps as Array<{ toolResults?: Array<{ output?: Record<string, unknown>; toolName?: string }> }> },
        {
          tenantId: options.tenantId,
          userId: options.userId,
          sessionId: effectiveSessionId,
          requestStartTime: new Date(startTime),
          logPrefix: ctx.logPrefix,
        },
      );
      pendingActions = processed.pendingActions;
    } else if (result.steps?.length) {
      // Fallback: extract from top-level steps only (original behavior)
      this.logger.debug(`[HITL DEBUG] result.steps count: ${result.steps.length}`);
      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        const toolResults = (step as unknown as { toolResults?: Array<{ output?: unknown; toolName?: string }> }).toolResults;
        if (toolResults) {
          for (const toolResult of toolResults) {
            const resultValue = toolResult.output as Record<string, unknown> | undefined;
            // Handle ask_user_clarification tool results - emit as special event
            if (resultValue?.__askUser === true) {
              this.logger.debug(`${ctx.logPrefix} Detected ask_user tool result`);
              // Emit ask-user event via WebSocket for frontend to show modal
              this.emitAgentStep(options.tenantId, effectiveSessionId, options.userId, 'ask-user', 'pending', 'Waiting for user input', {
                question: resultValue.question as string,
                header: resultValue.header as string,
                options: resultValue.options as Array<{ label: string; description?: string }>,
                multiSelect: resultValue.multiSelect as boolean,
              });
            }
            if (resultValue?.requiresApproval) {
              const actionType = resultValue.actionType as string;
              const severity = resultValue.severity as 'LOW' | 'MEDIUM' | 'HIGH';
              const payload = resultValue.payload as Record<string, unknown>;
              const summary = resultValue.summary as string;

              let actionId: string;
              if (this.hitlService) {
                actionId = await this.hitlService.createPendingAction({
                  tenantId: options.tenantId,
                  userId: options.userId,
                  sessionId: effectiveSessionId,
                  agentName: 'UnifiedAgent',
                  action: {
                    type: actionType as unknown as import('./interfaces/agent-action.interface').AgentActionType,
                    payload,
                    confidence: (resultValue.confidence as number) ?? 0.8,
                    severity: severity as ActionSeverity,
                    reasoningSteps: summary,
                  },
                });
              } else {
                actionId = crypto.randomUUID();
              }

              pendingActions.push({ id: actionId, actionType, severity, payload, summary });
            }
          }
        }
      }
    }

    // Emit final response event with the correct persistedConversationId
    // This ensures the frontend can match events even for new conversations
    const finalSessionId = persistedConversationId || ctx.sessionId;
    this.emitAgentStep(options.tenantId, finalSessionId, options.userId, 'response', 'completed', 'Response ready', {
      duration: Date.now() - startTime,
      result: pendingActions.length > 0 ? 'Action requires approval' : 'Response generated',
    });

    // MS-1 FIX: Parallelize post-processing operations (saves 50-100ms)
    // Run usage tracking and PII resolution concurrently
    const [, userVisibleText] = await Promise.all([
      // P10: Track successful AI call usage (fire-and-forget, but awaited for timing)
      this.usageTrackingService
        ? this.usageTrackingService.trackUsage(options.tenantId, 'ai-calls', 1).catch((err: Error) => {
            this.logger.warn(`${ctx.logPrefix} Failed to track AI usage: ${err.message}`);
          })
        : Promise.resolve(),
      // MS-3 FIX: PII resolution (was sequential, now parallel)
      this.resolveUserVisibleText(options.tenantId, ctx.sessionId, sanitizedText),
    ]);
    timings['4_post_process'] = Date.now() - postProcessStart;
    timings['total'] = Date.now() - startTime;

    // PERF: Final timing summary
    this.logger.log(
      `${ctx.logPrefix} [PERF] chat() COMPLETE: ` +
      `prepare=${timings['1_prepare']}ms | ` +
      `llm=${timings['3_llm_call']}ms | ` +
      `post=${timings['4_post_process']}ms | ` +
      `TOTAL=${timings['total']}ms | ` +
      `agent=${ctx.suggestedAgent} model=${ctx.selectedModel}`
    );

    // VOLT-04: Record success in Prometheus
    prometheusTimer?.end('success');

    // VOLT-04: Record token usage if available
    const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
    if (usage) {
      this.agentMetricsService?.recordTokens(
        options.tenantId,
        detectedModel,
        usage.promptTokens || 0,
        usage.completionTokens || 0,
      );
    }

    return {
      text: userVisibleText,
      requiresApproval: pendingActions.length > 0,
      pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
      model: ctx.selectedModel,
      fromCache: false,
      conversationId: persistedConversationId,
    };
  }

  /**
   * Create streaming context for AI SDK v6 integration.
   * Returns raw VoltAgent streamText result and PII sanitization transform.
   * Use with result.toUIMessageStream() for proper AI SDK protocol compliance.
   *
   * @example
   * const { streamResult, piiTransform } = await service.createStreamContext(message, options);
   * const uiStream = streamResult.toUIMessageStream();
   * const sanitizedStream = uiStream.pipeThrough(piiTransform);
   */
  async createStreamContext(
    message: string,
    options: ChatOptions,
  ): Promise<{
    streamResult: any; // VoltAgent StreamTextResult - has toUIMessageStream()
    piiTransform: TransformStream<any, any>;
    sessionId: string;
  }> {
    const startTime = Date.now();
    const logPrefix = `[createStreamContext] [tenant:${options.tenantId}]`;
    this.logger.log(`${logPrefix} START`);

    // Use ChatPrepareService for consolidated setup
    if (!this.chatPrepareService) {
      throw new AiError('ChatPrepareService not available', AiErrorCode.INTERNAL_ERROR, { retryable: false });
    }

    // Deterministic sessionId for events (same logic as chat())
    const fallbackSessionId = `${options.tenantId}:${options.userId}:default`;
    const eventSessionId = options.conversationId || fallbackSessionId;

    // Emit real-time agent step: Intent analysis started
    this.emitAgentStep(options.tenantId, eventSessionId, options.userId, 'intent', 'started', 'Analyzing your request...');

    const ctx = await this.chatPrepareService.prepare(message, options, this.memory, this.observabilityHooks);

    // Emit: Intent completed, Supervisor processing
    this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'intent', 'completed', 'Request analyzed', {
      duration: Date.now() - startTime,
    });
    this.emitAgentStep(options.tenantId, ctx.sessionId, options.userId, 'supervisor', 'processing', 'Generating response...');

    // Get raw VoltAgent streamText result - has toUIMessageStream()
    const streamResult = await ctx.agent.streamText(ctx.enhancedMessage, {
      userId: ctx.tenantUserId,
      conversationId: ctx.sessionId,
      contextLimit: 20,
      providerOptions: {
        mistral: {
          parallelToolCalls: false,
          structuredOutputs: false,
        },
      },
    });

    // Create PII sanitization TransformStream (zero-buffering)
    // NOTE: Custom events (ask-user, suggested-questions) are NOT emitted here.
    // The AI SDK's UIMessageStream protocol doesn't support custom event types.
    // The frontend parses these blocks directly from the text content in use-voltagent-chat.ts.
    const piiMappings = this.piiResolutionService
      ? await this.piiResolutionService.getMappings(options.tenantId, ctx.sessionId)
      : [];
    const sanitizer = createStreamSanitizer(piiMappings);

    // Capture context for closure in transform callbacks
    const streamStartTime = startTime;
    const streamTenantId = options.tenantId;
    const streamUserId = options.userId;
    const streamSessionId = ctx.sessionId;
    const emitStep = this.emitAgentStep.bind(this);

    const piiTransform = new TransformStream<any, any>({
      transform(chunk, controller) {
        if (!chunk || typeof chunk !== 'object') {
          controller.enqueue(chunk);
          return;
        }

        // Handle text-delta: sanitize and emit immediately
        if (chunk.type === 'text-delta' && chunk.delta) {
          const safeText = sanitizer.handleChunk(chunk.delta);
          if (safeText.length > 0) {
            controller.enqueue({ ...chunk, delta: safeText });
          }
          return;
        }

        // Detect stream completion - emit agent step events
        if (chunk.type === 'finish' || chunk.type === 'step-finish') {
          // Emit: Supervisor completed
          emitStep(streamTenantId, streamSessionId, streamUserId, 'supervisor', 'completed', 'Response generated', {
            duration: Date.now() - streamStartTime,
          });
          // Emit: Response ready
          emitStep(streamTenantId, streamSessionId, streamUserId, 'response', 'completed', 'Response ready', {
            duration: Date.now() - streamStartTime,
          });
        }

        // Pass through all other chunks unchanged
        controller.enqueue(chunk);
      },
    });

    this.logger.log(`${logPrefix} Context created in ${Date.now() - startTime}ms`);

    return { streamResult, piiTransform, sessionId: ctx.sessionId };
  }

  /**
   * Clear all cached agents (admin only).
   * Delegated to AgentPoolService (Redis-backed).
   */
  async clearAgentCache(): Promise<number> {
    return this.agentPoolService?.clearAgentCache() ?? 0;
  }

  /**
   * Clear cached agents for a specific tenant (GDPR-compliant).
   * Uses Redis SCAN for production safety (non-blocking).
   *
   * @param tenantId - Tenant ID to clear cache for
   * @returns Number of keys deleted
   */
  async clearAgentCacheForTenant(tenantId: string): Promise<number> {
    return this.agentPoolService?.clearAgentCacheForTenant(tenantId) ?? 0;
  }

  /**
   * Clear all caches for a specific user (GDPR Art. 17 - Right to Erasure).
   * Clears agent pool and user context caches.
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID (email) to clear cache for
   * @returns Object with counts of deleted keys per cache type
   */
  async clearUserCaches(
    tenantId: string,
    userId: string,
  ): Promise<{ agentPool: number; userContext: boolean }> {
    const [agentPool, userContext] = await Promise.all([
      this.agentPoolService?.clearAgentCacheForUser(tenantId, userId) ?? 0,
      this.cacheService?.del(`voltagent:user-context:${tenantId}:${userId}`) ?? false,
    ]);

    this.logger.log(
      `[GDPR Art.17] Cleared all caches for user ${userId} in tenant ${tenantId}: agentPool=${agentPool}, userContext=${userContext}`,
    );

    return { agentPool, userContext };
  }

  /**
   * Submit an action for approval using ApprovalWorkflowService.
   * Delegates to ApprovalWorkflowService for workflow management.
   */
  async submitActionForApproval(
    action: ApprovalInput['action'],
    autoApproveThreshold?: number,
  ): Promise<ApprovalResult | SuspendedWorkflow> {
    // Use provided threshold or fall back to config default (0.9)
    const threshold = autoApproveThreshold ?? this.configService.get<number>('ai.hitl.defaultAutoApproveThreshold', 0.9);
    if (!this.approvalWorkflowService) {
      throw new AiError('Approval workflow not available', AiErrorCode.INTERNAL_ERROR, {
        retryable: false,
      });
    }
    return this.approvalWorkflowService.submitActionForApproval(action, threshold);
  }

  /**
   * Resume a suspended workflow with human decision.
   * Delegates to ApprovalWorkflowService for workflow management.
   */
  async resumeApproval(
    executionId: string,
    decision: ApprovalResumeData,
    tenantId?: string,
  ): Promise<ApprovalResult> {
    if (!this.approvalWorkflowService) {
      throw new AiError('Approval workflow not available', AiErrorCode.INTERNAL_ERROR, {
        retryable: false,
      });
    }
    return this.approvalWorkflowService.resumeApproval(executionId, decision, tenantId);
  }

  /**
   * Get all suspended workflows for a tenant.
   * Delegates to ApprovalWorkflowService.
   */
  async getSuspendedWorkflows(tenantId: string): Promise<SuspendedWorkflow[]> {
    if (!this.approvalWorkflowService) {
      return [];
    }
    return this.approvalWorkflowService.getSuspendedWorkflows(tenantId);
  }

  /**
   * Get a specific suspended workflow by ID.
   * Delegates to ApprovalWorkflowService.
   */
  async getSuspendedWorkflow(executionId: string, tenantId?: string): Promise<SuspendedWorkflow | undefined> {
    if (!this.approvalWorkflowService) {
      return undefined;
    }
    return this.approvalWorkflowService.getSuspendedWorkflow(executionId, tenantId);
  }

  // ========================================================================
  // Optimization Statistics
  // ========================================================================

  /**
   * Get optimization statistics (queue + agent metrics only).
   * NOTE: semanticCache and modelRouting REMOVED - kept in response for API compatibility.
   */
  async getOptimizationStats(_tenantId: string) {
    const queueEnabled = this.aiQueueService?.isEnabled() ?? false;

    return {
      // REMOVED: Semantic cache disabled due to cross-tenant security issues
      semanticCache: { enabled: false, entries: 0, totalHits: 0, estimatedSavings: 0 },
      // REMOVED: VoltAgent 2.x handles model routing natively
      modelRouting: { enabled: false, totalRequests: 0, byModel: {}, estimatedSavings: 0 },
      queue: {
        enabled: queueEnabled,
        metrics: queueEnabled ? await this.aiQueueService!.getQueueMetrics() : [],
      },
      agentMetrics: await this.getMetricsStats(),
    };
  }

  // ========================================================================
  // Conversation Management (Chat Sessions)
  // Delegates to ConversationManagementService for separation of concerns
  // ========================================================================

  /** List conversations for a user. */
  async listConversations(tenantId: string, userId: string, limit = 50) {
    if (!this.conversationService) return [];
    return this.conversationService.listConversations(this.memory, tenantId, userId, limit);
  }

  /** Get a conversation with its messages. */
  async getConversationWithMessages(
    tenantId: string,
    userId: string,
    conversationId: string,
    messageLimit = 50,
  ) {
    if (!this.conversationService) return null;
    return this.conversationService.getConversationWithMessages(
      this.memory, tenantId, userId, conversationId, messageLimit,
    );
  }

  /** Update conversation metadata (title, archived status). */
  async updateConversation(
    _tenantId: string,
    _userId: string,
    conversationId: string,
    updates: { title?: string; isArchived?: boolean },
  ): Promise<boolean> {
    if (!this.conversationService) return false;
    return this.conversationService.updateConversation(this.memory, conversationId, updates);
  }

  /** Delete a conversation and its messages. */
  async deleteConversation(
    _tenantId: string,
    _userId: string,
    conversationId: string,
  ): Promise<boolean> {
    if (!this.conversationService) return false;
    return this.conversationService.deleteConversation(this.memory, conversationId);
  }

  /** Generate a title for a conversation using AI. */
  async generateConversationTitle(
    tenantId: string,
    userId: string,
    conversationId: string,
    locale = 'en',
  ): Promise<string | null> {
    if (!this.conversationService) return null;
    return this.conversationService.generateConversationTitle(
      this.memory, tenantId, userId, conversationId, locale,
    );
  }
}
