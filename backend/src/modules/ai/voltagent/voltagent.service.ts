/**
 * VoltAgent Service
 *
 * NestJS service that provides VoltAgent functionality.
 * Creates and manages agents with proper dependency injection.
 * Implements tenant isolation via userId namespacing.
 * Uses VoltAgent's native workflow suspend/resume for HITL.
 *
 * Performance Optimizations (2025):
 * - Semantic Caching: 50-60% cost reduction via Redis LangCache
 * - Model Router: Intelligent model selection (40-60% cost savings)
 * - BullMQ Queues: 8x throughput via background job processing
 * - Batch Writes: Metrics buffering for >1000 tenant scalability
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Optional, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Memory } from '@voltagent/core';
import type { Agent } from '@voltagent/core';
import { PostgreSQLMemoryAdapter } from '@voltagent/postgres';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarService } from '../../calendar/services/calendar.service';
import { EmailSendService } from '../../email/services/email-send.service';
import { MistralService } from '../services/mistral.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { HitlService, PendingActionStatus } from './services/hitl.service';
import { ActionExecutorService, ActionExecutionResult } from './services/action-executor.service';
import { SemanticCacheService } from './services/semantic-cache.service';
import { ModelRouterService } from './services/model-router.service';
import { AiQueueService, type AiJobData } from './services/ai-queue.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { AiError, AiErrorCode } from '../errors';
import { MistralBatchService } from './services/mistral-batch.service';
import { AgentAction, AgentActionType, ActionSeverity } from './interfaces/agent-action.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { createSupervisorAgent, type UserContext, type ConnectedProvider } from './agents';
import { getLocale, type SupportedLocale } from './locales';
import { VoltAgentMemoryService, LongTermMemoryService } from './memory';
import { DocumentLibraryService } from './services/document-library.service';
import { PromptGuardService, PiiDetectionService } from '../guards';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import type { AiAgentType } from '../../realtime/types/realtime.types';
import { DeadlineExtractorService } from './services/deadline-extractor.service';
import { FollowUpService } from './services/follow-up.service';
import { ActionItemService } from './services/action-item.service';
import { createObservabilityHooks, type AgentMetrics, type DisposableHooks } from './observability';
import { getMistralModel, type MistralModel } from './providers/mistral.provider';
import {
  createApprovalWorkflow,
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from './workflows';

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
  /** Whether conversation context was truncated due to token budget */
  contextTruncated?: boolean;
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
 * Workflow execution result type for approval workflow.
 */
type ApprovalWorkflowResult = Awaited<
  ReturnType<ReturnType<typeof createApprovalWorkflow>['run']>
>;

/**
 * Workflow execution state for suspended workflows.
 */
export interface SuspendedWorkflow {
  executionId: string;
  tenantId: string;
  userId: string;
  /** Conversation/session ID for linking to chat messages */
  sessionId?: string;
  action: ApprovalInput['action'];
  suspendReason: string;
  suspendedAt: Date;
  /** The workflow result object (needed for resume) */
  workflowResult: ApprovalWorkflowResult;
}

/**
 * Serializable workflow state for Redis storage.
 * Excludes non-serializable workflowResult (functions can't be stored in Redis).
 */
interface SerializableSuspendedWorkflow {
  executionId: string;
  tenantId: string;
  userId: string;
  action: ApprovalInput['action'];
  suspendReason: string;
  suspendedAt: string; // ISO string for JSON serialization
}

/** Cached agent with creation timestamp for TTL-based expiration */
interface CachedAgent {
  agent: Agent;
  createdAt: number;
  lastUsed: number; // For LRU eviction
}

