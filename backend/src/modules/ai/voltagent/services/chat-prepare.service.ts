/**
 * ChatPrepareService
 *
 * Consolidates shared setup logic for chat() and createStreamContext().
 * Extracted from VoltAgentService to eliminate ~300 lines of duplication.
 *
 * Responsibilities:
 * 1. Process request (validation, PII redaction, rate limiting, model routing)
 * 2. Fetch user context with Redis caching
 * 3. Select agent via AgentPoolService
 * 4. Build context via ChatContextBuilderService
 * 5. Ensure conversation exists in VoltAgent memory
 *
 * @see VoltAgentService.chat()
 * @see VoltAgentService.createStreamContext()
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Agent, Memory } from '@voltagent/core';
import { AiError, AiErrorCode } from '../../errors';
import { type UserContext } from '../agents/supervisor.agent';
import { type MistralModel } from '../providers/mistral.provider';
import { getLocale } from '../locales';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';
import { CacheService } from '../../../../common/services/cache.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ChatRequestProcessorService } from './chat-request-processor.service';
import { ChatContextBuilderService } from './chat-context-builder.service';
import { AgentPoolService } from './agent-pool.service';
import type { ConnectedProvider } from '../agents';
import type { DisposableHooks } from '../observability';

export interface ChatPrepareOptions {
  userId: string;
  conversationId?: string;
  tenantId: string;
  locale?: string;
  model?: MistralModel;
  skipCache?: boolean;
  preferSpeed?: boolean;
  preferQuality?: boolean;
  viewContext?: {
    currentView?: string;
    selectedEmailId?: string;
    selectedFolderId?: string;
    selectedContactId?: string;
  };
}

export interface PreparedChatContext {
  /** Processed message with PII redacted */
  processedMessage: string;
  /** Message with context enrichment (memories, lessons) */
  enhancedMessage: string;
  /** Session/conversation ID */
  sessionId: string;
  /** Tenant-isolated user ID for VoltAgent */
  tenantUserId: string;
  /** Selected model after routing */
  selectedModel?: MistralModel;
  /** Suggested agent type */
  suggestedAgent: 'Supervisor' | 'Actions' | 'Intelligence';
  /** Resolved locale */
  locale: string;
  /** User context for personalization */
  userContext: UserContext | null;
  /** Selected VoltAgent agent instance */
  agent: Agent;
  /** Log prefix for consistent logging */
  logPrefix: string;
  /** Whether PII was detected */
  hasPii: boolean;
  /** Estimated input tokens */
  estimatedTokens: number;
}

@Injectable()
export class ChatPrepareService {
  private readonly logger = new Logger(ChatPrepareService.name);

  constructor(
    private readonly prisma: PrismaService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
    @Optional() @Inject(ChatRequestProcessorService) private readonly chatRequestProcessor?: ChatRequestProcessorService,
    @Optional() @Inject(ChatContextBuilderService) private readonly chatContextBuilder?: ChatContextBuilderService,
    @Optional() @Inject(AgentPoolService) private readonly agentPoolService?: AgentPoolService,
  ) {
    this.logger.log(`[INIT] ChatPrepareService: cache=${!!this.cacheService}, contextBuilder=${!!this.chatContextBuilder}`);
  }

  /**
   * Prepare all context needed for chat or streaming.
   * Consolidates shared setup from chat() and createStreamContext().
   *
   * @param message - Raw user message
   * @param options - Chat options (userId, tenantId, etc.)
   * @param memory - VoltAgent memory instance
   * @param hooks - Observability hooks (optional)
   * @returns Prepared context for agent execution
   */
  async prepare(
    message: string,
    options: ChatPrepareOptions,
    memory: Memory | null,
    hooks?: DisposableHooks | null,
  ): Promise<PreparedChatContext> {
    const prepareStart = Date.now();
    const correlationId = CorrelationContext.getCorrelationId();
    const logPrefix = `[${correlationId}] [tenant:${options.tenantId}]`;

    // TIMING: Track each step for performance analysis
    const timings: Record<string, number> = {};

    // Calculate session ID with fallback
    const fallbackSessionId = `${options.tenantId}:${options.userId}:default`;
    const sessionId = options.conversationId || fallbackSessionId;

    // 1. Process request: validate input, redact PII, check rate limits, route model
    const step1Start = Date.now();
    let processedMessage = message;
    let selectedModel = options.model;
    let suggestedAgent: 'Supervisor' | 'Actions' | 'Intelligence' = 'Supervisor';
    let hasPii = false;
    let estimatedTokens = 0;
    let detectedIntent: import('./task-complexity-classifier.service').TaskIntent = 'unknown'; // RLM

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
        hasPii = processed.hasPii;
        estimatedTokens = processed.estimatedTokens;
        detectedIntent = processed.intent; // RLM: Extract intent for minimal prompt

        if (hasPii) {
          this.logger.log(`${logPrefix} PII detected and redacted`);
        }
        this.logger.debug(
          `${logPrefix} Request processed: model=${selectedModel}, agent=${suggestedAgent}, tokens=${estimatedTokens}`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Re-throw rate limit and validation errors for caller to handle
        if (errorMsg.includes('Rate limit exceeded') || errorMsg.includes('cannot process this request')) {
          throw error;
        }
        throw error;
      }
    } else {
      this.logger.warn(`${logPrefix} ChatRequestProcessorService not injected, using default processing`);
    }
    timings['1_request_process'] = Date.now() - step1Start;

