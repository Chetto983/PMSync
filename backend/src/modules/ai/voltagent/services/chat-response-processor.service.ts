/**
 * ChatResponseProcessor Service
 *
 * Handles response processing for chat requests:
 * - HITL pending action extraction from tool results
 * - Response sanitization
 * - PII rehydration
 * - Memory persistence
 *
 * Part of VoltAgentService refactoring (2302 → <500 lines)
 * Created: 2026-01-22
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Memory } from '@voltagent/core';
import { PiiResolutionService, type PiiMapping } from '../../guards';
import { HitlService } from './hitl.service';
import { type ActionSeverity, type AgentActionType } from '../interfaces/agent-action.interface';
import { sanitizeLlmResponse } from './chat-context-builder.service';

/**
 * Apply PII mappings to rehydrate placeholders with original values.
 * Exported for use in streaming sanitizer (voltagent.service.ts).
 *
 * @param text - Text containing PII placeholders
 * @param mappings - Array of placeholder-to-original mappings
 * @returns Text with placeholders replaced by original values
 */
export function applyPiiMappings(text: string, mappings: PiiMapping[]): string {
  if (!text || mappings.length === 0) {
    return text;
  }

  let resolved = text;
  for (const mapping of mappings) {
    if (resolved.includes(mapping.placeholder)) {
      resolved = resolved.replaceAll(mapping.placeholder, mapping.originalValue);
    }
  }

  return resolved;
}

export interface PendingAction {
  id: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
  summary: string;
}

/**
 * Step from VoltAgent result.steps array
 */
interface AgentStep {
  toolResults?: Array<{
    output?: Record<string, unknown>;
    toolName?: string;
  }>;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  text: string;
  steps: AgentStep[];
}

export interface ResponseProcessingOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  piiMappings?: PiiMapping[];
  selectedModel?: string;
  logPrefix?: string;
  /** Request start time for filtering hook-captured actions */
  requestStartTime?: Date;
}

export interface ProcessedResponse {
  text: string;
  pendingActions: PendingAction[];
  requiresApproval: boolean;
}

export interface PersistMessagesOptions {
  tenantId: string;
  tenantUserId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  selectedModel?: string;
  memory: Memory;
  logPrefix?: string;
}

@Injectable()
export class ChatResponseProcessorService {
  private readonly logger = new Logger(ChatResponseProcessorService.name);

  constructor(
    @Optional() private readonly hitlService: HitlService | null,
    @Optional() private readonly piiResolutionService: PiiResolutionService | null,
  ) {}

  /**
   * Process agent execution result - extract HITL actions and sanitize response.
   *
   * @param result - Agent execution result
   * @param options - Processing options
   * @returns Processed response with pending actions
   */
  async process(result: AgentResult, options: ResponseProcessingOptions): Promise<ProcessedResponse> {
    const logPrefix = options.logPrefix || `[tenant:${options.tenantId}]`;

    // 1. Sanitize response to remove internal context markers
    const sanitizedText = sanitizeLlmResponse(result.text);

    // 2. Extract pending actions from top-level tool results
    const topLevelActions = await this.extractPendingActions(result.steps, {
      tenantId: options.tenantId,
      userId: options.userId,
      sessionId: options.sessionId,
      logPrefix,
    });

    // 3. Fetch hook-captured actions from database (for nested delegate_task results)
    // CRITICAL FIX 2026-01-22: When Supervisor delegates to ActionsAgent via delegate_task,
    // the sub-agent's tool results with requiresApproval are captured by onToolEnd hooks
    // and stored to DB, but NOT visible in top-level result.steps. We must query both.
    const hookCapturedActions = await this.fetchHookCapturedActions(
      options.tenantId,
      options.sessionId,
      options.requestStartTime,
    );

    // 4. Merge and deduplicate actions (prefer top-level, they're more complete)
    const seenIds = new Set(topLevelActions.map((a) => a.id));
    const mergedActions = [...topLevelActions];
    for (const action of hookCapturedActions) {
      if (!seenIds.has(action.id)) {
        mergedActions.push(action);
        seenIds.add(action.id);
      }
    }

    if (hookCapturedActions.length > 0) {
      this.logger.debug(
        `${logPrefix} Found ${hookCapturedActions.length} hook-captured HITL actions for session ${options.sessionId}`,
      );
    }

    // 5. Resolve user-visible text (rehydrate PII if needed)
    const text = await this.resolveUserVisibleText(
      sanitizedText,
      options.tenantId,
      options.sessionId,
    );

    return {
      text,
      pendingActions: mergedActions,
      requiresApproval: mergedActions.length > 0,
    };
  }

