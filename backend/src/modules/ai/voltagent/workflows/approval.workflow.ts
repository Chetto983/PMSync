/**
 * VoltAgent Approval Workflow
 *
 * Implements Human-in-the-Loop (HITL) using VoltAgent's native
 * suspend/resume workflow pattern.
 */
import { createWorkflow, andThen } from '@voltagent/core';
import { z } from 'zod';

/**
 * Schema for action data requiring approval.
 */
const ActionSchema = z.object({
  actionType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  summary: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  tenantId: z.string(),
  userId: z.string(),
  agentName: z.string().default('SupervisorAgent'),
});

/**
 * Schema for workflow input.
 */
const ApprovalInputSchema = z.object({
  action: ActionSchema,
  autoApproveThreshold: z.number().min(0).max(1).default(0.9),
});

/**
 * Schema for workflow result.
 */
const ApprovalResultSchema = z.object({
  approved: z.boolean(),
  approvedBy: z.string().optional(),
  approvedAt: z.date().optional(),
  rejectionReason: z.string().optional(),
  executedAt: z.string().optional(),
  action: ActionSchema,
  executionResult: z.object({
    success: z.boolean(),
    data: z.record(z.string(), z.unknown()).optional(),
    summary: z.union([z.string(), z.array(z.string())]).optional(),
    error: z.string().optional(),
    executionTimeMs: z.number(),
  }).optional(),
});

/**
 * Schema for resume data (human decision).
 */
const ResumeSchema = z.object({
  approved: z.boolean(),
  approvedBy: z.string(),
  rejectionReason: z.string().optional(),
});

/**
 * Intermediate type for evaluated action.
 */
const EvaluatedActionSchema = z.object({
  action: ActionSchema,
  approved: z.boolean(),
  approvedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
});

/**
 * Creates the approval workflow.
 *
 * Flow:
 * 1. Evaluate if action needs human approval
 * 2. If yes, suspend and wait for human decision
 * 3. On resume, process the approval/rejection
 * 4. Execute approved actions or log rejections
 */
export const createApprovalWorkflow = () => {
  return createWorkflow(
    {
      id: 'action-approval',
      name: 'Action Approval Workflow',
      input: ApprovalInputSchema,
      result: ApprovalResultSchema,
    },
    // Step 1: Evaluate if approval is needed
    andThen({
      id: 'evaluate-approval',
      outputSchema: EvaluatedActionSchema,
      resumeSchema: ResumeSchema,
      execute: async ({ data, suspend, resumeData }) => {
        const { action, autoApproveThreshold } = data;

        // If resuming from suspension, process the human decision
        if (resumeData) {
          return {
            action,
            approved: resumeData.approved,
            approvedBy: resumeData.approvedBy,
            rejectionReason: resumeData.rejectionReason,
          };
        }

        // HIGH severity always requires approval
        if (action.severity === 'HIGH') {
          await suspend(`High severity action requires approval: ${action.summary}`);
          // Code below never executes during suspension
          return { action, approved: false };
        }

        // Check confidence threshold for auto-approval
        const confidence = action.confidence ?? 0.8;
        if (confidence >= autoApproveThreshold) {
          return {
            action,
            approved: true,
            approvedBy: 'auto-approved',
          };
        }

        // MEDIUM severity or low confidence: require approval
        await suspend(`Action requires approval: ${action.summary}`);
        return { action, approved: false };
      },
    }),
    // Step 2: Process the decision
    andThen({
      id: 'process-decision',
      outputSchema: ApprovalResultSchema,
      execute: async ({ data }) => {
        const { action, approved, approvedBy, rejectionReason } = data;

        if (!approved) {
          return {
            action,
            approved: false,
            approvedBy,
            rejectionReason: rejectionReason || 'Action was rejected',
          };
        }

        return {
          action,
          approved: true,
          approvedBy,
          executedAt: new Date().toISOString(),
        };
      },
    }),
  );
};

/**
 * Type exports for workflow input/output.
 */
export type ApprovalInput = z.infer<typeof ApprovalInputSchema>;
export type ApprovalResult = z.infer<typeof ApprovalResultSchema>;
export type ApprovalResumeData = z.infer<typeof ResumeSchema>;
