/**
 * VoltAgent Workflows Export
 *
 * Exports all workflow chains for HITL and automation.
 */

// Simple approval workflow (backward compatible)
export {
  createApprovalWorkflow,
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from './approval.workflow';

// Advanced HITL workflow with action type handling and observability
export {
  createHitlWorkflow,
  type HitlInput,
  type HitlResult,
  type HitlResumeData,
  type HitlEventType,
  type HitlEvent,
} from './hitl.workflow';
