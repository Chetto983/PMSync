/**
 * Stage automation types for CRM deal stage transitions.
 *
 * Automations are stored as JSON array on CrmStage.automations field.
 * When a deal moves INTO a stage, all enabled automations for that stage execute.
 */

export type AutomationType = 'NOTIFY' | 'CREATE_TASK';

export interface StageAutomationRule {
  type: AutomationType;
  enabled: boolean;
  params: NotifyParams | CreateTaskParams;
}

export interface NotifyParams {
  message?: string; // Optional custom message, defaults to "Deal {name} entered {stage}"
}

export interface CreateTaskParams {
  taskTitle?: string;    // Defaults to "Follow up: {dealName}"
  taskDescription?: string;
}

export interface StageAutomationJobData {
  tenantId: string;
  dealId: string;
  dealName: string;
  pipelineId: string;
  oldStageId: string;
  newStageId: string;
  newStageName: string;
  triggeredByAutomation: boolean; // Prevent automation loops
}
