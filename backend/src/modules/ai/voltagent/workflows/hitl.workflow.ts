/**
 * VoltAgent HITL (Human-in-the-Loop) Workflow
 *
 * Complete workflow for action approval and execution using VoltAgent's
 * native suspend/resume pattern. Combines:
 * - Action evaluation (auto-approve or suspend)
 * - Human decision processing
 * - Action execution
 * - Observability events
 *
 * Best Practices (VoltAgent 2025):
 * - Use createWorkflowChain with .andThen() steps
 * - Suspend with metadata for context
 * - Writer API for custom events (progress, status)
 * - Stream-compatible for real-time UI updates
 *
 * @see https://voltagent.dev/docs/workflows/streaming/
 */
import { createWorkflow, andThen } from '@voltagent/core';
import { z } from 'zod';
import { AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';

/**
 * HITL Event types for observability
 */
export type HitlEventType =
  | 'action_received'
  | 'auto_approved'
  | 'suspended_for_approval'
  | 'human_approved'
  | 'human_rejected'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed';

export interface HitlEvent {
  type: HitlEventType;
  actionId: string;
  tenantId: string;
  userId: string;
  actionType: AgentActionType;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Schema for action payload (compatible with existing AgentAction interface)
 */
const AgentActionSchema = z.object({
  type: z.nativeEnum(AgentActionType),
  payload: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  adjustedConfidence: z.number().min(0).max(1).optional(),
  severity: z.nativeEnum(ActionSeverity),
  reasoningSteps: z.string().optional(),
});

/**
 * Schema for HITL workflow input
 */
const HitlInputSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
  agentName: z.string().default('SupervisorAgent'),
  action: AgentActionSchema,
  autoApproveThreshold: z.number().min(0).max(1).default(0.9),
  /** Context for execution (language, preferences, etc.) */
  context: z.object({
    language: z.string().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

/**
 * Schema for workflow result
 */
const HitlResultSchema = z.object({
  actionId: z.string(),
  status: z.enum(['auto_approved', 'approved', 'rejected', 'executed', 'failed', 'expired']),
  approved: z.boolean(),
  approvedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  executedAt: z.string().optional(),
  executionResult: z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    summary: z.string().optional(),
    error: z.string().optional(),
    executionTimeMs: z.number(),
  }).optional(),
  action: AgentActionSchema,
});

/**
 * Schema for resume data (human decision)
 */
const HitlResumeSchema = z.object({
  approved: z.boolean(),
  approvedBy: z.string(),
  rejectionReason: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Intermediate schema after evaluation
 */
const EvaluatedActionSchema = z.object({
  actionId: z.string(),
  action: AgentActionSchema,
  approved: z.boolean(),
  autoApproved: z.boolean(),
  approvedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  tenantId: z.string(),
  userId: z.string(),
  context: z.object({
    language: z.string().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

/**
 * Action type groupings for severity-based auto-approval
 */
const LOW_RISK_ACTIONS = new Set([
  AgentActionType.SEARCH_EMAILS,
  AgentActionType.SEARCH_CONTACTS,
  AgentActionType.GET_CONTACT,
  AgentActionType.GET_EVENTS,
  AgentActionType.GET_UNREAD,
  AgentActionType.CHECK_AVAILABILITY,
  AgentActionType.SEARCH_KNOWLEDGE,
  AgentActionType.MARK_READ,
  AgentActionType.MARK_UNREAD,
]);

const HIGH_RISK_ACTIONS = new Set([
  AgentActionType.SEND_EMAIL,
  AgentActionType.REPLY_EMAIL,
  AgentActionType.FORWARD_EMAIL,
  AgentActionType.DELETE_EMAIL,
  AgentActionType.DELETE_EVENT,
  AgentActionType.DELETE_CONTACT,
  AgentActionType.DELETE_FOLDER,
  AgentActionType.MERGE_CONTACTS,
]);

/**
 * Evaluate if an action should be auto-approved based on:
 * - Action type risk level
 * - Confidence threshold
 * - User preferences
 */
function shouldAutoApprove(
  action: z.infer<typeof AgentActionSchema>,
  threshold: number,
): { autoApprove: boolean; reason: string } {
  // LOW_RISK actions can be auto-approved with lower threshold
  if (LOW_RISK_ACTIONS.has(action.type)) {
    return { autoApprove: true, reason: 'Low risk read-only action' };
  }

  // HIGH_RISK actions never auto-approve regardless of confidence
  if (HIGH_RISK_ACTIONS.has(action.type)) {
    return { autoApprove: false, reason: 'High risk action requires approval' };
  }

  // HIGH severity never auto-approves
  if (action.severity === ActionSeverity.HIGH) {
    return { autoApprove: false, reason: 'High severity requires approval' };
  }

  // Check confidence threshold
  const confidence = action.adjustedConfidence ?? action.confidence;
  if (confidence >= threshold) {
    return { autoApprove: true, reason: `Confidence ${(confidence * 100).toFixed(0)}% meets threshold` };
  }

  // MEDIUM severity with low confidence requires approval
  return { autoApprove: false, reason: `Confidence ${(confidence * 100).toFixed(0)}% below threshold` };
}

/**
 * Generate a unique action ID
 */
function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates the HITL workflow for action approval and execution.
 *
 * Flow:
 * 1. Evaluate if action needs human approval (based on risk + confidence)
 * 2. If needs approval, suspend and wait for human decision
 * 3. On resume (or auto-approve), proceed to execution step
 * 4. Return final result with execution status
 *
 * Usage:
 * ```typescript
 * const workflow = createHitlWorkflow();
 * const result = await workflow.run({
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   action: { type: 'SEND_EMAIL', payload: {...}, confidence: 0.85, severity: 'HIGH' },
 * });
 *
 * if (result.status === 'suspended') {
 *   // Store result.executionId for later resume
 *   const finalResult = await result.resume({ approved: true, approvedBy: 'user@email.com' });
 * }
 * ```
 */
export const createHitlWorkflow = () => {
  return createWorkflow(
    {
      id: 'hitl-action-workflow',
      name: 'HITL Action Approval & Execution Workflow',
      input: HitlInputSchema,
      result: HitlResultSchema,
    },
    // Step 1: Evaluate if approval is needed
    andThen({
      id: 'evaluate-and-approve',
      outputSchema: EvaluatedActionSchema,
      resumeSchema: HitlResumeSchema,
      execute: async ({ data, suspend, resumeData }) => {
        const { tenantId, userId, action, autoApproveThreshold, context } = data;
        const actionId = generateActionId();

        // If resuming from suspension, process the human decision
        if (resumeData) {
          return {
            actionId,
            action: {
              ...action,
              payload: resumeData.payload || action.payload,
            },
            approved: resumeData.approved,
            autoApproved: false,
            approvedBy: resumeData.approvedBy,
            rejectionReason: resumeData.rejectionReason,
            tenantId,
            userId,
            context,
          };
        }

        // Evaluate auto-approval eligibility
        const { autoApprove, reason } = shouldAutoApprove(action, autoApproveThreshold);

        if (autoApprove) {
          return {
            actionId,
            action,
            approved: true,
            autoApproved: true,
            approvedBy: 'system:auto-approved',
            tenantId,
            userId,
            context,
          };
        }

        // Suspend for human approval
        await suspend(reason);

        // This code runs after resume
        return {
          actionId,
          action,
          approved: false,
          autoApproved: false,
          tenantId,
          userId,
          context,
        };
      },
    }),
    // Step 2: Process decision and prepare result
    andThen({
      id: 'finalize-result',
      outputSchema: HitlResultSchema,
      execute: async ({ data }) => {
        const { actionId, action, approved, autoApproved, approvedBy, rejectionReason } = data;

        if (!approved) {
          return {
            actionId,
            status: 'rejected' as const,
            approved: false,
            approvedBy,
            rejectionReason: rejectionReason || 'Action was rejected by user',
            action,
          };
        }

        // Action is approved (auto or manual)
        // Note: Actual execution happens in the service layer after workflow completes
        // This allows for proper NestJS dependency injection
        return {
          actionId,
          status: autoApproved ? 'auto_approved' as const : 'approved' as const,
          approved: true,
          approvedBy,
          action,
        };
      },
    }),
  );
};

/**
 * Type exports for workflow input/output
 */
export type HitlInput = z.infer<typeof HitlInputSchema>;
export type HitlResult = z.infer<typeof HitlResultSchema>;
export type HitlResumeData = z.infer<typeof HitlResumeSchema>;