  /**
   * Fetch pending actions captured by hooks during delegate_task execution.
   * These are HITL actions from sub-agents that would otherwise be lost.
   */
  private async fetchHookCapturedActions(
    tenantId: string,
    sessionId: string,
    requestStartTime?: Date,
  ): Promise<PendingAction[]> {
    if (!this.hitlService) {
      return [];
    }

    try {
      return await this.hitlService.getPendingActionsBySession(
        tenantId,
        sessionId,
        requestStartTime,
      );
    } catch (error) {
      this.logger.warn(
        `[tenant:${tenantId}] Failed to fetch hook-captured actions: ${error}`,
      );
      return [];
    }
  }

  /**
   * Extract HITL pending actions from agent result steps.
   *
   * This is the critical HITL capture logic - any tool result with
   * `requiresApproval: true` creates a pending action.
   */
  async extractPendingActions(
    steps: AgentStep[],
    options: {
      tenantId: string;
      userId: string;
      sessionId: string;
      logPrefix: string;
    },
  ): Promise<PendingAction[]> {
    const pendingActions: PendingAction[] = [];
    //const { logPrefix } = options;

    this.logger.debug(`[HITL DEBUG] result.steps count: ${steps?.length || 0}`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      this.logger.debug(`[HITL DEBUG] Step ${i} keys: ${Object.keys(step).join(', ')}`);
      this.logger.debug(
        `[HITL DEBUG] Step ${i} JSON (first 500 chars): ${JSON.stringify(step).substring(0, 500)}`,
      );

      const toolResults = step.toolResults;
      this.logger.debug(
        `[HITL DEBUG] toolResults found: ${!!toolResults}, count: ${toolResults?.length || 0}`,
      );

      if (toolResults) {
        for (const toolResult of toolResults) {
          const resultValue = toolResult.output;
          this.logger.debug(
            `[HITL DEBUG] toolResult.output for ${toolResult.toolName}: ${JSON.stringify(resultValue)?.substring(0, 200)}`,
          );

          if (resultValue?.requiresApproval) {
            const actionType = resultValue.actionType as string;
            const severity = resultValue.severity as 'LOW' | 'MEDIUM' | 'HIGH';
            const payload = resultValue.payload as Record<string, unknown>;
            const summary = resultValue.summary as string;

            // Persist pending action to database via HitlService
            let actionId: string;
            this.logger.debug(
              `[HITL] Creating pending action with sessionId=${options.sessionId} for action=${actionType}`,
            );

            if (this.hitlService) {
              actionId = await this.hitlService.createPendingAction({
                tenantId: options.tenantId,
                userId: options.userId,
                sessionId: options.sessionId,
                agentName: 'SupervisorAgent',
                action: {
                  type: actionType as AgentActionType,
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

    return pendingActions;
  }

  /**
   * Resolve user-visible text by rehydrating PII placeholders.
   */
  async resolveUserVisibleText(
    text: string,
    tenantId: string,
    sessionId: string,
  ): Promise<string> {
    if (!this.piiResolutionService) {
      return text;
    }

    try {
      const mappings = await this.piiResolutionService.getMappings(tenantId, sessionId);
      if (mappings && mappings.length > 0) {
        return applyPiiMappings(text, mappings);
      }
    } catch (error) {
      this.logger.warn(`[tenant:${tenantId}] Failed to retrieve PII mappings: ${error}`);
    }

    return text;
  }

  /**
   * Persist user and assistant messages to VoltAgent Memory.
   */
  async persistMessages(options: PersistMessagesOptions): Promise<void> {
    const logPrefix = options.logPrefix || `[tenant:${options.tenantId}]`;

    try {
      // Save user message
      const userMessage = {
        id: `msg-user-${Date.now()}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: options.userMessage }],
        metadata: { timestamp: new Date().toISOString() },
      };
      await options.memory.addMessage(userMessage, options.tenantUserId, options.sessionId);

      // Save assistant response
      const assistantMessage = {
        id: `msg-assistant-${Date.now()}`,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: options.assistantMessage }],
        metadata: { timestamp: new Date().toISOString(), model: options.selectedModel },
      };
      await options.memory.addMessage(assistantMessage, options.tenantUserId, options.sessionId);

      this.logger.debug(`${logPrefix} Persisted conversation messages to VoltAgent Memory`);
    } catch (error) {
      // Non-critical: log but don't fail the request
      this.logger.warn(`${logPrefix} Failed to persist messages to memory: ${error}`);
    }
  }
}
