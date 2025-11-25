import { Injectable, Logger, Optional } from '@nestjs/common';
import { RouterAgent, IntentClassificationResult } from '../agents/router.agent';
import { BaseAgent } from '../agents/base.agent';
import { HitlService, PendingActionStatus } from './hitl.service';
import { FeedbackService } from './feedback.service';
import { ActionExecutorService } from './action-executor.service';
import { MemoryService } from './memory.service';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentAction, AgentActionType } from '../interfaces/agent-action.interface';
import { PersonalizationService, PersonalizationContext } from '../../services/personalization.service';

/**
 * Response from processing a user message.
 */
export interface MultiAgentResponse {
  /** Text messages to show the user */
  messages: string[];

  /** IDs of actions pending approval */
  pendingActionIds: string[];

  /** IDs of actions that were auto-approved and executed */
  executedActionIds: string[];

  /** Intent classification result */
  intent: IntentClassificationResult;

  /** Which agent processed the request */
  agentUsed: string;

  /** Processing time in milliseconds */
  executionTimeMs: number;

  /** Whether more information is needed */
  needsMoreInfo: boolean;

  /** Questions to clarify intent */
  clarifyingQuestions?: string[];
}

/**
 * Options for processing a message.
 */
export interface ProcessOptions {
  /** Skip intent classification if intent is already known */
  knownIntent?: AgentIntent;

  /** Force a specific agent to handle the request */
  forceAgent?: string;

  /** Auto-approve threshold override */
  autoApproveThreshold?: number;
}

/**
 * MultiAgentService is the main orchestrator for the multi-agent system.
 * It coordinates intent classification, agent selection, action proposal,
 * HITL approval, and feedback learning.
 */
@Injectable()
export class MultiAgentService {
  private readonly logger = new Logger(MultiAgentService.name);

  /** Registry of specialized agents */
  private agents: Map<string, BaseAgent> = new Map();

  constructor(
    private readonly routerAgent: RouterAgent,
    private readonly hitlService: HitlService,
    private readonly feedbackService: FeedbackService,
    private readonly actionExecutor: ActionExecutorService,
    private readonly memoryService: MemoryService,
    @Optional() private readonly personalizationService?: PersonalizationService,
  ) {}

  /**
   * Get personalization context for enriching agent requests.
   */
  private async getPersonalizationContext(
    tenantId: string,
    userId: string,
    query?: string,
  ): Promise<PersonalizationContext | null> {
    if (!this.personalizationService) {
      return null;
    }

    try {
      return await this.personalizationService.getPersonalizationContext(
        tenantId,
        userId,
        query,
      );
    } catch (error) {
      this.logger.warn(`Failed to get personalization context: ${error}`);
      return null;
    }
  }

