import { apiClient, API_BASE_URL } from '../api-client';

// Helper to get auth token from storage
function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || '';
    }
  } catch {
    // Ignore
  }
  return '';
}

// ============ Types ============

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  steps?: Array<{ tool: string; output: string }>;
};

export type ChatResult = {
  text: string;
  requiresApproval?: boolean;
  pendingActions?: PendingActionSummary[];
};

export type PendingActionSummary = {
  id: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
  summary: string;
};

export type MemorySearchItem = {
  id: string;
  subject: string | null;
  snippet: string;
  source: string | null;
  emailId: string | null;
  from: string | null;
  receivedAt: string | null;
  distance: number | null;
  score: number | null;
  metadata: Record<string, unknown> | null;
};

// VoltAgent Types (previously in multi-agent.ts)

export type AgentInfo = {
  name: string;
  description: string;
  capabilities: string[];
  supportedIntents: string[];
};

export type PendingAction = {
  id: string; // alias for executionId for backwards compatibility
  executionId: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  payload: Record<string, unknown>;
  suspendReason: string;
  suspendedAt: string;
  userId: string;
  agentName: string;
  confidence?: number;
  adjustedConfidence?: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
};

export type ActionCounts = {
  PENDING?: number;
  APPROVED?: number;
  REJECTED?: number;
  EXECUTED?: number;
  FAILED?: number;
  EXPIRED?: number;
};

export type LearningProfileStats = {
  agentName: string;
  actionType: string;
  totalAttempts: number;
  approvalRate: number;
  successRate: number;
  confidenceBoost: number;
  avgOriginalConfidence: number;
  avgAdjustedConfidence: number;
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

export type KnowledgeHit = {
  id: string;
  subject: string | null;
  snippet: string;
  source?: string | null;
  score?: number | null;
  emailId?: string | null;
  metadata?: Record<string, unknown> | null;
};

// Legacy types for backwards compatibility
export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type IntentResult = {
  intent: string;
  confidence: number;
  reasoning: string;
  suggestedAgents: string[];
};

// MultiAgentResponse with extended fields for backwards compatibility
export type MultiAgentResponse = ChatResult & {
  sessionId?: string;
  messages?: string[];
  pendingActionIds?: string[];
  executedActionIds?: string[];
  intent?: IntentResult;
  agentUsed?: string;
  executionTimeMs?: number;
  needsMoreInfo?: boolean;
  clarifyingQuestions?: string[];
  knowledgeHits?: KnowledgeHit[];
};

// SSE Stream Event Types
export type StreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

// ============ Email Insights API ============

export const aiApi = {
  // Email insights (backed by AiController)
  summarizeEmail(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean; summary: string }>(
      `/ai/summarize/${emailId}`,
      locale ? { locale } : undefined,
    );
  },

  generateSmartReplies(emailId: string, locale?: string, tone?: string) {
    const body: { locale?: string; tone?: string } = {};
    if (locale) body.locale = locale;
    if (tone) body.tone = tone;
    return apiClient.post<{ success: boolean; suggestions: string[] }>(
      `/ai/smart-reply/${emailId}`,
      Object.keys(body).length > 0 ? body : undefined,
    );
  },

  categorizeEmail(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean; labels: string[] }>(
      `/ai/categorize/${emailId}`,
      locale ? { locale } : undefined,
    );
  },

  searchMemory(payload: { emailId?: string; query?: string; locale?: string; limit?: number }) {
    return apiClient.post<{ success: boolean; usedQuery: string; items: MemorySearchItem[] }>(
      '/ai/memory/search',
      payload,
    );
  },

  composeEmail(payload: {
    prompt: string;
    to?: string[];
    subject?: string;
    tone?: string;
    locale?: string;
    variant?: string;
  }) {
    return apiClient.post<{ success: boolean; body: string; subject?: string; variantUsed?: string }>(
      '/ai/compose',
      payload,
    );
  },
};

// ============ VoltAgent Chat API ============