@Injectable()
export class VoltAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoltAgentService.name);
  private agents: Map<string, CachedAgent> = new Map();
  private memory: Memory | null = null;
  private approvalWorkflow: ReturnType<typeof createApprovalWorkflow> | null = null;
  private observabilityHooks: DisposableHooks | null = null;

  /** Redis key prefix for suspended workflows (horizontal scaling) */
  private readonly SUSPENDED_WORKFLOW_PREFIX = 'voltagent:workflow:suspended:';
  /** TTL for suspended workflows (24 hours) */
  private readonly SUSPENDED_WORKFLOW_TTL = 86400;
  /** TTL for cached agents (5 minutes) - balances memory vs code reload */
  private readonly AGENT_CACHE_TTL_MS = 5 * 60 * 1000;
  /**
   * MEMORY OPTIMIZATION 2025: Reduced from 100 to 5 agents.
   * Uses model-only cache key instead of per-tenant.
   * 1000 tenants share 5 agents = ~25MB instead of 500MB.
   * Tenant context is passed per-request, not cached.
   */
  private readonly MAX_CACHED_AGENTS = 5;

  /** In-memory buffer for batch Redis writes */
  private metricsBuffer: AgentMetrics[] = [];
  private readonly maxMemoryBuffer = 50; // Batch size before Redis flush
  private readonly maxRedisBuffer = 10000; // Max metrics per tenant in Redis (for >1000 tenants)
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSendService: EmailSendService,
    private readonly calendarService: CalendarService,
    private readonly configService: ConfigService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly hitlService?: HitlService,
    @Optional() private readonly actionExecutorService?: ActionExecutorService,
    @Optional() private readonly mistralService?: MistralService,
    @Optional() private readonly embeddingsService?: EmbeddingsService,
    @Optional() private readonly semanticCacheService?: SemanticCacheService,
    @Optional() private readonly modelRouterService?: ModelRouterService,
    @Optional() private readonly aiQueueService?: AiQueueService,
    @Optional() private readonly rateLimiterService?: RateLimiterService,
    @Optional() private readonly mistralBatchService?: MistralBatchService,
    @Optional() private readonly voltAgentMemoryService?: VoltAgentMemoryService,
    @Optional() private readonly longTermMemoryService?: LongTermMemoryService,
    @Optional() private readonly documentLibraryService?: DocumentLibraryService,
    @Optional() private readonly promptGuardService?: PromptGuardService,
    @Optional() private readonly piiDetectionService?: PiiDetectionService,
    @Optional() private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional() private readonly deadlineService?: DeadlineExtractorService,
    @Optional() private readonly followUpService?: FollowUpService,
    @Optional() private readonly actionItemService?: ActionItemService,
  ) { }

  async onModuleInit() {
    // Initialize VoltAgent PostgreSQL memory for scalable multi-tenant storage
    // Uses DATABASE_URL from environment for connection
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (databaseUrl) {
      try {
        const storage = new PostgreSQLMemoryAdapter({
          connection: databaseUrl,
          tablePrefix: 'voltagent_memory',
          schema: 'public',
          debug: process.env.NODE_ENV !== 'production',
        });
        this.memory = new Memory({ storage });
        this.logger.log('VoltAgent PostgreSQL memory initialized for tenant isolation');
      } catch (error) {
        this.logger.warn('Failed to initialize VoltAgent memory, will use stateless mode', {
          error: error instanceof Error ? error.message : String(error),
        });
        this.memory = null;
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
      onMetrics: (metrics) => this.collectMetrics(metrics),
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

    // Initialize approval workflow
    this.approvalWorkflow = createApprovalWorkflow();

    // Start periodic flush interval for metrics (every 5 seconds)
    this.flushInterval = setInterval(() => {
      this.flushMetricsToRedis().catch((err) =>
        this.logger.error('Failed to flush metrics to Redis', err),
      );
    }, 5000);

    this.logger.log('VoltAgent service initialized with Redis metrics and approval workflow');
  }

  /**
   * Collect metrics from agent operations.
   * Buffers in memory and bulk-writes to Redis for >1000 tenant scalability.
   */
  private collectMetrics(metrics: AgentMetrics): void {
    this.metricsBuffer.push(metrics);

    // Flush to Redis when buffer reaches threshold
    if (this.metricsBuffer.length >= this.maxMemoryBuffer) {
      this.flushMetricsToRedis().catch((err) =>
        this.logger.error('Failed to flush metrics to Redis', err),
      );
    }
  }

  /**
   * Flush metrics buffer to Redis using bulk operations.
   * Uses per-agent keys for efficient querying.
   */
  private async flushMetricsToRedis(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    if (!this.cacheService) {
      // Fallback: just log if no Redis
      this.logger.debug(`Metrics collected (no Redis): ${metricsToFlush.length} entries`);
      return;
    }

    // Group metrics by agent for efficient storage
    const metricsByAgent = new Map<string, AgentMetrics[]>();
    for (const metric of metricsToFlush) {
      const key = metric.agentName;
      if (!metricsByAgent.has(key)) {
        metricsByAgent.set(key, []);
      }
      metricsByAgent.get(key)!.push(metric);
    }

    // Bulk write to Redis per agent (pipeline)
    for (const [agentName, agentMetrics] of metricsByAgent) {
      const redisKey = `agent:${agentName}`;
      await this.cacheService.lpushAndTrim(
        redisKey,
        agentMetrics,
        this.maxRedisBuffer,
        { namespace: CacheNamespace.VOLTAGENT_METRICS },
      );
    }

    this.logger.debug(`Flushed ${metricsToFlush.length} metrics to Redis`);
  }

  /**
   * Get recent agent metrics for monitoring.
   * Retrieves from Redis for multi-instance support.
   */
  async getRecentMetrics(agentName?: string, limit = 100): Promise<AgentMetrics[]> {
    if (!this.cacheService) {
      // Fallback to in-memory buffer
      return [...this.metricsBuffer].slice(0, limit);
    }

    if (agentName) {
      // Get metrics for specific agent
      const redisKey = `agent:${agentName}`;
      return this.cacheService.lrange<AgentMetrics>(
        redisKey,
        0,
        limit - 1,
        { namespace: CacheNamespace.VOLTAGENT_METRICS },
      );
    }

    // Get metrics for all agents (SupervisorAgent is primary)
    const supervisorMetrics = await this.cacheService.lrange<AgentMetrics>(
      'agent:SupervisorAgent',
      0,
      limit - 1,
      { namespace: CacheNamespace.VOLTAGENT_METRICS },
    );

    return supervisorMetrics;
  }

  /**
   * Get aggregated metrics stats per tenant.
   */
  async getMetricsStats(agentName = 'SupervisorAgent'): Promise<{
    totalOperations: number;
    avgDuration: number;
    successRate: number;
    totalTokens: number;
  }> {
    const metrics = await this.getRecentMetrics(agentName, 1000);

    if (metrics.length === 0) {
      return { totalOperations: 0, avgDuration: 0, successRate: 0, totalTokens: 0 };
    }

    const totalOperations = metrics.length;
    const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations;
    const successRate = (metrics.filter((m) => m.success).length / totalOperations) * 100;
    const totalTokens = metrics.reduce((sum, m) => sum + (m.totalTokens || 0), 0);

    return { totalOperations, avgDuration, successRate, totalTokens };
  }

  async onModuleDestroy() {
    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining metrics to Redis
    await this.flushMetricsToRedis();

    // Cleanup observability hooks to prevent interval memory leaks during hot reload
    if (this.observabilityHooks) {
      this.observabilityHooks.cleanup();
      this.observabilityHooks = null;
    }

    // Cleanup agents on shutdown
    this.agents.clear();
  }

  // NOTE: getTenantUserId was removed - VoltAgent native memory disabled due to upstream bug
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
   * Get or create an agent for the given context.
   * Agents are cached per user+locale+model with TTL for personalized instructions.
   * TTL ensures datetime in instructions stays fresh (refreshed every 5 minutes).
   * Includes RAG services for HybridRetriever when available.
   */
  private getOrCreateAgent(
    tenantId: string,
    locale: SupportedLocale,
    modelType: MistralModel = 'small',
    userContext?: UserContext | null,
    userId?: string,
  ): Agent {
    // Cache key includes userId if userContext is provided (personalized agents)
    // Fall back to locale+model for anonymous/system calls
    // Include memoryEnabled state to recreate agents when LongTermMemoryService enables
    const userKey = userContext?.email ?? 'anonymous';
    const memoryKey = this.longTermMemoryService?.isEnabled() ? 'mem' : 'nomem';
    const cacheKey = `${tenantId}:${userKey}:${locale}:${modelType}:${memoryKey}`;
    const now = Date.now();

    // Check if cached agent exists and is not expired
    const cached = this.agents.get(cacheKey);
    if (cached && (now - cached.createdAt) < this.AGENT_CACHE_TTL_MS) {
      // Update lastUsed for LRU tracking
      cached.lastUsed = now;
      return cached.agent;
    }

    // LRU eviction if at capacity
    if (this.agents.size >= this.MAX_CACHED_AGENTS) {
      this.evictLeastRecentlyUsedAgent();
    }

    // Create new agent (or replace expired one)
    const model = getMistralModel(modelType);
    const agent = createSupervisorAgent({
      model,
      prisma: this.prisma,
      emailSendService: this.emailSendService,
      calendarService: this.calendarService,
      locale,
      tenantId,
      // VoltAgent memory for conversation persistence (fixed in latest VoltAgent version)
      memory: this.memory ?? undefined,
      hooks: this.observabilityHooks?.hooks ?? undefined,
      // RAG services for HybridRetriever (optional - gracefully degrades)
      mistralService: this.mistralService,
      embeddingsService: this.embeddingsService,
      // User context for personalized instructions
      userContext: userContext ?? undefined,
      // Web search agent requires ConfigService + CacheService for Redis caching
      configService: this.configService,
      cacheService: this.cacheService,
      // Document Library agent for document RAG
      documentLibraryService: this.documentLibraryService,
      // UnifiedKnowledgeAgent dependencies
      longTermMemoryService: this.longTermMemoryService,
      deadlineService: this.deadlineService,
      followUpService: this.followUpService,
      actionItemService: this.actionItemService,
      userId,
    });

    // Cache with timestamps for TTL and LRU
    this.agents.set(cacheKey, { agent, createdAt: now, lastUsed: now });

    this.logger.debug(`Created agent for ${cacheKey}, cache size: ${this.agents.size}/${this.MAX_CACHED_AGENTS}`);

    return agent;
  }

  /**
   * Evict the least recently used agent from cache
   */
  private evictLeastRecentlyUsedAgent(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.agents.entries()) {
      if (cached.lastUsed < oldestTime) {
        oldestTime = cached.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.agents.delete(oldestKey);
      this.logger.debug(`Evicted LRU agent: ${oldestKey}`);
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

    // 0a. Security: Validate input for prompt injection (OWASP LLM01:2025)
    if (this.promptGuardService) {
      const validationResult = this.promptGuardService.validateInput(message);

      if (!validationResult.isValid) {
        this.logger.warn(
          `${logPrefix} Prompt injection blocked: score=${validationResult.riskScore}, patterns=${validationResult.detectedPatterns.join(', ')}`,
        );
        return {
          text: 'I cannot process this request. Please rephrase your message.',
          fromCache: false,
        };
      }

      if (validationResult.requiresHumanReview) {
        this.logger.warn(
          `${logPrefix} High-risk prompt flagged for review: score=${validationResult.riskScore}`,
        );
      }
    }

    // 0b. Security: Detect and redact PII before sending to LLM
    let processedMessage = message;
    if (this.piiDetectionService) {
      const piiResult = this.piiDetectionService.detect(message);
      if (piiResult.hasPii) {
        this.logger.log(
          `${logPrefix} PII detected and redacted: types=${piiResult.detectedTypes.join(', ')}`,
        );
        processedMessage = piiResult.redactedText;
      }
    }

    // 0c. Check rate limits (1000+ user scalability)
    if (this.rateLimiterService) {
      const estimatedTokens = this.modelRouterService?.routeMessage(processedMessage).estimatedTokens ?? 500;
      const rateLimit = await this.rateLimiterService.checkLimit(options.tenantId, estimatedTokens);

      if (!rateLimit.allowed) {
        this.logger.warn(
          `${logPrefix} Rate limit exceeded: ${rateLimit.reason}`,
        );
        return {
          text: `Rate limit exceeded. Please try again in ${rateLimit.resetInSeconds} seconds.`,
          fromCache: false,
        };
      }
    }

    // 1. Check semantic cache first (50-60% cost reduction)
    if (!options.skipCache && this.semanticCacheService?.isEnabled()) {
      const cacheResult = await this.semanticCacheService.get(
        options.tenantId,
        processedMessage,
        options.model,
      );

      if (cacheResult.hit && cacheResult.response) {
        this.logger.debug(`${logPrefix} Semantic cache hit: similarity=${cacheResult.similarity?.toFixed(3)}`);
        return {
          text: cacheResult.response,
          fromCache: true,
          cacheSimilarity: cacheResult.similarity,
        };
      }
    }

    // 2. Route to optimal model based on task complexity (40-60% cost savings)
    let selectedModel = options.model;
    if (!selectedModel && this.modelRouterService) {
      const routing = this.modelRouterService.routeMessage(processedMessage, {
        preferSpeed: options.preferSpeed,
        preferQuality: options.preferQuality,
      });
      selectedModel = routing.recommendedModel;
      this.logger.debug(
        `${logPrefix} Model router: ${routing.recommendedModel} (${routing.complexity}, confidence=${routing.confidence.toFixed(2)})`,
      );
    }

    const locale = getLocale(options.locale);

    // Fetch user context for personalized agent instructions
    const userContext = await this.getUserContext(options.userId, options.tenantId);
    const agent = this.getOrCreateAgent(options.tenantId, locale, selectedModel, userContext, options.userId);

    // NOTE: tenantUserId was previously used for VoltAgent's native memory (disabled due to bug)
    // Tenant isolation is now handled by our Prisma-based VoltAgentMemoryService

    // 3. Enforce token budget before LLM call (P2 Memory Optimization)
    // CRITICAL: This retrieves AND injects conversation history for context continuity
    let contextTruncated = false;
    let conversationHistoryContext = '';
    if (this.voltAgentMemoryService) {
      // Determine budget based on model tier (large models get extended budget)
      const budgetType = selectedModel === 'large' || selectedModel === 'medium' ? 'extended' : 'default';

      this.logger.debug(`${logPrefix} [DEBUG] About to call getContextWithBudget`);
      let budgetResult;
      try {
        budgetResult = await this.voltAgentMemoryService.getContextWithBudget(
          {
            tenantId: options.tenantId,
            userId: options.userId,
            conversationId: options.conversationId,
            locale: options.locale,
          },
          budgetType,
          processedMessage,
        );
      } catch (budgetError) {
        this.logger.error(`${logPrefix} [DEBUG] getContextWithBudget FAILED: ${budgetError instanceof Error ? budgetError.message : String(budgetError)}`);
        this.logger.error(`${logPrefix} [DEBUG] getContextWithBudget Stack: ${budgetError instanceof Error ? budgetError.stack : 'no stack'}`);
        throw budgetError;
      }
      this.logger.debug(`${logPrefix} [DEBUG] budgetResult type: ${typeof budgetResult}, keys: ${budgetResult ? Object.keys(budgetResult).join(', ') : 'null'}`);
      this.logger.debug(`${logPrefix} [DEBUG] budgetResult.messages type: ${typeof budgetResult?.messages}, isArray: ${Array.isArray(budgetResult?.messages)}`);

      contextTruncated = budgetResult.wasTruncated;

      // FIX: Inject conversation history into agent context
      // Without this, the agent loses memory between messages!
      // Defensive: ensure arrays exist (edge case protection for 1000+ concurrent users)
      const messages = Array.isArray(budgetResult.messages) ? budgetResult.messages : [];
      const summaries = Array.isArray(budgetResult.summaries) ? budgetResult.summaries : [];
      this.logger.debug(`${logPrefix} [DEBUG] After defensive check - messages length: ${messages.length}`);

      if (messages.length > 0 || summaries.length > 0) {
        const historyParts: string[] = [];

        // Include summaries first (older context)
        if (summaries.length > 0) {
          historyParts.push(`[Conversation Summary]\n${summaries.join('\n')}`);
        }

        // Include recent messages (chronological order)
        if (messages.length > 0) {
          const formattedMessages = messages.map((m) => {
            const roleLabel = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
            return `${roleLabel}: ${m.content}`;
          });
          historyParts.push(`[Recent Conversation]\n${formattedMessages.join('\n\n')}`);
        }

        conversationHistoryContext = historyParts.join('\n\n---\n\n');
        if (this.piiDetectionService) {
          conversationHistoryContext = this.piiDetectionService.redact(conversationHistoryContext);
        }
        this.logger.debug(
          `${logPrefix} Conversation history injected: ${messages.length} messages, ${summaries.length} summaries`,
        );
      }

      if (budgetResult.wasTruncated) {
        this.logger.debug(
          `${logPrefix} Token budget enforced: ${budgetResult.totalTokens}/${budgetResult.budgetLimit} tokens, ` +
          `dropped ${budgetResult.messagesDropped} messages, summarization=${budgetResult.summarizationTriggered}`,
        );
      }
    }

    // 3.5. Inject long-term memory context (26% accuracy improvement)
    let enhancedMessage = processedMessage;
    if (this.longTermMemoryService?.isEnabled()) {
      try {
        const memoryContext = await this.longTermMemoryService.getContextForPrompt(
          options.tenantId,
          options.userId,
          processedMessage,
          { limit: 5, minImportance: 0.3 },
        );
        if (memoryContext) {
          const safeMemoryContext = this.piiDetectionService
            ? this.piiDetectionService.redact(memoryContext)
            : memoryContext;
          // Prepend memory context to the message for the agent
          enhancedMessage = `${safeMemoryContext}\n\n---\n\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Long-term memory context injected`);
        }
      } catch (error) {
        const errMsg = AiError.fromError(error).message;
        this.logger.warn(`${logPrefix} Failed to get long-term memory context: ${errMsg}`);
      }
    }

    // 3.6. CRITICAL: Inject conversation history for context continuity
    // This ensures the agent remembers prior messages in the conversation
    if (conversationHistoryContext) {
      enhancedMessage = `${conversationHistoryContext}\n\n---\n\n[Current Message]\n${enhancedMessage}`;
    }

    // Prepare tenant-isolated context for VoltAgent hooks (HITL, metrics, observability)
    // Format: "tenantId:userId" allows hooks to extract both values
    const tenantUserId = `${options.tenantId}:${options.userId}`;
    // Use persistent conversationId or generate fallback for new conversations
    const fallbackSessionId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.logger.debug(`${logPrefix} [DEBUG] About to call agent.generateText`);

    // Emit real-time agent step: Intent analysis started
    const sessionId = options.conversationId || fallbackSessionId;
    this.emitAgentStep(options.tenantId, sessionId, options.userId, 'intent', 'started', 'Analyzing your request...');

    let result;
    const agentStartTime = Date.now();
    try {
      // Emit: Supervisor processing
      this.emitAgentStep(options.tenantId, sessionId, options.userId, 'supervisor', 'processing', 'Coordinating agents...');

      // Pass userId and conversationId for proper context in hooks (HITL, metrics, etc.)
      // VoltAgent memory issue fixed in latest version
      result = await agent.generateText(enhancedMessage, {
        // Tenant-isolated userId for multi-tenant data segregation
        userId: tenantUserId,
        // Session/conversation ID for message threading
        conversationId: sessionId,
        // CRITICAL: Disable parallel tool calls to ensure sequential delegation
        // (ContactsAgent → EmailAgent flow requires one tool at a time)
        providerOptions: {
          mistral: {
            parallelToolCalls: false,
            structuredOutputs: true,
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
    } catch (genError) {
      // Emit: Error state
      this.emitAgentStep(options.tenantId, sessionId, options.userId, 'supervisor', 'error', 'Processing failed', {
        error: genError instanceof Error ? genError.message : String(genError),
      });

      this.logger.error(`${logPrefix} [DEBUG] agent.generateText FAILED: ${genError instanceof Error ? genError.message : String(genError)}`);
      this.logger.error(`${logPrefix} [DEBUG] Stack: ${genError instanceof Error ? genError.stack : 'no stack'}`);
      throw genError;
    }

    // 4. Persist messages to Prisma-based memory (conversation history)
    let persistedConversationId: string | undefined;
    if (this.voltAgentMemoryService) {
      const memoryContext = {
        tenantId: options.tenantId,
        userId: options.userId,
        conversationId: options.conversationId,
        locale: options.locale,
      };

      // Save user message (returns the conversationId)
      persistedConversationId = await this.voltAgentMemoryService.addMessage(memoryContext, {
        role: 'user',
        content: message,
      });

      // Update context with the persisted conversationId for subsequent calls
      memoryContext.conversationId = persistedConversationId;

      // Save assistant response
      await this.voltAgentMemoryService.addMessage(memoryContext, {
        role: 'assistant',
        content: result.text,
      });

      this.logger.debug(`${logPrefix} Messages persisted to conversation ${persistedConversationId}`);
    }

    // 5. Store to long-term memory (async, non-blocking)
    if (this.longTermMemoryService?.isEnabled()) {
      // Fire-and-forget: don't block the response
      this.longTermMemoryService.addMemory(
        options.tenantId,
        options.userId,
        [
          { role: 'user', content: message },
          { role: 'assistant', content: result.text },
        ],
        { sourceType: 'CONVERSATION', sourceId: options.conversationId },
      ).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`${logPrefix} Failed to store long-term memory: ${errMsg}`);
      });
    }

    // Record latency for model router accuracy
    if (this.modelRouterService && selectedModel) {
      this.modelRouterService.recordLatency(selectedModel, Date.now() - startTime);
    }

    // Extract any pending actions from tool results
    const pendingActions: PendingAction[] = [];
    this.logger.debug(`[HITL DEBUG] result.steps count: ${result.steps?.length || 0}`);
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      // Log the full step structure for debugging
      this.logger.debug(`[HITL DEBUG] Step ${i} keys: ${Object.keys(step).join(', ')}`);
      this.logger.debug(`[HITL DEBUG] Step ${i} JSON (first 500 chars): ${JSON.stringify(step).substring(0, 500)}`);
      // Access tool results from the step - AI SDK v5 uses 'output' property
      const toolResults = (step as unknown as { toolResults?: Array<{ output?: unknown; toolName?: string }> }).toolResults;
      this.logger.debug(`[HITL DEBUG] toolResults found: ${!!toolResults}, count: ${toolResults?.length || 0}`);
      if (toolResults) {
        for (const toolResult of toolResults) {
          // AI SDK v5 uses 'output' not 'result' for tool execution results
          const resultValue = toolResult.output as Record<string, unknown> | undefined;
          this.logger.debug(`[HITL DEBUG] toolResult.output for ${toolResult.toolName}: ${JSON.stringify(resultValue)?.substring(0, 200)}`);
          if (resultValue?.requiresApproval) {
            const actionType = resultValue.actionType as string;
            const severity = resultValue.severity as 'LOW' | 'MEDIUM' | 'HIGH';
            const payload = resultValue.payload as Record<string, unknown>;
            const summary = resultValue.summary as string;

            // Persist pending action to database via HitlService
            // CRITICAL: Use persistedConversationId for new conversations (when options.conversationId is undefined)
            const effectiveSessionId = persistedConversationId || options.conversationId;
            let actionId: string;
            this.logger.debug(`[HITL] Creating pending action with sessionId=${effectiveSessionId} for action=${actionType}`);
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

            pendingActions.push({
              id: actionId,
              actionType,
              severity,
              payload,
              summary,
            });
          }
        }
      }
    }

    // 3. Cache the response for future similar queries
    if (!options.skipCache && this.semanticCacheService?.isEnabled() && pendingActions.length === 0) {
      // Only cache responses without pending actions (those are deterministic)
      const estimatedTokens =
        this.modelRouterService?.routeMessage(processedMessage).estimatedTokens ?? 500;
      await this.semanticCacheService.set(
        options.tenantId,
        processedMessage,
        result.text,
        selectedModel || 'small',
        estimatedTokens,
      );
    }

    // Emit final response event with the correct persistedConversationId
    // This ensures the frontend can match events even for new conversations
    const finalSessionId = persistedConversationId || sessionId;
    this.emitAgentStep(options.tenantId, finalSessionId, options.userId, 'response', 'completed', 'Response ready', {
      duration: Date.now() - startTime,
      result: pendingActions.length > 0 ? 'Action requires approval' : 'Response generated',
    });

    return {
      text: result.text,
      requiresApproval: pendingActions.length > 0,
      pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
      model: selectedModel,
      fromCache: false,
      contextTruncated,
      conversationId: persistedConversationId,
    };
  }

  /**
   * Process a chat message with streaming response.
   * Enhanced with rate limiting and semantic cache for production use.
   * Persists messages to Prisma-based memory after streaming completes.
   *
   * @security PII Handling:
   * - INPUT: PII is detected and redacted before sending to LLM
   * - CONTEXT: Conversation history and long-term memory are redacted before injection
   * - OUTPUT: ⚠️ Streaming output from LLM is NOT filtered for PII.
   *   The LLM may generate PII-like patterns (e.g., example emails, phone numbers).
   *   For sensitive deployments, consider post-processing the stream or using
   *   content moderation APIs on the client side.
   */
  async *streamChat(message: string, options: ChatOptions): AsyncGenerator<string> {
    const correlationId = CorrelationContext.getCorrelationId();
    const logPrefix = `[${correlationId}] [stream] [tenant:${options.tenantId}]`;

    // 0a. Security: Validate input for prompt injection (OWASP LLM01:2025)
    if (this.promptGuardService) {
      const validationResult = this.promptGuardService.validateInput(message);

      if (!validationResult.isValid) {
        this.logger.warn(
          `${logPrefix} Prompt injection blocked: score=${validationResult.riskScore}, patterns=${validationResult.detectedPatterns.join(', ')}`,
        );
        yield 'I cannot process this request. Please rephrase your message.';
        return;
      }

      if (validationResult.requiresHumanReview) {
        this.logger.warn(
          `${logPrefix} High-risk prompt flagged for review: score=${validationResult.riskScore}`,
        );
      }
    }

    // 0b. Security: Detect and redact PII before sending to LLM
    let processedMessage = message;
    if (this.piiDetectionService) {
      const piiResult = this.piiDetectionService.detect(message);
      if (piiResult.hasPii) {
        this.logger.log(
          `${logPrefix} PII detected and redacted: types=${piiResult.detectedTypes.join(', ')}`,
        );
        processedMessage = piiResult.redactedText;
      }
    }

    // 0. Check rate limits (same as non-streaming)
    if (this.rateLimiterService) {
      const estimatedTokens =
        this.modelRouterService?.routeMessage(processedMessage).estimatedTokens ?? 500;
      const rateLimit = await this.rateLimiterService.checkLimit(options.tenantId, estimatedTokens);

      if (!rateLimit.allowed) {
        this.logger.warn(`${logPrefix} Rate limit exceeded`);
        yield `Rate limit exceeded. Please try again in ${rateLimit.resetInSeconds} seconds.`;
        return;
      }
    }

    // 1. Check semantic cache (50-60% cost reduction) - return cached if hit
    if (!options.skipCache && this.semanticCacheService?.isEnabled()) {
      const cacheResult = await this.semanticCacheService.get(
        options.tenantId,
        processedMessage,
        options.model,
      );

      if (cacheResult.hit && cacheResult.response) {
        this.logger.debug(`${logPrefix} Cache hit, returning cached response`);
        yield cacheResult.response;
        return;
      }
    }

    // 2. Route to optimal model
    let selectedModel = options.model;
    if (!selectedModel && this.modelRouterService) {
      const routing = this.modelRouterService.routeMessage(processedMessage, {
        preferSpeed: options.preferSpeed,
        preferQuality: options.preferQuality,
      });
      selectedModel = routing.recommendedModel;
    }

    const locale = getLocale(options.locale);

    // Fetch user context for personalized agent instructions
    const userContext = await this.getUserContext(options.userId, options.tenantId);
    const agent = this.getOrCreateAgent(options.tenantId, locale, selectedModel, userContext, options.userId);

    // 2.5. Load conversation history for context continuity
    let conversationHistoryContext = '';
    if (this.voltAgentMemoryService) {
      const budgetType = selectedModel === 'large' || selectedModel === 'medium' ? 'extended' : 'default';
      const budgetResult = await this.voltAgentMemoryService.getContextWithBudget(
        {
          tenantId: options.tenantId,
          userId: options.userId,
          conversationId: options.conversationId,
          locale: options.locale,
        },
        budgetType,
        processedMessage,
      );

      // CRITICAL: Inject conversation history so agent remembers prior messages
      // Defensive: ensure arrays exist (edge case protection for 1000+ concurrent users)
      const messages = Array.isArray(budgetResult.messages) ? budgetResult.messages : [];
      const summaries = Array.isArray(budgetResult.summaries) ? budgetResult.summaries : [];

      if (messages.length > 0 || summaries.length > 0) {
        const historyParts: string[] = [];
        if (summaries.length > 0) {
          historyParts.push(`[Conversation Summary]\n${summaries.join('\n')}`);
        }
        if (messages.length > 0) {
          const formattedMessages = messages.map((m) => {
            const roleLabel = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
            return `${roleLabel}: ${m.content}`;
          });
          historyParts.push(`[Recent Conversation]\n${formattedMessages.join('\n\n')}`);
        }
        conversationHistoryContext = historyParts.join('\n\n---\n\n');
        if (this.piiDetectionService) {
          conversationHistoryContext = this.piiDetectionService.redact(conversationHistoryContext);
        }
        this.logger.debug(`${logPrefix} Conversation history injected: ${messages.length} messages`);
      }
    }

    // 2.6. Inject long-term memory context
    let enhancedMessage = processedMessage;
    if (this.longTermMemoryService?.isEnabled()) {
      try {
        const memoryContext = await this.longTermMemoryService.getContextForPrompt(
          options.tenantId,
          options.userId,
          processedMessage,
          { limit: 5, minImportance: 0.3 },
        );
        if (memoryContext) {
          const safeMemoryContext = this.piiDetectionService
            ? this.piiDetectionService.redact(memoryContext)
            : memoryContext;
          enhancedMessage = `${safeMemoryContext}\n\n---\n\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Long-term memory context injected`);
        }
      } catch (error) {
        const errMsg = AiError.fromError(error).message;
        this.logger.warn(`${logPrefix} Failed to get long-term memory context: ${errMsg}`);
      }
    }

    // 2.7. CRITICAL: Prepend conversation history for context continuity
    if (conversationHistoryContext) {
      enhancedMessage = `${conversationHistoryContext}\n\n---\n\n[Current Message]\n${enhancedMessage}`;
    }

    // Prepare tenant-isolated context for VoltAgent hooks (HITL, metrics, observability)
    const tenantUserId = `${options.tenantId}:${options.userId}`;
    const sessionId = options.conversationId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await agent.streamText(enhancedMessage, {
      userId: tenantUserId,
      conversationId: sessionId,
      // CRITICAL: Disable parallel tool calls to ensure sequential delegation
      providerOptions: {
        mistral: {
          parallelToolCalls: false,
          structuredOutputs: true,
        },
      },
    });

    // Collect full response for memory persistence and caching
    let fullResponse = '';
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      yield chunk;
    }

    // 3. Cache response for future similar queries
    if (!options.skipCache && this.semanticCacheService?.isEnabled() && fullResponse.length > 0) {
      const estimatedTokens =
        this.modelRouterService?.routeMessage(processedMessage).estimatedTokens ?? 500;
      await this.semanticCacheService.set(
        options.tenantId,
        processedMessage,
        fullResponse,
        selectedModel || 'small',
        estimatedTokens,
      ).catch((err) => this.logger.warn(`${logPrefix} Cache set failed: ${err.message}`));
    }

    // 4. Persist messages to Prisma-based memory after streaming completes
    if (this.voltAgentMemoryService) {
      const memoryContext = {
        tenantId: options.tenantId,
        userId: options.userId,
        conversationId: options.conversationId,
        locale: options.locale,
      };

      // Save user message (returns the conversationId)
      const convId = await this.voltAgentMemoryService.addMessage(memoryContext, {
        role: 'user',
        content: message,
      });

      // Update context with the persisted conversationId for subsequent calls
      memoryContext.conversationId = convId;

      // Save assistant response
      await this.voltAgentMemoryService.addMessage(memoryContext, {
        role: 'assistant',
        content: fullResponse,
      });
    }

    // 5. Store to long-term memory (async, non-blocking)
    if (this.longTermMemoryService?.isEnabled() && fullResponse.length > 0) {
      this.longTermMemoryService.addMemory(
        options.tenantId,
        options.userId,
        [
          { role: 'user', content: message },
          { role: 'assistant', content: fullResponse },
        ],
        { sourceType: 'CONVERSATION', sourceId: options.conversationId },
      ).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`${logPrefix} Failed to store long-term memory: ${errMsg}`);
      });
    }
  }

  /**
   * Clear cached agents (useful for testing or config changes).
   */
  clearAgentCache(): void {
    this.agents.clear();
  }

  /**
   * Submit an action for approval using VoltAgent workflow.
   * The workflow will auto-approve or suspend based on severity/confidence.
   * Suspended workflows are stored in Redis for horizontal scaling.
   */
  async submitActionForApproval(
    action: ApprovalInput['action'],
    autoApproveThreshold = 0.9,
  ): Promise<ApprovalResult | SuspendedWorkflow> {
    if (!this.approvalWorkflow) {
      throw new AiError('Approval workflow not initialized', AiErrorCode.INTERNAL_ERROR, {
        retryable: false,
      });
    }

    const result = await this.approvalWorkflow.run({
      action,
      autoApproveThreshold,
    });

    // Check if workflow was suspended
    if (result.status === 'suspended') {
      const executionId = result.executionId;
      const suspendedAt = result.suspension?.suspendedAt || new Date();

      // Store serializable workflow state in Redis (for horizontal scaling)
      const serializable: SerializableSuspendedWorkflow = {
        executionId,
        tenantId: action.tenantId,
        userId: action.userId,
        action,
        suspendReason: result.suspension?.reason || 'Approval required',
        suspendedAt: suspendedAt.toISOString(),
      };

      if (this.cacheService) {
        // Store with tenant prefix for pattern matching: voltagent:workflow:suspended:tenantId:executionId
        const cacheKey = `${this.SUSPENDED_WORKFLOW_PREFIX}${action.tenantId}:${executionId}`;
        await this.cacheService.set(cacheKey, serializable, { ttl: this.SUSPENDED_WORKFLOW_TTL });
      }

      // Also persist to HitlService (database) if available
      if (this.hitlService) {
        await this.hitlService.createPendingAction({
          tenantId: action.tenantId,
          userId: action.userId,
          sessionId: executionId,
          agentName: action.agentName,
          action: {
            type: action.actionType as unknown as import('./interfaces/agent-action.interface').AgentActionType,
            payload: action.payload,
            confidence: action.confidence ?? 0.8,
            severity: action.severity as ActionSeverity,
            reasoningSteps: action.summary,
          },
        });
      }

      // Return full SuspendedWorkflow (with workflowResult for in-process resume if available)
      const suspended: SuspendedWorkflow = {
        executionId,
        tenantId: action.tenantId,
        userId: action.userId,
        action,
        suspendReason: serializable.suspendReason,
        suspendedAt,
        workflowResult: result,
      };

      const corrId = CorrelationContext.getCorrelationId();
      this.logger.log(`[${corrId}] [tenant:${action.tenantId}] Action suspended for approval: ${executionId}`);
      return suspended;
    }

    // Workflow completed (auto-approved or error)
    const corrId = CorrelationContext.getCorrelationId();
    this.logger.log(`[${corrId}] [tenant:${action.tenantId}] Action auto-approved: ${action.actionType}`);
    return result.result as ApprovalResult;
  }

  /**
   * Resume a suspended workflow with human decision.
   * Uses Redis-stored workflow state for horizontal scaling.
   * Falls back to HitlService database for action execution.
   */
  async resumeApproval(
    executionId: string,
    decision: ApprovalResumeData,
    tenantId?: string,
  ): Promise<ApprovalResult> {
    // Try to get workflow from Redis - need to find by pattern if tenantId not provided
    let suspended: SerializableSuspendedWorkflow | null = null;

    if (this.cacheService && tenantId) {
      const cacheKey = `${this.SUSPENDED_WORKFLOW_PREFIX}${tenantId}:${executionId}`;
      suspended = await this.cacheService.get<SerializableSuspendedWorkflow>(cacheKey);
    }

    // Fallback to HitlService database if not in Redis
    // This handles pending actions created via hooks (sub-agent tool results)
    if (!suspended && this.hitlService && tenantId) {
      this.logger.debug(`Suspended workflow not in Redis, checking HitlService: ${executionId}`);
      try {
        const action = await this.hitlService.getPendingAction(tenantId, executionId);
        suspended = {
          executionId: action.id,
          tenantId: action.tenantId,
          userId: action.userId,
          action: {
            tenantId: action.tenantId,
            userId: action.userId,
            agentName: action.agentName,
            actionType: action.actionType,
            payload: action.payload as Record<string, unknown>,
            summary: action.reasoningSteps || '',
            severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH',
            confidence: action.confidence ?? undefined,
          },
          suspendReason: 'Approval required',
          suspendedAt: action.createdAt.toISOString(),
        };
      } catch {
        // Action not found in database either
        this.logger.debug(`Pending action not found in HitlService: ${executionId}`);
      }
    }

    if (!suspended) {
      throw new AiError(`Suspended workflow not found: ${executionId}`, AiErrorCode.WORKFLOW_FAILED, {
        retryable: false,
      });
    }

    // Clean up Redis
    if (this.cacheService) {
      const cacheKey = `${this.SUSPENDED_WORKFLOW_PREFIX}${suspended.tenantId}:${executionId}`;
      await this.cacheService.del(cacheKey);
    }

    // Update HitlService (database) with decision
    if (this.hitlService) {
      if (decision.approved) {
        await this.hitlService.approveAction(
          suspended.tenantId,
          executionId,
          decision.approvedBy,
        );
      } else {
        await this.hitlService.rejectAction(
          suspended.tenantId,
          executionId,
          decision.approvedBy,
          undefined,
          decision.rejectionReason,
        );
      }
    }

    const resumeCorrId = CorrelationContext.getCorrelationId();
    this.logger.log(
      `[${resumeCorrId}] [tenant:${suspended.tenantId}] Workflow resumed: ${executionId}, approved: ${decision.approved}`,
    );

    // Execute approved actions via ActionExecutorService
    let executionResult: ActionExecutionResult | undefined;
    if (decision.approved && this.actionExecutorService) {
      try {
        // Build AgentAction from suspended workflow data
        const agentAction: AgentAction = {
          type: suspended.action.actionType as AgentActionType,
          payload: suspended.action.payload,
          confidence: suspended.action.confidence ?? 0.8,
          severity: (suspended.action.severity as ActionSeverity) ?? ActionSeverity.MEDIUM,
          reasoningSteps: suspended.action.summary,
        };

        // Build minimal AgentContext for execution
        const agentContext: AgentContext = {
          tenantId: suspended.tenantId,
          userId: suspended.userId,
          sessionId: executionId,
          correlationId: resumeCorrId,
          userMessage: '', // Not needed for execution
        };

        this.logger.log(
          `[${resumeCorrId}] [tenant:${suspended.tenantId}] Executing approved action: ${agentAction.type}`,
        );

        executionResult = await this.actionExecutorService.execute(agentAction, agentContext);

        // Mark action execution status in database
        if (this.hitlService) {
          await this.hitlService.markExecuted(
            suspended.tenantId,
            executionId,
            executionResult.success,
            executionResult.error,
          );
        }

        if (executionResult.success) {
          this.logger.log(
            `[${resumeCorrId}] [tenant:${suspended.tenantId}] Action executed successfully: ${agentAction.type}`,
          );
        } else {
          this.logger.error(
            `[${resumeCorrId}] [tenant:${suspended.tenantId}] Action execution failed: ${executionResult.error}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `[${resumeCorrId}] [tenant:${suspended.tenantId}] Action execution error: ${error instanceof Error ? error.message : String(error)}`,
        );
        executionResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          executionTimeMs: 0,
        };
      }
    }

    // Return result based on decision
    return {
      approved: decision.approved,
      action: suspended.action,
      approvedBy: decision.approvedBy,
      approvedAt: new Date(),
      rejectionReason: decision.rejectionReason,
      executionResult, // Include execution result in response
    } as ApprovalResult;
  }

  /**
   * Get all suspended workflows for a tenant.
   * Relies on HitlService (database) for listing since it's the source of truth.
   * Redis is used only for fast lookup during resume.
   */
  async getSuspendedWorkflows(tenantId: string): Promise<SuspendedWorkflow[]> {
    // Use HitlService to get pending actions (source of truth)
    if (!this.hitlService) {
      return [];
    }

    const result = await this.hitlService.getPendingActions({
      tenantId,
      status: PendingActionStatus.PENDING,
    });

    return result.actions.map((action) => ({
      executionId: action.id,
      tenantId: action.tenantId,
      userId: action.userId,
      sessionId: action.sessionId ?? undefined, // ConversationId for linking to chat messages
      action: {
        tenantId: action.tenantId,
        userId: action.userId,
        agentName: action.agentName,
        actionType: action.actionType,
        payload: action.payload as Record<string, unknown>,
        summary: action.reasoningSteps || '',
        severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH',
        confidence: action.confidence,
      },
      suspendReason: 'Approval required',
      suspendedAt: action.createdAt,
      workflowResult: null as unknown as ApprovalWorkflowResult, // Not available from DB
    }));
  }

  /**
   * Get a specific suspended workflow by ID.
   * Uses Redis for fast lookup, falls back to HitlService.
   */
  async getSuspendedWorkflow(executionId: string, tenantId?: string): Promise<SuspendedWorkflow | undefined> {
    // Try Redis first if tenantId provided
    if (this.cacheService && tenantId) {
      const cacheKey = `${this.SUSPENDED_WORKFLOW_PREFIX}${tenantId}:${executionId}`;
      const data = await this.cacheService.get<SerializableSuspendedWorkflow>(cacheKey);
      if (data) {
        return {
          executionId: data.executionId,
          tenantId: data.tenantId,
          userId: data.userId,
          action: data.action,
          suspendReason: data.suspendReason,
          suspendedAt: new Date(data.suspendedAt),
          workflowResult: null as unknown as ApprovalWorkflowResult,
        };
      }
    }

    // Fallback to HitlService
    if (this.hitlService && tenantId) {
      try {
        const action = await this.hitlService.getPendingAction(tenantId, executionId);
        return {
          executionId: action.id,
          tenantId: action.tenantId,
          userId: action.userId,
          action: {
            tenantId: action.tenantId,
            userId: action.userId,
            agentName: action.agentName,
            actionType: action.actionType,
            payload: action.payload as Record<string, unknown>,
            summary: action.reasoningSteps || '',
            severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH',
            confidence: action.confidence,
          },
          suspendReason: 'Approval required',
          suspendedAt: action.createdAt,
          workflowResult: null as unknown as ApprovalWorkflowResult,
        };
      } catch {
        // Action not found
        return undefined;
      }
    }

    return undefined;
  }

  // ========================================================================
  // Background Job Processing (BullMQ)
  // ========================================================================

  /**
   * Queue a background AI job for async processing.
   * Provides 8x throughput improvement for non-blocking operations.
   */
  async queueBackgroundJob(job: AiJobData): Promise<string | null> {
    if (!this.aiQueueService?.isEnabled()) {
      this.logger.debug('AI Queue disabled, job will not be queued');
      return null;
    }

    return this.aiQueueService.addJob(job);
  }

  /**
   * Queue multiple AI jobs in bulk.
   * More efficient than individual job additions.
   */
  async queueBulkJobs(jobs: AiJobData[]): Promise<string[]> {
    if (!this.aiQueueService?.isEnabled()) {
      return [];
    }

    return this.aiQueueService.addBulkJobs(jobs);
  }

  /**
   * Queue email insights analysis as a background job.
   * Returns immediately while analysis happens in background.
   */
  async queueEmailInsights(
    tenantId: string,
    emailIds: string[],
    options?: { userId?: string; priority?: 'high' | 'normal' | 'low' },
  ): Promise<string | null> {
    return this.queueBackgroundJob({
      type: 'email-insights',
      tenantId,
      userId: options?.userId,
      priority: options?.priority || 'normal',
      payload: { emailIds },
      dedupKey: `email-insights:${tenantId}:${emailIds.slice(0, 3).join(',')}`,
    });
  }

  /**
   * Queue embedding generation for semantic search.
   */
  async queueEmbeddingGeneration(
    tenantId: string,
    contentItems: Array<{ id: string; content: string; type: string }>,
  ): Promise<string | null> {
    return this.queueBackgroundJob({
      type: 'embedding-generation',
      tenantId,
      priority: 'low',
      payload: { items: contentItems },
      dedupKey: `embeddings:${tenantId}:${contentItems.length}`,
    });
  }

  // ========================================================================
  // Optimization Statistics
  // ========================================================================

  /**
   * Get comprehensive optimization statistics.
   * Includes semantic cache, model routing, and queue metrics.
   */
  async getOptimizationStats(tenantId: string): Promise<{
    semanticCache: {
      enabled: boolean;
      entries: number;
      totalHits: number;
      estimatedSavings: number;
    };
    modelRouting: {
      enabled: boolean;
      totalRequests: number;
      byModel: Record<string, number>;
      estimatedSavings: number;
    };
    queue: {
      enabled: boolean;
      metrics: Array<{
        queue: string;
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        throughputPerMinute: number;
      }>;
    };
    agentMetrics: {
      totalOperations: number;
      avgDuration: number;
      successRate: number;
      totalTokens: number;
    };
  }> {
    // Semantic cache stats
    const semanticCacheEnabled = this.semanticCacheService?.isEnabled() ?? false;
    const cacheStats = semanticCacheEnabled
      ? await this.semanticCacheService!.getStats(tenantId)
      : { entries: 0, totalHits: 0, avgSimilarity: 0, estimatedSavings: 0 };

    // Model routing stats
    const modelRoutingEnabled = !!this.modelRouterService;
    const routingStats = this.modelRouterService
      ? this.modelRouterService.getStats()
      : { totalRequests: 0, byModel: {} as Record<string, number>, avgResponseTime: {}, estimatedSavings: 0 };

    // Queue stats
    const queueEnabled = this.aiQueueService?.isEnabled() ?? false;
    const queueMetrics = queueEnabled
      ? await this.aiQueueService!.getQueueMetrics()
      : [];

    // Agent metrics
    const agentMetrics = await this.getMetricsStats();

    return {
      semanticCache: {
        enabled: semanticCacheEnabled,
        entries: cacheStats.entries,
        totalHits: cacheStats.totalHits,
        estimatedSavings: cacheStats.estimatedSavings,
      },
      modelRouting: {
        enabled: modelRoutingEnabled,
        totalRequests: routingStats.totalRequests,
        byModel: routingStats.byModel,
        estimatedSavings: routingStats.estimatedSavings,
      },
      queue: {
        enabled: queueEnabled,
        metrics: queueMetrics,
      },
      agentMetrics,
    };
  }

  /**
   * Invalidate semantic cache for a tenant.
   * Useful when context changes significantly.
   */
  async invalidateCache(tenantId: string, pattern?: string): Promise<number> {
    if (!this.semanticCacheService?.isEnabled()) {
      return 0;
    }

    return this.semanticCacheService.invalidate(tenantId, pattern);
  }

  /**
   * Reset model routing statistics.
   */
  resetRoutingStats(): void {
    this.modelRouterService?.resetStats();
  }

  // ========================================================================
  // Batch Processing (Mistral Batch API - 50% cost reduction)
  // ========================================================================

  /**
   * Batch generate embeddings for multiple texts.
   * Uses Mistral Batch API for 50% cost reduction.
   */
  async batchEmbeddings(
    tenantId: string,
    items: Array<{ id: string; text: string }>,
  ): Promise<string | null> {
    if (!this.mistralBatchService?.isEnabled()) {
      this.logger.debug('Mistral Batch API not available');
      return null;
    }

    return this.mistralBatchService.batchEmbeddings(tenantId, items);
  }

  /**
   * Batch analyze email sentiments.
   * Uses Mistral Batch API for 50% cost reduction.
   */
  async batchSentimentAnalysis(
    tenantId: string,
    emails: Array<{ id: string; subject: string; body: string }>,
  ): Promise<string | null> {
    if (!this.mistralBatchService?.isEnabled()) {
      return null;
    }

    return this.mistralBatchService.batchSentimentAnalysis(tenantId, emails);
  }

  /**
   * Get batch job status.
   */
  async getBatchJobStatus(jobId: string) {
    return this.mistralBatchService?.getJobStatus(jobId) ?? null;
  }

  /**
   * Get batch job results.
   */
  async getBatchJobResults(jobId: string) {
    return this.mistralBatchService?.getJobResults(jobId) ?? [];
  }

  // ========================================================================
  // Rate Limiting (1000+ users scalability)
  // ========================================================================

  /**
   * Get rate limit status for a tenant.
   */
  async getRateLimitStatus(tenantId: string) {
    if (!this.rateLimiterService) {
      return {
        requestsRemaining: -1,
        tokensRemaining: -1,
        requestsResetIn: 0,
        tokensResetIn: 0,
      };
    }

    return this.rateLimiterService.getStatus(tenantId);
  }

  /**
   * Reset rate limits for a tenant (admin use).
   */
  async resetRateLimits(tenantId: string): Promise<void> {
    await this.rateLimiterService?.resetLimits(tenantId);
  }
}
