/**
 * VoltAgent Workflows Export
 *
 * Exports workflow chains for HITL approval.
 */

// Approval workflow - used by ApprovalWorkflowService
export {
  createApprovalWorkflow,
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from './approval.workflow';