  /**
   * Register a specialized agent with the orchestrator.
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
    this.logger.log(`Registered agent: ${agent.name}`);
  }

  /**
   * Get all registered agents.
   */
  getRegisteredAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Process a user message through the multi-agent system.
   * This is the main entry point for the AI assistant.
   */
  async process(
    context: AgentContext,
    options: ProcessOptions = {},
  ): Promise<MultiAgentResponse> {
    const startTime = Date.now();
    this.logger.log(
      `Processing message for tenant ${context.tenantId}, user ${context.userId}`,
    );

    try {
      // Step 0: Load history from memory if session exists and no history provided
      if (context.sessionId && (!context.history || context.history.length === 0)) {
        const memoryHistory = await this.memoryService.getHistory(
          context.sessionId,
          context.tenantId,
          context.userId,
        );
        context.history = memoryHistory.map((m) => ({
          role: m.role,
          content: m.content,
        }));
      }

      // Save user message to memory (FIFO managed)
      if (context.sessionId) {
        await this.memoryService.addUserMessage(
          context.sessionId,
          context.tenantId,
          context.userId,
          context.userMessage,
        );
      }

      // Step 0.5: Load personalization context
      const personalization = await this.getPersonalizationContext(
        context.tenantId,
        context.userId,
        context.userMessage,
      );

      // Enrich context with personalization
      if (personalization) {
        context.personalization = personalization;
        // Apply language preference if not already set
        if (!context.preferences?.language && personalization.profile.language) {
          context.preferences = {
            ...context.preferences,
            language: personalization.profile.language,
          };
        }
      }

      // Step 1: Classify intent (or use provided intent)
      const intentResult = await this.classifyIntent(context, options);
      context.intent = intentResult.intent;
      context.intentConfidence = intentResult.confidence;

      // Step 2: Select appropriate agent
      const agent = this.selectAgent(context, options);
      if (!agent) {
        return this.createNoAgentResponse(intentResult, startTime);
      }

      // Step 3: Process with selected agent
      const result = await agent.process(context);

      // Step 4: Apply learning adjustments to action confidence
      const adjustedActions = await this.applyLearningAdjustments(
        context,
        agent.name,
        result.actions,
      );

      // Step 5: Handle actions (auto-approve or queue for approval)
      const { pendingActionIds, executedActionIds } = await this.handleActions(
        context,
        agent.name,
        adjustedActions,
        options.autoApproveThreshold ?? context.preferences?.autoApproveThreshold ?? 0.9,
      );

      // Step 6: Build response
      const response: MultiAgentResponse = {
        messages: result.messages,
        pendingActionIds,
        executedActionIds,
        intent: intentResult,
        agentUsed: agent.name,
        executionTimeMs: Date.now() - startTime,
        needsMoreInfo: result.needsMoreInfo ?? false,
        clarifyingQuestions: result.clarifyingQuestions,
      };

      // Save assistant response to memory (FIFO managed)
      if (context.sessionId && result.messages.length > 0) {
        await this.memoryService.addAssistantMessage(
          context.sessionId,
          context.tenantId,
          context.userId,
          result.messages.join('\n'),
          {
            agentName: agent.name,
            intent: intentResult.intent,
            actionCount: adjustedActions.length,
          },
        );
      }

      this.logger.log(
        `Processed message in ${response.executionTimeMs}ms, ` +
        `agent: ${agent.name}, pending: ${pendingActionIds.length}, executed: ${executedActionIds.length}`,
      );

      return response;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to process message: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Classify intent using RouterAgent or fast-path detection.
   */
  private async classifyIntent(
    context: AgentContext,
    options: ProcessOptions,
  ): Promise<IntentClassificationResult> {
    // Use provided intent if available
    if (options.knownIntent) {
      return {
        intent: options.knownIntent,
        confidence: 1.0,
        reasoning: 'Intent provided by caller',
        suggestedAgents: [],
      };
    }

    // Fast-path for simple greetings
    if (this.routerAgent.isSimpleGreeting(context.userMessage)) {
      return {
        intent: AgentIntent.GENERAL,
        confidence: 0.95,
        reasoning: 'Simple greeting detected',
        suggestedAgents: ['GeneralAgent'],
      };
    }

    // Fast-path for explicit intent keywords
    const explicitIntent = this.routerAgent.detectExplicitIntent(context.userMessage);
    if (explicitIntent) {
      return {
        intent: explicitIntent,
        confidence: 0.85,
        reasoning: 'Explicit intent keywords detected',
        suggestedAgents: [],
      };
    }

    // Full LLM classification
    return this.routerAgent.classifyIntent(context);
  }

  /**
   * Select the appropriate agent based on intent.
   */
  private selectAgent(
    context: AgentContext,
    options: ProcessOptions,
  ): BaseAgent | null {
    // Use forced agent if specified
    if (options.forceAgent) {
      const agent = this.agents.get(options.forceAgent);
      if (agent) {
        return agent;
      }
      this.logger.warn(`Forced agent ${options.forceAgent} not found`);
    }

    // Find agent that can handle the intent
    for (const agent of this.agents.values()) {
      if (agent.canHandle({
        userMessage: context.userMessage,
        intent: context.intent,
        intentConfidence: context.intentConfidence,
      })) {
        return agent;
      }
    }

    this.logger.warn(`No agent found for intent: ${context.intent}`);
    return null;
  }

  /**
   * Create response when no agent can handle the request.
   */
  private createNoAgentResponse(
    intentResult: IntentClassificationResult,
    startTime: number,
  ): MultiAgentResponse {
    return {
      messages: [
        "I'm sorry, I couldn't understand how to help with that request. " +
        'Could you please rephrase or provide more details?',
      ],
      pendingActionIds: [],
      executedActionIds: [],
      intent: intentResult,
      agentUsed: 'none',
      executionTimeMs: Date.now() - startTime,
      needsMoreInfo: true,
      clarifyingQuestions: [
        'What would you like me to help you with?',
        'Are you trying to send an email, schedule a meeting, or something else?',
      ],
    };
  }

  /**
   * Apply learning adjustments to action confidence scores.
   */
  private async applyLearningAdjustments(
    context: AgentContext,
    agentName: string,
    actions: AgentAction[],
  ): Promise<AgentAction[]> {
    const adjustedActions: AgentAction[] = [];

    for (const action of actions) {
      const { adjustedConfidence, boost, profileAttempts } =
        await this.feedbackService.getAdjustedConfidence(
          context.tenantId,
          context.userId,
          agentName,
          action.type,
          action.confidence,
        );

      adjustedActions.push({
        ...action,
        adjustedConfidence,
        learningContext: {
          originalConfidence: action.confidence,
          boost,
          profileAttempts,
        },
      });
    }

    return adjustedActions;
  }

  /**
   * Handle actions: either auto-approve or queue for HITL approval.
   */
  private async handleActions(
    context: AgentContext,
    agentName: string,
    actions: AgentAction[],
    autoApproveThreshold: number,
  ): Promise<{ pendingActionIds: string[]; executedActionIds: string[] }> {
    const pendingActionIds: string[] = [];
    const executedActionIds: string[] = [];

    for (const action of actions) {
      const shouldAutoApprove = this.hitlService.shouldAutoApprove(
        action,
        autoApproveThreshold,
      );

      if (shouldAutoApprove) {
        // Auto-approve and execute
        const actionId = await this.hitlService.createPendingAction({
          tenantId: context.tenantId,
          userId: context.userId,
          sessionId: context.sessionId,
          agentName,
          action,
        });

        // Mark as approved
        await this.hitlService.approveAction(
          context.tenantId,
          actionId,
          'system:auto-approve',
        );

        // Execute the action
        const success = await this.executeAction(context, action);

        // Mark as executed
        await this.hitlService.markExecuted(
          context.tenantId,
          actionId,
          success,
        );

        // Record feedback for learning
        await this.feedbackService.recordFeedback({
          actionId,
          tenantId: context.tenantId,
          userId: context.userId,
          agentName,
          actionType: action.type,
          wasApproved: true,
          wasExecuted: true,
          wasSuccessful: success,
          originalConfidence: action.confidence,
          adjustedConfidence: action.adjustedConfidence,
        });

        executedActionIds.push(actionId);
      } else {
        // Queue for HITL approval
        const actionId = await this.hitlService.createPendingAction({
          tenantId: context.tenantId,
          userId: context.userId,
          sessionId: context.sessionId,
          agentName,
          action,
        });

        pendingActionIds.push(actionId);
      }
    }

    return { pendingActionIds, executedActionIds };
  }

  /**
   * Execute an approved action using the ActionExecutorService.
   */
  private async executeAction(
    context: AgentContext,
    action: AgentAction,
  ): Promise<boolean> {
    this.logger.log(`Executing action: ${action.type}`);
    const result = await this.actionExecutor.execute(action, context);
    return result.success;
  }

  /**
   * Approve a pending action and execute it.
   */
  async approveAndExecuteAction(
    tenantId: string,
    actionId: string,
    approvedBy: string,
    context?: AgentContext,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get the pending action
      const pendingAction = await this.hitlService.getPendingAction(tenantId, actionId);

      // Approve it
      await this.hitlService.approveAction(tenantId, actionId, approvedBy);

      // Execute the action
      const action: AgentAction = {
        type: pendingAction.actionType as AgentActionType,
        payload: pendingAction.payload as Record<string, any>,
        confidence: pendingAction.confidence,
        adjustedConfidence: pendingAction.adjustedConfidence ?? undefined,
        severity: pendingAction.severity as any,
      };

      const success = await this.executeAction(
        context ?? {
          tenantId,
          userId: pendingAction.userId,
          userMessage: '',
        },
        action,
      );

      // Mark as executed
      await this.hitlService.markExecuted(tenantId, actionId, success);

      // Record feedback
      await this.feedbackService.recordFeedback({
        actionId,
        tenantId,
        userId: pendingAction.userId,
        agentName: pendingAction.agentName,
        actionType: pendingAction.actionType,
        wasApproved: true,
        wasExecuted: true,
        wasSuccessful: success,
        originalConfidence: pendingAction.confidence,
        adjustedConfidence: pendingAction.adjustedConfidence ?? undefined,
      });

      return { success };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to approve/execute action ${actionId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Reject a pending action.
   */
  async rejectAction(
    tenantId: string,
    actionId: string,
    rejectedBy: string,
    reason?: string,
  ): Promise<void> {
    const pendingAction = await this.hitlService.getPendingAction(tenantId, actionId);

    // Reject it
    await this.hitlService.rejectAction(tenantId, actionId, rejectedBy, reason);

    // Record feedback for learning
    await this.feedbackService.recordFeedback({
      actionId,
      tenantId,
      userId: pendingAction.userId,
      agentName: pendingAction.agentName,
      actionType: pendingAction.actionType,
      wasApproved: false,
      wasExecuted: false,
      wasSuccessful: false,
      originalConfidence: pendingAction.confidence,
      adjustedConfidence: pendingAction.adjustedConfidence ?? undefined,
      userFeedback: reason,
    });
  }

  /**
   * Get pending actions for a user.
   */
  async getPendingActions(tenantId: string, userId?: string) {
    return this.hitlService.getPendingActions({
      tenantId,
      userId,
      status: PendingActionStatus.PENDING,
    });
  }

  /**
   * Get learning statistics.
   */
  async getLearningStats(tenantId: string, userId?: string) {
    return this.feedbackService.getLearningStats(tenantId, userId);
  }

  /**
   * Get aggregate statistics.
   */
  async getAggregateStats(tenantId: string) {
    return this.feedbackService.getAggregateStats(tenantId);
  }
}