    // 2. Resolve locale
    const locale = getLocale(options.locale);

    // 3. Fetch user context for personalized agent instructions
    const step3Start = Date.now();
    const userContext = await this.getUserContext(options.userId, options.tenantId);
    timings['3_user_context'] = Date.now() - step3Start;

    // 4. Get or create agent via AgentPoolService
    const step4Start = Date.now();
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
      memory,
      hooks: hooks?.hooks,
      intent: detectedIntent, // RLM: Pass intent for minimal prompt loading
      viewContext: options.viewContext,
    };

    let agent: Agent;
    if (suggestedAgent !== 'Supervisor') {
      this.logger.debug(`${logPrefix} Direct routing to ${suggestedAgent}Agent (skipping supervisor)`);
      agent = await this.agentPoolService.getOrCreateAgent(agentParams);
    } else {
      agent = await this.agentPoolService.getOrCreateAgent({ ...agentParams, agentType: 'Supervisor' });
    }
    timings['4_agent_create'] = Date.now() - step4Start;

    // 5. Build enhanced context: episodic lessons + long-term memory
    const step5Start = Date.now();
    let enhancedMessage = processedMessage;
    if (this.chatContextBuilder) {
      const contextResult = await this.chatContextBuilder.build(processedMessage, {
        tenantId: options.tenantId,
        userId: options.userId,
        logPrefix,
      });
      enhancedMessage = contextResult.enhancedMessage;
    }
    timings['5_context_build'] = Date.now() - step5Start;

    // 6. Ensure conversation exists in VoltAgent memory
    const step6Start = Date.now();
    const tenantUserId = `${options.tenantId}:${options.userId}`;
    await this.ensureConversationExists({
      memory,
      tenantUserId,
      sessionId,
      title: processedMessage.substring(0, 100),
      tenantId: options.tenantId,
      logPrefix,
    });
    timings['6_ensure_conv'] = Date.now() - step6Start;

    // TIMING: Log total preparation time and breakdown
    timings['total'] = Date.now() - prepareStart;
    this.logger.log(
      `${logPrefix} [PERF] prepare() timings: ${JSON.stringify(timings)}ms | agent=${suggestedAgent} model=${selectedModel}`,
    );

    return {
      processedMessage,
      enhancedMessage,
      sessionId,
      tenantUserId,
      selectedModel,
      suggestedAgent,
      locale,
      userContext,
      agent,
      logPrefix,
      hasPii,
      estimatedTokens,
    };
  }

  /**
   * Fetch user context (profile + preferences) for personalized instructions.
   * Uses Redis caching for tenant isolation and performance.
   */
  private async getUserContext(userId: string, tenantId: string): Promise<UserContext | null> {
    const cacheKey = `voltagent:user-context:${tenantId}:${userId}`;

    // Check Redis cache first
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
          include: { userPreferences: true },
        }),
        this.prisma.providerConfig.findMany({
          where: { tenantId, userId, isActive: true },
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
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
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

      // Cache for 5 minutes
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
   * Ensure conversation exists in VoltAgent memory for persistence.
   * Handles duplicate key errors gracefully.
   */
  private async ensureConversationExists(params: {
    memory: Memory | null;
    tenantUserId: string;
    sessionId: string;
    title: string;
    tenantId: string;
    logPrefix: string;
  }): Promise<boolean> {
    if (!params.memory) {
      return false;
    }

    try {
      await params.memory.createConversation({
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
      const isDuplicateError =
        errorMsg.includes('unique') ||
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
}
