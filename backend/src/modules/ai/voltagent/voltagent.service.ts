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
import { Injectable, OnModuleInit, OnModuleDestroy, Optional, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Memory } from '@voltagent/core';
import type { Agent } from '@voltagent/core';
import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { CacheService } from '../../../common/services/cache.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { HitlService } from './services/hitl.service';
// ModelRouterService removed - VoltAgent 2.x handles model routing natively
// Phase 3: Consolidated agents (10 → 3) - now handled by AgentPoolService
import { type UserContext } from './agents/supervisor.agent';
import { AiQueueService } from './services/ai-queue.service';
import { AiError, AiErrorCode } from '../errors';
import { ActionSeverity } from './interfaces/agent-action.interface';
import { type ConnectedProvider } from './agents';
import { getLocale, getTranslations, getErrorTranslations } from './locales';
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
import { ChatContextBuilderService, sanitizeLlmResponse } from './services/chat-context-builder.service';
import { AgentMetricsService } from './services/agent-metrics.service';
import { AgentPoolService } from './services/agent-pool.service';
import { ChatPrepareService } from './services/chat-prepare.service';

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

  private async ensureConversationExists(params: {
    tenantUserId: string;
    sessionId: string;
    title: string;
    tenantId: string;
    logPrefix: string;
  }): Promise<boolean> {
    if (!this.memory) {
      return false;
    }

    try {
      await this.memory.createConversation({
        id: params.sessionId,
        userId: params.tenantUserId,
        resourceId: `agent:${params.tenantId}`,
        title: params.title,
        metadata: { tenantId: params.tenantId, createdAt: new Date().toISOString() },
      });
      this.logger.debug(`${params.logPrefix} Created new conversation: ${params.sessionId}`);
      return true;
    } catch (error) {
      const errorMsg = String(error).toLowerCase();
      const isDuplicateError = errorMsg.includes('unique') ||
        errorMsg.includes('duplicate') ||
        errorMsg.includes('already exists') ||
        errorMsg.includes('p2002');
      if (isDuplicateError) {
        this.logger.debug(`${params.logPrefix} Conversation already exists: ${params.sessionId}`);
        return true;
      }
      this.logger.warn(`${params.logPrefix} Failed to ensure conversation exists: ${error}`);
      return false;
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly hitlService?: HitlService,
    @Optional() private readonly aiQueueService?: AiQueueService,
    @Optional() private readonly piiResolutionService?: PiiResolutionService,
    @Optional() private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional() private readonly conversationService?: ConversationManagementService,
    @Optional() private readonly memoryIntelligenceService?: MemoryIntelligenceService,
    @Optional() private readonly usageTrackingService?: UsageTrackingService,
    @Optional() private readonly chatResponseProcessor?: ChatResponseProcessorService,
    @Optional() private readonly chatRequestProcessor?: ChatRequestProcessorService,
    @Optional() private readonly chatContextBuilder?: ChatContextBuilderService,
    @Optional() private readonly agentMetricsService?: AgentMetricsService,
    @Optional() private readonly approvalWorkflowService?: ApprovalWorkflowService,
    @Optional() private readonly agentPoolService?: AgentPoolService,
    @Optional() private readonly chatPrepareService?: ChatPrepareService,
  ) { }

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
    this.agentPoolService?.clearAgentCache();
  }


  // Tenant isolation is now handled by Prisma-based VoltAgentMemoryService

  /**
   * Fetch user context (profile + preferences) for personalized instructions.
   * Uses Redis caching for tenant isolation and performance.
   * Returns null if user not found.
   */
  private async getUserContext(userId: string, tenantId: string): Promise<UserContext | null> {
    // Check Redis cache first (tenant-isolated key)
    const cacheKey = `voltagent:user-context:${tenantId}:${userId}`;
    if (this.cacheService) {
      const cached = await this.cacheService.get<UserContext>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Fetch user with preferences and connected providers in parallel
      const [user, providers] = await Promise.all([
        this.prisma.user.findFirst({
          where: { id: userId, tenantId },
          include: {
            userPreferences: true,
          },
        }),
        this.prisma.providerConfig.findMany({
          where: {
            tenantId,
            userId,
            isActive: true,
          },
          select: {
            providerType: true,
            email: true,
            displayName: true,
            scope: true,
            supportsEmail: true,
            supportsCalendar: true,
            supportsContacts: true,
            isDefault: true,
          },
          orderBy: [
            { isDefault: 'desc' }, // Default provider first
            { createdAt: 'asc' },
          ],
        }),
      ]);

      if (!user) {
        return null;
      }

      // Map providers to ConnectedProvider format
      const connectedProviders: ConnectedProvider[] = providers.map((p) => ({
        providerType: p.providerType,
        email: p.email,
        displayName: p.displayName ?? undefined,
        scope: p.scope ?? undefined,
        supportsEmail: p.supportsEmail,
        supportsCalendar: p.supportsCalendar,
        supportsContacts: p.supportsContacts,
        isDefault: p.isDefault,
      }));

      const userContext: UserContext = {
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        email: user.email,
        role: user.role,
        jobTitle: user.userPreferences?.jobTitle ?? undefined,
        jobRole: user.userPreferences?.jobRole ?? undefined,
        department: user.userPreferences?.department ?? undefined,
        industry: user.userPreferences?.industry ?? undefined,
        companySize: user.userPreferences?.companySize ?? undefined,
        communicationStyle: user.userPreferences?.communicationStyle ?? undefined,
        responseLength: user.userPreferences?.responseLength ?? undefined,
        language: user.userPreferences?.language ?? undefined,
        timezone: user.userPreferences?.timezone ?? undefined,
        connectedProviders: connectedProviders.length > 0 ? connectedProviders : undefined,
      };

      // Cache for 5 minutes (user preferences don't change often)
      if (this.cacheService) {
        await this.cacheService.set(cacheKey, userContext, { ttl: 300 });
      }

      return userContext;
    } catch (error) {
      this.logger.warn(`Failed to fetch user context for ${userId}: ${error}`);
      return null;
    }
  }

  /**
   * Emit agent step event via WebSocket for real-time UI feedback.
   * Used to show live agent progress in the frontend.
   */
  private emitAgentStep(
    tenantId: string,
    sessionId: string,
    userId: string,
    agentType: AiAgentType,
    status: 'started' | 'processing' | 'tool_call' | 'completed' | 'error',
    action: string,
    options?: { toolName?: string; duration?: number; result?: string; error?: string },
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
   */
  async chat(message: string, options: ChatOptions): Promise<ChatResult> {
    const startTime = Date.now();
    // Get or create correlation ID for this chat request
    const correlationId = CorrelationContext.getCorrelationId();
    const logPrefix = `[${correlationId}] [tenant:${options.tenantId}]`;
    // Deterministic fallback sessionId for users without explicit conversationId
    const fallbackSessionId = `${options.tenantId}:${options.userId}:default`;
    const sessionId = options.conversationId || fallbackSessionId;

    // Process request: validate input, redact PII, check rate limits, route model
    // Refactored 2026-01-22: Extracted to ChatRequestProcessorService
    let processedMessage = message;
    let selectedModel = options.model;
    let suggestedAgent: 'Supervisor' | 'Actions' | 'Intelligence' = 'Supervisor';

    if (this.chatRequestProcessor) {
      try {
        const processed = await this.chatRequestProcessor.process(message, {
          tenantId: options.tenantId,
          userId: options.userId,
          sessionId,
          model: options.model,
          preferSpeed: options.preferSpeed,
          preferQuality: options.preferQuality,
        });
        processedMessage = processed.processedMessage;
        selectedModel = processed.selectedModel;
        suggestedAgent = processed.suggestedAgent;

        if (processed.hasPii) {
          this.logger.log(`${logPrefix} PII detected and redacted`);
        }
        this.logger.debug(
          `${logPrefix} Request processed: model=${selectedModel}, agent=${suggestedAgent}, tokens=${processed.estimatedTokens}`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Handle rate limit and validation errors gracefully
        if (errorMsg.includes('Rate limit exceeded')) {
          this.logger.warn(`${logPrefix} ${errorMsg}`);
          return { text: errorMsg, fromCache: false };
        }
        if (errorMsg.includes('cannot process this request')) {
          this.logger.warn(`${logPrefix} Prompt injection blocked`);
          return { text: errorMsg, fromCache: false };
        }
        throw error;
      }
    } else {
      // ChatRequestProcessorService not available - log warning and proceed with defaults
      this.logger.warn(`${logPrefix} ChatRequestProcessorService not injected, using default processing`);
    }

    const locale = getLocale(options.locale);

    // Fetch user context for personalized agent instructions
    const userContext = await this.getUserContext(options.userId, options.tenantId);

    // OPTIMIZATION: Direct routing for specialized intents (skip supervisor overhead)
    // Phase 3: Actions/Intelligence agents handle direct routing, Supervisor for complex queries
    // This reduces latency by ~70-90% for single-domain queries
    if (!this.agentPoolService) {
      throw new AiError('AgentPoolService not available', AiErrorCode.INTERNAL_ERROR, { retryable: false });
    }
    const agentParams = {
      tenantId: options.tenantId,
      locale,
      modelType: selectedModel,
      userContext,
      userId: options.userId,
      agentType: suggestedAgent,
      memory: this.memory,
      hooks: this.observabilityHooks?.hooks,
    };
    let agent: Agent;
    if (suggestedAgent !== 'Supervisor') {
      this.logger.debug(`${logPrefix} Direct routing to ${suggestedAgent}Agent (skipping supervisor)`);
      agent = await this.agentPoolService.getOrCreateAgent(agentParams);
    } else {
      // Use supervisor for complex multi-agent coordination (cross-domain queries)
      agent = await this.agentPoolService.getOrCreateAgent({ ...agentParams, agentType: 'Supervisor' });
    }

    // NOTE: tenantUserId was previously used for VoltAgent's native memory (disabled due to bug)
    // Tenant isolation is now handled by our Prisma-based VoltAgentMemoryService


    // Prepare tenant-isolated context for VoltAgent hooks (HITL, metrics, observability)
    // Format: "tenantId:userId" allows hooks to extract both values
    const tenantUserId = `${options.tenantId}:${options.userId}`;

    // 3.5. Trigger Memory Intelligence (Async/Fire-and-forget)
    // Extracts long-term memories from user message for future retrieval
    if (this.memoryIntelligenceService && options.userId) {
      this.memoryIntelligenceService.processMemoryFromMessage(
        options.tenantId,
        options.userId,
        message, // Use original message with real PII for long-term storage
      ).catch(err => {
        this.logger.error(`${logPrefix} Memory extraction failed:`, err);
      });
    }

    // Build enhanced context: episodic lessons + long-term memory
    // Conversation history is handled by VoltAgent's native memory (contextLimit: 20)
    let enhancedMessage = processedMessage;

    if (this.chatContextBuilder) {
      const contextResult = await this.chatContextBuilder.build(processedMessage, {
        tenantId: options.tenantId,
        userId: options.userId,
        logPrefix,
      });
      enhancedMessage = contextResult.enhancedMessage;
    }

    // Ensure conversation exists in VoltAgent memory for persistence
    const conversationEnsured = await this.ensureConversationExists({
      tenantUserId,
      sessionId,
      title: processedMessage.substring(0, 100),
      tenantId: options.tenantId,
      logPrefix,
    });

    this.logger.debug(`${logPrefix} [DEBUG] About to call agent.generateText`);

    // Emit real-time agent step: Intent analysis started
    this.emitAgentStep(options.tenantId, sessionId, options.userId, 'intent', 'started', 'Analyzing your request...');

    let result;
    const agentStartTime = Date.now();
    let attempts = 0;
    const MAX_RETRIES = 3;
    let currentMessage = enhancedMessage;

    while (attempts < MAX_RETRIES) {
      try {
        attempts++;
        // Emit: Supervisor processing
        this.emitAgentStep(options.tenantId, sessionId, options.userId, 'supervisor', 'processing', `Coordinating agents (Attempt ${attempts})...`);

        // Pass userId and conversationId for proper context in hooks (HITL, metrics, etc.)
        // VoltAgent memory issue fixed in latest version
        result = await agent.generateText(currentMessage, {
          // Tenant-isolated userId for multi-tenant data segregation
          userId: tenantUserId,
          // Session/conversation ID for message threading
          conversationId: sessionId,
          // VoltAgent retrieves conversation history from memory automatically
          // 20 messages = good balance of context vs token usage
          contextLimit: 20,
          // CRITICAL: Disable parallel tool calls to ensure sequential delegation
          // (ContactsAgent → EmailAgent flow requires one tool at a time)
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
        this.emitAgentStep(options.tenantId, sessionId, options.userId, 'intent', 'completed', 'Request analyzed', {
          duration: Date.now() - agentStartTime,
        });

        // Emit: Supervisor completed (important for frontend to mark processing as done)
        this.emitAgentStep(options.tenantId, sessionId, options.userId, 'supervisor', 'completed', 'Agents coordinated', {
          duration: Date.now() - agentStartTime,
        });

        this.logger.debug(`${logPrefix} [DEBUG] agent.generateText completed successfully`);
        break; // Success, exit loop
      } catch (genError) {
        const isLastAttempt = attempts >= MAX_RETRIES;
        const errorMessage = genError instanceof Error ? genError.message : String(genError);

        this.logger.warn(`${logPrefix} [DEBUG] agent.generateText FAILED (Attempt ${attempts}/${MAX_RETRIES}): ${errorMessage}`);

        if (isLastAttempt) {
          // Emit: Error state
          this.emitAgentStep(options.tenantId, sessionId, options.userId, 'supervisor', 'error', 'Processing failed', {
            error: errorMessage,
          });
          this.logger.error(`${logPrefix} [DEBUG] Stack: ${genError instanceof Error ? genError.stack : 'no stack'}`);
          throw genError;
        }

        // Prepare context for retry
        const t = getTranslations(locale); // locale is already defined above
        const retryPrompt = t.mistral.errors.retryPrompt(errorMessage);

        // Append error feedback to the message for the next attempt
        // We add it as a system/user message simulation to guide the model
        currentMessage += `\n\n---\n\n${retryPrompt}`;

        // Short delay before retry to prevent thundering herd
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    if (!result) {
      const errorT = getErrorTranslations('en');
      throw new Error(errorT.ai.agentFailed);
    }

    // FIX: Return the sessionId to frontend so conversations persist across messages
    // The sessionId is either the provided conversationId or a newly generated one
    // Format includes tenantId for multi-tenant isolation
    const persistedConversationId: string = sessionId;

    // Sanitize response to remove any accidentally echoed internal context markers
    const sanitizedText = sanitizeLlmResponse(result.text);

    // VoltAgent auto-persists messages when memory is configured on agents
    // Manual persistence removed to avoid duplicates (2026-01-23)
    // Only ensure conversation exists for proper scoping
    if (this.memory && !conversationEnsured) {
      await this.ensureConversationExists({
        tenantUserId,
        sessionId: persistedConversationId,
        title: processedMessage.substring(0, 100),
        tenantId: options.tenantId,
        logPrefix,
      }).catch((error) => {
        this.logger.warn(`${logPrefix} Failed to ensure conversation exists: ${error}`);
      });
    }

    // Extract pending actions from tool results + database (for delegated actions)
    // CRITICAL FIX 2026-01-22: When Supervisor delegates to ActionsAgent via delegate_task,
    // the sub-agent's tool results with requiresApproval are captured by onToolEnd hooks
    // and stored to database, but NOT visible in top-level result.steps. We must query both.
    const effectiveSessionId = persistedConversationId || options.conversationId || sessionId;
    let pendingActions: PendingAction[] = [];

    if (this.chatResponseProcessor) {
      // Use the new service that handles both extraction methods
      const processed = await this.chatResponseProcessor.process(
        { text: result.text, steps: result.steps as Array<{ toolResults?: Array<{ output?: Record<string, unknown>; toolName?: string }> }> },
        {
          tenantId: options.tenantId,
          userId: options.userId,
          sessionId: effectiveSessionId,
          requestStartTime: new Date(startTime),
          logPrefix,
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
                  agentName: 'SupervisorAgent',
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
    const finalSessionId = persistedConversationId || sessionId;
    this.emitAgentStep(options.tenantId, finalSessionId, options.userId, 'response', 'completed', 'Response ready', {
      duration: Date.now() - startTime,
      result: pendingActions.length > 0 ? 'Action requires approval' : 'Response generated',
    });

    // P10: Track successful AI call usage (after completion, before return)
    if (this.usageTrackingService) {
      await this.usageTrackingService.trackUsage(options.tenantId, 'ai-calls', 1).catch((err: Error) => {
        this.logger.warn(`${logPrefix} Failed to track AI usage: ${err.message}`);
      });
    }

    const userVisibleText = await this.resolveUserVisibleText(options.tenantId, sessionId, sanitizedText);

    return {
      text: userVisibleText,
      requiresApproval: pendingActions.length > 0,
      pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
      model: selectedModel,
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

    const ctx = await this.chatPrepareService.prepare(message, options, this.memory, this.observabilityHooks);

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
    const piiMappings = this.piiResolutionService
      ? await this.piiResolutionService.getMappings(options.tenantId, ctx.sessionId)
      : [];
    const sanitizer = createStreamSanitizer(piiMappings);

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

        // Pass through all other chunks unchanged
        controller.enqueue(chunk);
      },
    });

    this.logger.log(`${logPrefix} Context created in ${Date.now() - startTime}ms`);

    return { streamResult, piiTransform, sessionId: ctx.sessionId };
  }

  /**
   * Clear cached agents (useful for testing or config changes).
   * Delegated to AgentPoolService.
   */
  clearAgentCache(): void {
    this.agentPoolService?.clearAgentCache();
  }

  /**
   * Submit an action for approval using ApprovalWorkflowService.
   * Delegates to ApprovalWorkflowService for workflow management.
   */
  async submitActionForApproval(
    action: ApprovalInput['action'],
    autoApproveThreshold = 0.9,
  ): Promise<ApprovalResult | SuspendedWorkflow> {
    if (!this.approvalWorkflowService) {
      throw new AiError('Approval workflow not available', AiErrorCode.INTERNAL_ERROR, {
        retryable: false,
      });
    }
    return this.approvalWorkflowService.submitActionForApproval(action, autoApproveThreshold);
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
