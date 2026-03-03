import { apiClient, API_BASE_URL } from '../api-client';
import { getAuthToken } from '../utils/auth-token';

// ============ Types (kept for Settings/component compatibility) ============

export type JobRole = string;
export type CommunicationStyle = 'FORMAL' | 'CASUAL' | 'TECHNICAL' | 'CREATIVE';
export type ResponseLength = 'BRIEF' | 'MODERATE' | 'DETAILED';
export type ProactivityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type UserProfile = {
  jobRole: JobRole;
  jobTitle?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  communicationStyle: CommunicationStyle;
  responseLength: ResponseLength;
  proactivityLevel: ProactivityLevel;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  timezone: string;
  language: string;
};

export type MemoryType = 'PREFERENCE' | 'FACT' | 'PATTERN' | 'INTERACTION' | 'CONTACT_NOTE';
export type MemorySource = 'EXPLICIT' | 'INFERRED' | 'BEHAVIOR';

export type Memory = {
  id: string;
  tenantId?: string;
  userId?: string;
  memoryType: MemoryType;
  content: string;
  source?: string | null;
  confidence?: number;
  usageCount?: number;
  lastUsedAt?: string | null;
  category?: string | null;
  tags?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

export type StoreMemoryPayload = {
  type: MemoryType;
  content: string;
  category?: string;
  source?: MemorySource;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

// ============ Core Types ============

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  steps?: Array<{ tool: string; output: string }>;
};

export type ChatResult = {
  text: string;
  requiresApproval?: boolean;
  pendingActions?: PendingActionSummary[];
  conversationId?: string;
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

export type AgentInfo = {
  name: string;
  description: string;
  capabilities: string[];
  supportedIntents: string[];
};

export type PendingAction = {
  id: string;
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
  sessionId?: string;
  reasoningSteps?: string;
};

export type ActionCounts = {
  PENDING?: number;
  APPROVED?: number;
  REJECTED?: number;
  EXECUTED?: number;
  FAILED?: number;
  EXPIRED?: number;
};

export type ActionExecutionResult = {
  success: boolean;
  error?: string;
  summary?: string | string[];
  data?: Record<string, unknown>;
  executionTimeMs: number;
};

export type ApprovalResponse = {
  status: 'approved' | 'rejected';
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  executionResult?: ActionExecutionResult;
  action?: {
    actionType: string;
    summary: string;
    payload?: Record<string, unknown>;
  };
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

export type WritingStyleProfile = {
  id: string;
  tenantId: string;
  userId: string;
  sampleCount: number;
  avgSentenceLength: number;
  avgParagraphLines: number;
  avgWordsPerEmail: number;
  sentimentPolarity: number;
  formalityScore: number;
  emojiRate: number;
  questionRate: number;
  greetingPresent: boolean;
  signOffPresent: boolean;
  preferredGreetings: string[];
  preferredSignOffs: string[];
  lastAnalyzed: string;
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

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  lastActiveAt: string;
  messageCount: number;
};

export type MessagePart = {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  /** @deprecated Remove by 2026-06-01: Use parts instead */
  content: string;
  parts?: MessagePart[];
  toolCalls?: Array<{ tool: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ tool: string; result: unknown }>;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  lastActiveAt: string;
  messageCount: number;
  createdAt: string;
  messages: ConversationMessage[];
};

export type IntentResult = {
  intent: string;
  confidence: number;
  reasoning: string;
  suggestedAgents: string[];
};

export type MultiAgentResponse = ChatResult & {
  sessionId?: string;
  conversationId?: string;
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

export type StreamEvent =
  | { type: 'metadata'; conversationId: string }
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId?: string }
  | { type: 'error'; message: string };

export interface CachedDeadline {
  id: string;
  title: string;
  description?: string;
  deadline: string;
  sourceType: string;
  sourceId?: string;
  status: string;
  confidence?: number;
  remindBefore: number[];
  createdAt: string;
}

// ============ Email Intelligence Types ============

export type SentimentResult = {
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tone: string;
  emotion: string;
  emotionalIntensity: number;
  churnRisk: boolean;
  aspects?: Record<string, string>;
  confidence: number;
  reasoning?: string;
};

export type PriorityResult = {
  score: number;
  urgency: 'high' | 'medium' | 'low';
  recommendation: 'handle_now' | 'handle_today' | 'handle_this_week' | 'can_wait' | 'archive';
  factors: string[];
};

export type EmailAnalysisResult = {
  sentiment: string;
  tone: string;
  urgency: string;
  intent: string;
  priority: number;
  escalationRisk: boolean;
  keyTopics: string[];
  suggestedResponse: string;
  confidence: number;
};

export interface DraftStats {
  totalDrafts: number;
  acceptRate: number;
  editRate: number;
  rejectRate: number;
  avgEditDistance: number;
}

// ============ Email Intelligence API ============

export const aiApi = {
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
    senderName?: string;
    signature?: string;
    threadContext?: Array<{ subject?: string; body?: string }>;
  }) {
    return apiClient.post<{ success: boolean; body: string; subject?: string }>(
      '/ai/compose',
      payload,
    );
  },

  analyzeSentiment(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean } & SentimentResult>(
      `/ai/sentiment/${emailId}`,
      locale ? { locale } : undefined,
    );
  },

  calculatePriority(
    emailId: string,
    locale?: string,
    senderImportance?: 'vip' | 'important' | 'normal' | 'low',
  ) {
    const body: { locale?: string; senderImportance?: string } = {};
    if (locale) body.locale = locale;
    if (senderImportance) body.senderImportance = senderImportance;
    return apiClient.post<{ success: boolean } & PriorityResult>(
      `/ai/priority/${emailId}`,
      Object.keys(body).length > 0 ? body : undefined,
    );
  },

  analyzeEmail(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean } & EmailAnalysisResult>(
      `/ai/analyze/${emailId}`,
      locale ? { locale } : undefined,
    );
  },
};