export const voltAgentApi = {
  // Send chat message (non-streaming)
  chat(payload: {
    message: string;
    conversationId?: string;
    locale?: string;
    model?: 'small' | 'medium' | 'large';
  }) {
    return apiClient.post<ChatResult>('/api/v1/voltagent/chat', payload);
  },

  // Stream chat response via SSE
  streamChat(
    payload: {
      message: string;
      conversationId?: string;
      locale?: string;
      model?: 'small' | 'medium' | 'large';
    },
    onChunk: (chunk: string) => void,
    onDone?: () => void,
    onError?: (error: string) => void,
  ): AbortController {
    const controller = new AbortController();

    fetch(`${API_BASE_URL}/api/v1/voltagent/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        onError?.(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError?.('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              if (event.type === 'chunk') {
                onChunk(event.content);
              } else if (event.type === 'done') {
                onDone?.();
              } else if (event.type === 'error') {
                onError?.(event.message);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }).catch((error) => {
      if (error.name !== 'AbortError') {
        onError?.(error.message || 'Stream failed');
      }
    });

    return controller;
  },

  // ============ Pending Actions ============

  getPendingActions() {
    return apiClient.get<{ actions: PendingAction[]; total: number }>(
      '/api/v1/voltagent/actions/pending',
    );
  },

  getPendingAction(executionId: string) {
    return apiClient.get<PendingAction>(`/api/v1/voltagent/actions/${executionId}`);
  },

  approveAction(executionId: string) {
    return apiClient.post<{ status: 'approved' }>(`/api/v1/voltagent/actions/${executionId}/approve`);
  },

  rejectAction(executionId: string, rejectionReason?: string) {
    return apiClient.post<{ status: 'rejected' }>(`/api/v1/voltagent/actions/${executionId}/reject`, {
      approved: false,
      rejectionReason,
    });
  },

  // ============ Stats & Learning ============

  getActionCounts() {
    return apiClient.get<{ success: boolean; counts: ActionCounts }>(
      '/api/v1/voltagent/stats/action-counts',
    );
  },

  getLearningStats(userId?: string) {
    const params = userId ? { userId } : undefined;
    return apiClient.get<{ success: boolean; stats: LearningProfileStats[] }>(
      '/api/v1/voltagent/stats/learning',
      { params },
    );
  },

  getAggregateStats() {
    return apiClient.get<{ success: boolean; stats: AggregateStats }>(
      '/api/v1/voltagent/stats/aggregate',
    );
  },

  getFeedback(params?: { limit?: number; offset?: number; agentName?: string }) {
    return apiClient.get<{ success: boolean; feedback: ActionFeedback[]; total: number }>(
      '/api/v1/voltagent/feedback',
      { params },
    );
  },

  resetLearning(payload?: { agentName?: string; actionType?: string }) {
    return apiClient.post<{ success: boolean; message: string }>(
      '/api/v1/voltagent/learning/reset',
      payload,
    );
  },
};

// Legacy API alias for backwards compatibility (maps to voltAgentApi)
export const multiAgentApi = {
  processMessage: async (payload: {
    message: string;
    sessionId?: string;
    forceAgent?: string;
    autoApproveThreshold?: number;
    locale?: string;
  }): Promise<MultiAgentResponse> => {
    const response = await voltAgentApi.chat({
      message: payload.message,
      conversationId: payload.sessionId,
      locale: payload.locale,
    });
    const result = response.data;
    // Map ChatResult to MultiAgentResponse format
    return {
      ...result,
      messages: result.text ? [result.text] : [],
      pendingActionIds: result.pendingActions?.map((a: PendingActionSummary) => a.id) ?? [],
      executedActionIds: [],
    };
  },
  getAgents: () => Promise.resolve({ agents: [] as AgentInfo[] }),
  getPendingActions: (_params?: { status?: string; limit?: number; offset?: number }) =>
    voltAgentApi.getPendingActions(),
  getPendingAction: voltAgentApi.getPendingAction,
  approveAction: voltAgentApi.approveAction,
  rejectAction: voltAgentApi.rejectAction,
  getActionCounts: voltAgentApi.getActionCounts,
  getLearningStats: voltAgentApi.getLearningStats,
  getAggregateStats: voltAgentApi.getAggregateStats,
  getFeedback: voltAgentApi.getFeedback,
  resetLearning: voltAgentApi.resetLearning,
};
