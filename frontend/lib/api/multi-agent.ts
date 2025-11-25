import { apiClient } from '../api-client';

// Types
export type AgentInfo = {
  name: string;
  description: string;
  capabilities: string[];
  supportedIntents: string[];
};

export type PendingAction = {
  id: string;
  tenantId: string;
  userId: string;
  sessionId: string | null;
  agentName: string;
  actionType: string;
  payload: Record<string, unknown>;
  confidence: number;
  adjustedConfidence: number | null;
  severity: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  executedAt: string | null;
  executionSuccess: boolean | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type ActionCounts = {
  PENDING?: number;
  APPROVED?: number;
  REJECTED?: number;
  EXECUTED?: number;
  FAILED?: number;
  EXPIRED?: number;
};

export type LearningProfile = {
  id: string;
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  approvalCount: number;
  rejectionCount: number;
  successCount: number;
  failureCount: number;
  confidenceBoost: number;
  lastUpdated: string;
};

export type LearningStats = {
  profiles: LearningProfile[];
  summary: {
    totalAttempts: number;
    overallApprovalRate: number;
    overallSuccessRate: number;
  };
};

export type AggregateStats = {
  totalAttempts: number;
  overallApprovalRate: number;
  overallSuccessRate: number;
  agentBreakdown: Record<string, {
    totalAttempts: number;
    approvalRate: number;
    actionTypes: string[];
  }>;
};

export type IntentResult = {
  intent: string;
  confidence: number;
  reasoning: string;
  suggestedAgents: string[];
};

export type MultiAgentResponse = {
  messages: string[];
  pendingActionIds: string[];
  executedActionIds: string[];
  intent: IntentResult;
  agentUsed: string;
  executionTimeMs: number;
  needsMoreInfo: boolean;
  clarifyingQuestions?: string[];
};

export type ActionFeedback = {
  id: string;
  actionId: string;
  tenantId: string;
  userId: string;
  agentName: string;
  actionType: string;
  wasApproved: boolean;
  wasExecuted: boolean;
  wasSuccessful: boolean;
  originalConfidence: number;
  adjustedConfidence: number | null;
  userFeedback: string | null;
  createdAt: string;
};

// API
export const multiAgentApi = {
  // Process a message through the multi-agent system
  processMessage(payload: {
    message: string;
    sessionId?: string;
    forceAgent?: string;
    autoApproveThreshold?: number;
    locale?: string; // User's preferred language (en, it, es, fr, de)
  }) {
    return apiClient.post<MultiAgentResponse>('/ai/multi-agent/process', payload);
  },

  // Get registered agents
  getAgents() {
    return apiClient.get<{ agents: AgentInfo[] }>('/ai/multi-agent/agents');
  },

  // Get pending actions
  getPendingActions(params?: { status?: string; limit?: number }) {
    return apiClient.get<PendingAction[]>('/ai/multi-agent/pending-actions', { params });
  },

  // Get a specific pending action
  getPendingAction(actionId: string) {
    return apiClient.get<PendingAction>(`/ai/multi-agent/pending-actions/${actionId}`);
  },

  // Approve a pending action
  approveAction(actionId: string) {
    return apiClient.post<{ success: boolean; error?: string }>(
      `/ai/multi-agent/pending-actions/${actionId}/approve`
    );
  },

  // Reject a pending action
  rejectAction(actionId: string, reason?: string) {
    return apiClient.post<{ success: boolean }>(
      `/ai/multi-agent/pending-actions/${actionId}/reject`,
      { reason }
    );
  },

  // Get action counts by status
  getActionCounts() {
    return apiClient.get<{ success: boolean; counts: ActionCounts }>(
      '/ai/multi-agent/stats/action-counts'
    );
  },

  // Get learning stats
  getLearningStats() {
    return apiClient.get<{ success: boolean; profiles: LearningProfile[]; summary: LearningStats['summary'] }>(
      '/ai/multi-agent/stats/learning'
    );
  },

  // Get aggregate stats
  getAggregateStats() {
    return apiClient.get<{ success: boolean; stats: AggregateStats }>(
      '/ai/multi-agent/stats/aggregate'
    );
  },

  // Get feedback history
  getFeedback(params?: { limit?: number; offset?: number }) {
    return apiClient.get<ActionFeedback[]>('/ai/multi-agent/feedback', { params });
  },

  // Reset learning for a specific action type or all
  resetLearning(payload?: { agentName?: string; actionType?: string }) {
    return apiClient.post<{ success: boolean; deleted: number }>(
      '/ai/multi-agent/learning/reset',
      payload
    );
  },
};