// ============ VoltAgent Chat API ============

export const voltAgentApi = {
  chat(payload: {
    message: string;
    conversationId?: string;
    locale?: string;
    model?: 'small' | 'medium' | 'large';
  }) {
    return apiClient.post<ChatResult>('/ai/chat', payload);
  },

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
    onConversationId?: (conversationId: string) => void,
  ): AbortController {
    const controller = new AbortController();

    fetch(`${API_BASE_URL}/api/v1/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (response) => {
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
                if (event.type === 'metadata') {
                  onConversationId?.(event.conversationId);
                } else if (event.type === 'chunk') {
                  onChunk(event.content);
                } else if (event.type === 'done') {
                  if (event.conversationId) onConversationId?.(event.conversationId);
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
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          onError?.(error.message || 'Stream failed');
        }
      });

    return controller;
  },

  // Pending Actions (HITL)
  getPendingActions() {
    return apiClient.get<{ actions: PendingAction[]; total: number }>(
      '/ai/actions/pending',
    );
  },

  approveAction(executionId: string, payload?: Record<string, unknown>) {
    return apiClient.post<ApprovalResponse>(
      `/ai/actions/${executionId}/approve`,
      { payload },
    );
  },

  rejectAction(executionId: string, rejectionReason?: string) {
    return apiClient.post<ApprovalResponse>(
      `/ai/actions/${executionId}/reject`,
      { approved: false, rejectionReason },
    );
  },

  // Stats
  getWritingStyle() {
    return apiClient.get<{ success: boolean; profile: WritingStyleProfile }>(
      '/ai/stats/writing-style',
    );
  },

  // Daily Briefing
  getBriefing() {
    return apiClient.get<{ success: boolean; briefing: Record<string, unknown> }>(
      '/ai/briefing',
    );
  },

  refreshBriefing() {
    return apiClient.post<{ success: boolean; jobId: string; message: string }>(
      '/ai/briefing/refresh',
    );
  },

  // Conversations
  listConversations(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversations: ConversationSummary[];
      count: number;
    }>('/ai/conversations', { params });
  },

  getConversation(conversationId: string, params?: { messageLimit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversation: ConversationDetail;
    }>(`/ai/conversations/${encodeURIComponent(conversationId)}`, { params });
  },

  deleteConversation(conversationId: string) {
    return apiClient.post<{ success: boolean; message: string }>(
      `/ai/conversations/${encodeURIComponent(conversationId)}/delete`,
    );
  },

  // Deadlines
  getUpcomingDeadlines(params?: { days?: number }) {
    return apiClient.get<{
      success: boolean;
      enabled: boolean;
      count: number;
      deadlines: CachedDeadline[];
    }>('/ai/deadlines', { params });
  },

  // Follow-ups
  getPendingFollowUps(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/ai/follow-ups/pending', { params });
  },

  // Analytics
  getEmailAnalytics(params?: { period?: 'day' | 'week' | 'month' }) {
    return apiClient.get<{ success: boolean; analytics: Record<string, unknown> }>(
      '/ai/analytics/email',
      { params },
    );
  },

  // AI Draft Generation
  generateReplyDraft(params: {
    emailId: string;
    tone?: string;
    instructions?: string;
    locale?: string;
  }) {
    return apiClient.post<{ draftId: string; body: string; subject: string }>(
      '/ai/drafts/generate',
      params,
    );
  },

  recordDraftFeedback(params: {
    draftId: string;
    action: 'accepted' | 'edited' | 'rejected' | 'regenerated';
    sentBody?: string;
  }) {
    return apiClient.post('/ai/draft-feedback', params);
  },

  getDraftStats() {
    return apiClient.get<{ success: boolean; stats: DraftStats }>('/ai/draft-stats');
  },

  updateManualSamples(params: { samples: string; providerId?: string }) {
    return apiClient.post<{ success: boolean }>(
      '/ai/writing-style/manual-samples',
      params,
    );
  },
};

// Legacy API alias (maps to voltAgentApi)
export const multiAgentApi = {
  processMessage: async (payload: {
    message: string;
    sessionId?: string;
    conversationId?: string;
    forceAgent?: string;
    autoApproveThreshold?: number;
    locale?: string;
  }): Promise<MultiAgentResponse> => {
    const convId = payload.conversationId || payload.sessionId;
    const response = await voltAgentApi.chat({
      message: payload.message,
      conversationId: convId,
      locale: payload.locale,
    });
    const result = response.data;
    const responseConvId =
      (result as { conversationId?: string }).conversationId || convId;
    return {
      ...result,
      sessionId: responseConvId,
      conversationId: responseConvId,
      messages: result.text ? [result.text] : [],
      pendingActionIds:
        result.pendingActions?.map((a: PendingActionSummary) => a.id) ?? [],
      executedActionIds: [],
    };
  },
  getAgents: () => Promise.resolve({ agents: [] as AgentInfo[] }),
  getPendingActions: (_params?: { status?: string; limit?: number; offset?: number }) =>
    voltAgentApi.getPendingActions(),
  approveAction: voltAgentApi.approveAction,
  rejectAction: voltAgentApi.rejectAction,
};
