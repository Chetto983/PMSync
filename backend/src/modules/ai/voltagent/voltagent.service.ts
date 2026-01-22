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
import { WritingStyleService } from './services/writing-style.service';
import { ModelRouterService } from './services/model-router.service';
// Phase 3: Consolidated agents (10 → 3)
import { createActionsAgent } from './agents/actions.agent';
import { createIntelligenceAgent } from './agents/intelligence.agent';
import { createSupervisorAgent, type SupervisorAgentOptions as _SupervisorAgentOptions, UserContext } from './agents/supervisor.agent';
import { createWebSearchAgent as _createWebSearchAgent } from './agents/websearch.agent';
import { createDocumentLibraryAgent as _createDocumentLibraryAgent } from './agents/document-library.agent';
import { createAnalyticsAgent as _createAnalyticsAgent } from './agents/analytics.agent';
import { AiQueueService, type AiJobData } from './services/ai-queue.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { AiError, AiErrorCode } from '../errors';
import { MistralBatchService } from './services/mistral-batch.service';
import { AgentAction, AgentActionType, ActionSeverity } from './interfaces/agent-action.interface';
import { AgentContext } from './interfaces/agent-context.interface';
import { type ConnectedProvider } from './agents';
import { getLocale, getTranslations, getErrorTranslations, type SupportedLocale } from './locales';
import { DocumentLibraryService } from './services/document-library.service';
import { PromptGuardService, PiiDetectionService, PiiResolutionService } from '../guards';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import type { AiAgentType } from '../../realtime/types/realtime.types';
import { FollowUpService } from './services/follow-up.service';
import { createObservabilityHooks, type AgentMetrics, type DisposableHooks } from './observability';
import { getMistralModel, type MistralModel } from './providers/mistral.provider';
import { EpisodicMemoryService } from './services/episodic-memory.service';
import { ConversationCompactionService, type ConversationMessage } from './services/conversation-compaction.service';
import { ConversationManagementService } from './services/conversation-management.service';
import {
  createApprovalWorkflow,
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from './workflows';
import { MemoryIntelligenceService } from './services/memory-intelligence.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';

/**
 * Sanitize LLM response to remove accidentally echoed internal context markers.
 * These markers are injected for LLM context but should never appear in user-facing responses.
 *
 * @param text - Raw LLM response text
 * @returns Sanitized text with internal markers removed
 */
function sanitizeLlmResponse(text: string): string {
  if (!text) return text;

  return text
    // Remove [Conversation History]...[Current Message] blocks
    .replace(/\[Conversation History\][\s\S]*?\[Current Message\]\s*/gi, '')
    // Remove [Conversation Summary...] headers
    .replace(/\[Conversation Summary[^\]]*\]\s*/gi, '')
    // Remove [Key Context] sections
    .replace(/\[Key Context\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    // Remove [Recent Messages] sections
    .replace(/\[Recent Messages\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    // Remove [User Memory]...--- blocks
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    // Remove ## Learned Constraints sections
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |$)/gi, '')
    // Remove standalone internal markers
    .replace(/\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/gi, '')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

/**
 * Extract properties stored in ActionQueue.actionPayload JSON field.
 * AI refactor v2.0: agentName, sessionId, severity, payload moved to JSON.
 */
function extractActionPayload(actionPayload: unknown): {
  agentName: string;
  sessionId: string | undefined;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
} {
  const data = (typeof actionPayload === 'object' && actionPayload !== null)
    ? actionPayload as Record<string, unknown>
    : {};
  return {
    agentName: (data.agentName as string) || 'SupervisorAgent',
    sessionId: data.sessionId as string | undefined,
    severity: (data.severity as 'LOW' | 'MEDIUM' | 'HIGH') || 'LOW',
    payload: data,
  };
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
    @Optional() private readonly modelRouterService?: ModelRouterService,
    @Optional() private readonly aiQueueService?: AiQueueService,
    @Optional() private readonly rateLimiterService?: RateLimiterService,
    @Optional() private readonly mistralBatchService?: MistralBatchService,
    @Optional() private readonly episodicMemoryService?: EpisodicMemoryService,
    @Optional() private readonly documentLibraryService?: DocumentLibraryService,
    @Optional() private readonly promptGuardService?: PromptGuardService,
    @Optional() private readonly piiDetectionService?: PiiDetectionService,
    @Optional() private readonly piiResolutionService?: PiiResolutionService,
    @Optional() private readonly realtimeEventsService?: RealtimeEventsService,
    @Optional() private readonly followUpService?: FollowUpService,
    @Optional() private readonly writingStyleService?: WritingStyleService,
    @Optional() private readonly compactionService?: ConversationCompactionService,
    @Optional() private readonly conversationService?: ConversationManagementService,
    @Optional() private readonly memoryIntelligenceService?: MemoryIntelligenceService,
    @Optional() private readonly usageTrackingService?: UsageTrackingService,
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
    agentType: import('./services/model-router.service').AgentType = 'Supervisor',
  ): Agent {
    // Cache key includes userId if userContext is provided (personalized agents)
    // Fall back to locale+model for anonymous/system calls
    const userKey = userContext?.email ?? 'anonymous';
    // Use agentType in cache key to separate Supervisors from specialized agents
    const cacheKey = `${tenantId}:${userKey}:${locale}:${modelType}:${agentType}`;
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
    let agent: Agent;

    const commonOptions = {
      model,
      prisma: this.prisma,
      locale,
      tenantId,
      hooks: this.observabilityHooks?.hooks ?? undefined,
      userId,
      cacheService: this.cacheService,
    };

    // Phase 3: Agent Consolidation (10 → 3)
    // - Actions: ALL WRITE operations (email, calendar, contacts CRUD)
    // - Intelligence: ALL READ/ANALYSIS operations (search, list, analyze)
    // - Supervisor: Orchestrates sub-agents for complex multi-domain queries
    switch (agentType) {
      case 'Actions':
        agent = createActionsAgent({
          ...commonOptions,
          emailSendService: this.emailSendService,
          calendarService: this.calendarService,
          memory: this.memory ?? undefined,
        });
        break;
      case 'Intelligence':
        agent = createIntelligenceAgent({
          ...commonOptions,
          mistral: this.mistralService ?? null,
          embeddingsService: this.embeddingsService ?? null,
          writingStyle: this.writingStyleService ?? null,
          memory: this.memory ?? undefined,
        });
        break;
      case 'Supervisor':
      default:
        agent = createSupervisorAgent({
          ...commonOptions,
          emailSendService: this.emailSendService,
          calendarService: this.calendarService,
          // VoltAgent memory for conversation persistence (fixed in latest VoltAgent version)
          memory: this.memory ?? undefined,
          // RAG services for HybridRetriever (optional - gracefully degrades)
          mistralService: this.mistralService,
          embeddingsService: this.embeddingsService,
          // User context for personalized instructions
          userContext: userContext ?? undefined,
          // Web search agent requires ConfigService + CacheService for Redis caching
          configService: this.configService,
          // Document Library agent for document RAG
          documentLibraryService: this.documentLibraryService,

          followUpService: this.followUpService,
        });
        break;
    }

    // Cache with timestamps for TTL and LRU
    this.agents.set(cacheKey, { agent, createdAt: now, lastUsed: now });

    this.logger.debug(`Created ${agentType} agent for ${cacheKey}, cache size: ${this.agents.size}/${this.MAX_CACHED_AGENTS}`);

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
    // Store mapping in Redis so tool execution can resolve placeholders back to real values
    let processedMessage = message;
    const piiSessionId = options.conversationId || `pii:${options.tenantId}:${options.userId}`;
    if (this.piiDetectionService) {
      const piiResult = this.piiDetectionService.detect(message);
      if (piiResult.hasPii) {
        this.logger.log(
          `${logPrefix} PII detected and redacted: types=${piiResult.detectedTypes.join(', ')}`,
        );
        processedMessage = piiResult.redactedText;

        // Store PII mapping for tool execution resolution
        if (this.piiResolutionService && piiResult.details.length > 0) {
          this.piiResolutionService.storeMapping(
            options.tenantId,
            piiSessionId,
            piiResult.details,
          ).catch(err => {
            this.logger.warn(`${logPrefix} Failed to store PII mapping: ${err}`);
          });
        }
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

    // 0d. P10: Quota enforcement via QuotaGuard + CostProtectionService.canProceed()
    // Note: usageTrackingService.checkQuota() is deprecated (always returns true)
    // Proper enforcement happens at controller level via @RequiresQuota('ai') decorator

    // All responses are now generated fresh for each tenant

    // 2. Route to optimal model AND agent based on task complexity (40-60% cost savings)
    let selectedModel = options.model;
    // Phase 3: Consolidated agent types (10 → 3)
    let suggestedAgent: 'Supervisor' | 'Actions' | 'Intelligence' = 'Supervisor';
    if (this.modelRouterService) {
      const routing = this.modelRouterService.routeMessage(processedMessage, {
        preferSpeed: options.preferSpeed,
        preferQuality: options.preferQuality,
      });
      if (!selectedModel) {
        selectedModel = routing.recommendedModel;
      }
      if (routing.suggestedAgent) {
        suggestedAgent = routing.suggestedAgent;
      }
      this.logger.debug(
        `${logPrefix} Model router: ${routing.recommendedModel} -> ${suggestedAgent} (${routing.complexity}, confidence=${routing.confidence.toFixed(2)})`,
      );
    }

    const locale = getLocale(options.locale);

    // Fetch user context for personalized agent instructions
    const userContext = await this.getUserContext(options.userId, options.tenantId);

    // OPTIMIZATION: Direct routing for specialized intents (skip supervisor overhead)
    // Phase 3: Actions/Intelligence agents handle direct routing, Supervisor for complex queries
    // This reduces latency by ~70-90% for single-domain queries
    let agent: Agent;
    if (suggestedAgent !== 'Supervisor') {
      this.logger.debug(`${logPrefix} Direct routing to ${suggestedAgent}Agent (skipping supervisor)`);
      agent = this.getOrCreateAgent(options.tenantId, locale, selectedModel, userContext, options.userId, suggestedAgent);
    } else {
      // Use supervisor for complex multi-agent coordination (cross-domain queries)
      agent = this.getOrCreateAgent(options.tenantId, locale, selectedModel, userContext, options.userId, 'Supervisor');
    }

    // NOTE: tenantUserId was previously used for VoltAgent's native memory (disabled due to bug)
    // Tenant isolation is now handled by our Prisma-based VoltAgentMemoryService


    // Conversations are now stateless (no history persistence)
    const contextTruncated = false;


    let enhancedMessage = processedMessage;

    // 3.5. Trigger Memory Intelligence (Async/Fire-and-forget)
    // Extracts long-term memories from user message
    // NOTE: Uses ORIGINAL message (not redacted) so we store actual email addresses
    // Long-term memory stores real PII for tool execution context
    if (this.memoryIntelligenceService && options.userId) { // Ensure userId is present for memory
      this.memoryIntelligenceService.processMemoryFromMessage(
        options.tenantId,
        options.userId,
        message // Use original message with real PII for long-term storage
      ).catch(err => {
        this.logger.error(`${logPrefix} Memory extraction failed:`, err);
      });
    }

    // 3.6. Inject episodic learning (rejection lessons)
    // Fetch global lessons (agentName undefined) to apply constraints across all agents
    if (this.episodicMemoryService) {
      try {
        const lessons = await this.episodicMemoryService.getRecentLessons(
          options.tenantId,
          options.userId,
          undefined, // Fetch all lessons regardless of agent
          5
        );
        const lessonContext = this.episodicMemoryService.formatLessonsForPrompt(lessons);

        if (lessonContext) {
          const safeLessonContext = this.piiDetectionService
            ? this.piiDetectionService.redact(lessonContext)
            : lessonContext;

          enhancedMessage = `${safeLessonContext}\n\n---\n\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Episodic learning lessons injected: ${lessons.length}`);
        }
      } catch (error) {
        this.logger.warn(`${logPrefix} Failed to fetch episodic lessons: ${error}`);
      }
    }

    // 3.65. Inject long-term memory context (semantic search)
    // Retrieves relevant user memories to personalize the response
    if (this.memoryIntelligenceService && options.userId) {
      try {
        const memoryContext = await this.memoryIntelligenceService.getRelevantContext(
          options.tenantId,
          options.userId,
          processedMessage,
          { limit: 5, useReranking: false }, // Fast mode, no LLM re-ranking
        );

        if (memoryContext) {
          const safeMemoryContext = this.piiDetectionService
            ? this.piiDetectionService.redact(memoryContext)
            : memoryContext;

          enhancedMessage = `[User Memory]\n${safeMemoryContext}\n\n---\n\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Long-term memory context injected`);
        }
      } catch (error) {
        this.logger.warn(`${logPrefix} Failed to fetch memory context: ${error}`);
      }
    }

    // Prepare tenant-isolated context for VoltAgent hooks (HITL, metrics, observability)
    // Format: "tenantId:userId" allows hooks to extract both values
    const tenantUserId = `${options.tenantId}:${options.userId}`;
    // FIX Bug #3: Use DETERMINISTIC fallback sessionId based on tenant+user
    // This ensures users without explicit conversationId share a default conversation
    // Format: tenantId:userId:default maintains tenant isolation + enables history lookup
    const fallbackSessionId = `${options.tenantId}:${options.userId}:default`;
    const sessionId = options.conversationId || fallbackSessionId;

    // 3.7. Inject conversation history with compaction (2025 context engineering)
    // Fetches more messages (50) and summarizes older ones to preserve context without bloating tokens
    // FIX Bug #3: Always try to fetch history using sessionId (explicit or deterministic fallback)
    if (this.memory) {
      try {
        // Fetch up to 50 messages for better context (was 10)
        const history = await this.memory.getMessages(tenantUserId, sessionId, { limit: 50 });
        if (history && history.length > 0) {
          // Convert to compaction format
          const messages: ConversationMessage[] = history.map((msg, idx) => {
            const rawContent = msg.parts
              ?.map((part) => (part as { type: string; text?: string }).text || '')
              .filter(Boolean)
              .join(' ') || '';
            const content = sanitizeLlmResponse(rawContent);
            return {
              id: `msg-${idx}`,
              role: msg.role as 'user' | 'assistant',
              content,
              timestamp: (msg as unknown as { createdAt?: Date }).createdAt?.toISOString?.() || new Date().toISOString(),
            };
          });

          let historyContext: string;

          // Use compaction service if available and conversation is long
          if (this.compactionService && messages.length > 10) {
            const compacted = await this.compactionService.compactConversation(
              options.tenantId,
              sessionId, // FIX: Use sessionId (always defined) instead of options.conversationId
              messages,
              { recentWindowSize: 6, compactionThreshold: 10 },
            );
            historyContext = this.compactionService.formatForPrompt(compacted);
            if (compacted.wasCompacted) {
              this.logger.debug(
                `${logPrefix} Conversation compacted: ${messages.length} msgs → ${compacted.recentMessages.length} recent + summary (${compacted.tokenReduction}% reduction)`,
              );
            }
          } else {
            // Fallback: Use raw history for short conversations
            historyContext = messages
              .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
              .join('\n\n');
          }

          // Redact PII from history if service available
          const safeHistoryContext = this.piiDetectionService
            ? this.piiDetectionService.redact(historyContext)
            : historyContext;

          enhancedMessage = `[Conversation History]\n${safeHistoryContext}\n\n[Current Message]\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Conversation history injected: ${history.length} messages`);
        }
      } catch (error) {
        this.logger.warn(`${logPrefix} Failed to fetch conversation history: ${error}`);
      }
    }

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
          // Disable VoltAgent memory context + input auto-save (we manage memory manually)
          contextLimit: 0,
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

    // 4. Persist messages to VoltAgent Memory (RE-ADDED after AI refactor v2.0)
    // This ensures conversation history is available for future requests
    if (this.memory && result?.text) {
      try {
        // FIX Bug #4: Atomic conversation creation (create-if-not-exists pattern)
        // Instead of check-then-create (race condition), we try to create first
        // and catch the "already exists" error gracefully
        try {
          await this.memory.createConversation({
            id: persistedConversationId,
            userId: tenantUserId,
            resourceId: `agent:${options.tenantId}`,
            title: processedMessage.substring(0, 100),
            metadata: { tenantId: options.tenantId, createdAt: new Date().toISOString() },
          });
          this.logger.debug(`${logPrefix} Created new conversation: ${persistedConversationId}`);
        } catch (createError) {
          // Conversation may already exist (race condition or subsequent request)
          // Check if it's a duplicate key/unique constraint error - those are expected
          const errorMsg = String(createError).toLowerCase();
          const isDuplicateError = errorMsg.includes('unique') ||
            errorMsg.includes('duplicate') ||
            errorMsg.includes('already exists') ||
            errorMsg.includes('p2002'); // Prisma unique constraint code
          if (!isDuplicateError) {
            throw createError; // Re-throw unexpected errors
          }
          this.logger.debug(`${logPrefix} Conversation already exists: ${persistedConversationId}`);
        }

        // Save user message
        const userMessage = {
          id: `msg-user-${Date.now()}`,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: processedMessage }],
          metadata: { timestamp: new Date().toISOString() },
        };
        await this.memory.addMessage(userMessage, tenantUserId, persistedConversationId);

        // Save assistant response
        const assistantMessage = {
          id: `msg-assistant-${Date.now()}`,
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: sanitizedText }],
          metadata: { timestamp: new Date().toISOString(), model: selectedModel },
        };
        await this.memory.addMessage(assistantMessage, tenantUserId, persistedConversationId);

        this.logger.debug(`${logPrefix} Persisted conversation messages to VoltAgent Memory`);
      } catch (error) {
        // Non-critical: log but don't fail the request
        this.logger.warn(`${logPrefix} Failed to persist messages to memory: ${error}`);
      }
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


    // Responses are never cached to prevent data leakage between tenants

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

    return {
      text: sanitizedText,
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
    const startTimeResult = Date.now();
    this.logger.log(`${logPrefix} START Request processing`);

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
    // Store mapping in Redis so tool execution can resolve placeholders back to real values
    let processedMessage = message;
    const piiSessionId = options.conversationId || `pii:${options.tenantId}:${options.userId}`;
    if (this.piiDetectionService) {
      const piiResult = this.piiDetectionService.detect(message);
      if (piiResult.hasPii) {
        this.logger.log(
          `${logPrefix} PII detected and redacted: types=${piiResult.detectedTypes.join(', ')}`,
        );
        processedMessage = piiResult.redactedText;

        // Store PII mapping for tool execution resolution
        if (this.piiResolutionService && piiResult.details.length > 0) {
          this.piiResolutionService.storeMapping(
            options.tenantId,
            piiSessionId,
            piiResult.details,
          ).catch(err => {
            this.logger.warn(`${logPrefix} Failed to store PII mapping: ${err}`);
          });
        }
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

    // 0d. P10: Quota enforcement via QuotaGuard + CostProtectionService.canProceed()
    // Note: usageTrackingService.checkQuota() is deprecated (always returns true)
    // Proper enforcement happens at controller level via @RequiresQuota('ai') decorator

    // All responses generated fresh to prevent data leakage

    // 2. Route to optimal model and agent
    let selectedModel = options.model;
    let suggestedAgent: import('./services/model-router.service').AgentType = 'Supervisor';

    if (this.modelRouterService) {
      const routing = this.modelRouterService.routeMessage(processedMessage, {
        preferSpeed: options.preferSpeed,
        preferQuality: options.preferQuality,
      });
      if (!selectedModel) {
        selectedModel = routing.recommendedModel;
      }
      suggestedAgent = routing.suggestedAgent || 'Supervisor';
    }
    this.logger.log(`${logPrefix} Routing took ${Date.now() - startTimeResult}ms. Selected: ${selectedModel}, Agent: ${suggestedAgent}`);

    const locale = getLocale(options.locale);

    // Fetch user context for personalized agent instructions
    const contextStart = Date.now();
    const userContext = await this.getUserContext(options.userId, options.tenantId);
    this.logger.log(`${logPrefix} UserContext fetch took ${Date.now() - contextStart}ms`);

    const agentStart = Date.now();
    const agent = this.getOrCreateAgent(options.tenantId, locale, selectedModel, userContext, options.userId, suggestedAgent);
    this.logger.log(`${logPrefix} Agent Creation took ${Date.now() - agentStart}ms`);


    let enhancedMessage = processedMessage;

    // 2.7. Inject episodic learning (rejection lessons)
    if (this.episodicMemoryService) {
      try {
        const lessons = await this.episodicMemoryService.getRecentLessons(
          options.tenantId,
          options.userId,
          undefined, // Fetch all lessons
          5
        );
        const lessonContext = this.episodicMemoryService.formatLessonsForPrompt(lessons);

        if (lessonContext) {
          const safeLessonContext = this.piiDetectionService
            ? this.piiDetectionService.redact(lessonContext)
            : lessonContext;
          enhancedMessage = `${safeLessonContext}\n\n---\n\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Episodic learning lessons injected: ${lessons.length}`);
        }
      } catch (error) {
        this.logger.warn(`${logPrefix} Failed to fetch episodic lessons: ${error}`);
      }
    }

    // 2.75. Inject long-term memory context (semantic search)
    // Retrieves relevant user memories to personalize the response
    if (this.memoryIntelligenceService && options.userId) {
      try {
        const memoryContext = await this.memoryIntelligenceService.getRelevantContext(
          options.tenantId,
          options.userId,
          processedMessage,
          { limit: 5, useReranking: false }, // Fast mode, no LLM re-ranking
        );

        if (memoryContext) {
          const safeMemoryContext = this.piiDetectionService
            ? this.piiDetectionService.redact(memoryContext)
            : memoryContext;

          enhancedMessage = `[User Memory]\n${safeMemoryContext}\n\n---\n\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Long-term memory context injected`);
        }
      } catch (error) {
        this.logger.warn(`${logPrefix} Failed to fetch memory context: ${error}`);
      }
    }

    // Prepare tenant-isolated context for VoltAgent hooks (HITL, metrics, observability)
    const tenantUserId = `${options.tenantId}:${options.userId}`;
    // FIX Bug #3: Use DETERMINISTIC fallback sessionId based on tenant+user
    const sessionId = options.conversationId || `${options.tenantId}:${options.userId}:default`;

    // 3.7. Inject conversation history with compaction (2025 context engineering)
    // Fetches more messages (50) and summarizes older ones to preserve context without bloating tokens
    // FIX Bug #3: Always try to fetch history using sessionId (explicit or deterministic fallback)
    if (this.memory) {
      try {
        // Fetch up to 50 messages for better context (was 10)
        const history = await this.memory.getMessages(tenantUserId, sessionId, { limit: 50 });
        if (history && history.length > 0) {
          // Convert to compaction format
          const messages: ConversationMessage[] = history.map((msg, idx) => {
            const rawContent = msg.parts
              ?.map((part) => (part as { type: string; text?: string }).text || '')
              .filter(Boolean)
              .join(' ') || '';
            const content = sanitizeLlmResponse(rawContent);
            return {
              id: `msg-${idx}`,
              role: msg.role as 'user' | 'assistant',
              content,
              timestamp: (msg as unknown as { createdAt?: Date }).createdAt?.toISOString?.() || new Date().toISOString(),
            };
          });

          let historyContext: string;

          // Use compaction service if available and conversation is long
          if (this.compactionService && messages.length > 10) {
            const compacted = await this.compactionService.compactConversation(
              options.tenantId,
              sessionId, // FIX: Use sessionId (always defined) instead of options.conversationId
              messages,
              { recentWindowSize: 6, compactionThreshold: 10 },
            );
            historyContext = this.compactionService.formatForPrompt(compacted);
            if (compacted.wasCompacted) {
              this.logger.debug(
                `${logPrefix} Conversation compacted: ${messages.length} msgs → ${compacted.recentMessages.length} recent + summary (${compacted.tokenReduction}% reduction)`,
              );
            }
          } else {
            // Fallback: Use raw history for short conversations
            historyContext = messages
              .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
              .join('\n\n');
          }

          // Redact PII from history if service available
          const safeHistoryContext = this.piiDetectionService
            ? this.piiDetectionService.redact(historyContext)
            : historyContext;

          enhancedMessage = `[Conversation History]\n${safeHistoryContext}\n\n[Current Message]\n${enhancedMessage}`;
          this.logger.debug(`${logPrefix} Conversation history injected: ${history.length} messages`);
        }
      } catch (error) {
        this.logger.warn(`${logPrefix} Failed to fetch conversation history: ${error}`);
      }
    }

    this.logger.log(`${logPrefix} Context Injection took ${Date.now() - contextStart}ms`);

    const result = await agent.streamText(enhancedMessage, {
      userId: tenantUserId,
      conversationId: sessionId,
      // Disable VoltAgent memory context + input auto-save (we manage memory manually)
      contextLimit: 0,
      // CRITICAL: Disable parallel tool calls to ensure sequential delegation
      providerOptions: {
        mistral: {
          parallelToolCalls: false,
          structuredOutputs: false,
        },
      },
    });
    this.logger.log(`${logPrefix} Stream Setup took ${Date.now() - startTimeResult}ms. Starting stream...`);

    // Collect full response for memory persistence and caching
    let fullResponse = '';
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      yield chunk;
    }



    // 4. Persist messages to VoltAgent Memory (RE-ADDED after AI refactor v2.0)
    // This ensures conversation history is available for future requests
    if (this.memory && fullResponse.length > 0) {
      try {
        // Create conversation if it doesn't exist (for new sessions)
        const existingConversation = await this.memory.getConversation(sessionId);
        if (!existingConversation) {
          await this.memory.createConversation({
            id: sessionId,
            userId: tenantUserId,
            resourceId: `agent:${options.tenantId}`,
            title: processedMessage.substring(0, 100),
            metadata: { tenantId: options.tenantId, createdAt: new Date().toISOString() },
          });
          this.logger.debug(`${logPrefix} Created new conversation: ${sessionId}`);
        }

        // Save user message
        const userMessage = {
          id: `msg-user-${Date.now()}`,
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: processedMessage }],
          metadata: { timestamp: new Date().toISOString() },
        };
        await this.memory.addMessage(userMessage, tenantUserId, sessionId);

        // Save assistant response (sanitized to remove any echoed internal markers)
        const sanitizedResponse = sanitizeLlmResponse(fullResponse);
        const assistantMessage = {
          id: `msg-assistant-${Date.now()}`,
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: sanitizedResponse }],
          metadata: { timestamp: new Date().toISOString(), model: selectedModel },
        };
        await this.memory.addMessage(assistantMessage, tenantUserId, sessionId);

        this.logger.debug(`${logPrefix} Persisted conversation messages to VoltAgent Memory`);
      } catch (error) {
        // Non-critical: log but don't fail the request
        this.logger.warn(`${logPrefix} Failed to persist messages to memory: ${error}`);
      }
    }

    // P10: Track successful AI call usage (after stream completion)
    if (this.usageTrackingService) {
      await this.usageTrackingService.trackUsage(options.tenantId, 'ai-calls', 1).catch((err: Error) => {
        this.logger.warn(`${logPrefix} Failed to track AI usage: ${err.message}`);
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
      const errorT = getErrorTranslations('en');
      throw new AiError(errorT.ai.approvalNotInitialized, AiErrorCode.INTERNAL_ERROR, {
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
        // Extract properties from actionPayload JSON (AI refactor v2.0)
        const payloadData = extractActionPayload(action.actionPayload);
        suspended = {
          executionId: action.id,
          tenantId: action.tenantId,
          userId: action.userId,
          action: {
            tenantId: action.tenantId,
            userId: action.userId,
            agentName: payloadData.agentName,
            actionType: action.actionType,
            payload: payloadData.payload,
            summary: action.reasoning || '',
            severity: payloadData.severity,
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
        // NOTE: sessionId uses pii:tenantId:userId format to match PII storage key
        const agentContext: AgentContext = {
          tenantId: suspended.tenantId,
          userId: suspended.userId,
          sessionId: `pii:${suspended.tenantId}:${suspended.userId}`,
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

    return result.actions.map((action) => {
      // Extract properties from actionPayload JSON (AI refactor v2.0)
      const payloadData = extractActionPayload(action.actionPayload);
      return {
        executionId: action.id,
        tenantId: action.tenantId,
        userId: action.userId,
        sessionId: payloadData.sessionId, // ConversationId for linking to chat messages
        action: {
          tenantId: action.tenantId,
          userId: action.userId,
          agentName: payloadData.agentName,
          actionType: action.actionType,
          payload: payloadData.payload,
          summary: action.reasoning || '',
          severity: payloadData.severity,
          confidence: action.confidence,
        },
        suspendReason: 'Approval required',
        suspendedAt: action.createdAt,
        workflowResult: null as unknown as ApprovalWorkflowResult, // Not available from DB
      };
    });
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
        // Extract properties from actionPayload JSON (AI refactor v2.0)
        const payloadData = extractActionPayload(action.actionPayload);
        return {
          executionId: action.id,
          tenantId: action.tenantId,
          userId: action.userId,
          action: {
            tenantId: action.tenantId,
            userId: action.userId,
            agentName: payloadData.agentName,
            actionType: action.actionType,
            payload: payloadData.payload,
            summary: action.reasoning || '',
            severity: payloadData.severity,
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
   * Includes model routing and queue metrics.
   * NOTE: Semantic cache was REMOVED due to cross-tenant security issues.
   */
  async getOptimizationStats(_tenantId: string): Promise<{
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

    const semanticCacheEnabled = false;
    const cacheStats = { entries: 0, totalHits: 0, avgSimilarity: 0, estimatedSavings: 0 };

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
   * NOTE: Semantic cache was REMOVED due to cross-tenant security issues.
   * This method now does nothing but is kept for API compatibility.
   */
  async invalidateCache(_tenantId: string, _pattern?: string): Promise<number> {

    return 0;
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
