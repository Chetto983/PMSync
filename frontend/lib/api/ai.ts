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

// Conversation types (VoltAgent session management)
export type ConversationSummary = {
  id: string;
  title: string | null;
  lastActiveAt: string;
  messageCount: number;
};

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ tool: string; result: unknown }>;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
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

// MultiAgentResponse with extended fields for backwards compatibility
export type MultiAgentResponse = ChatResult & {
  sessionId?: string;
  conversationId?: string; // Alias for sessionId (PostgreSQL conversations)
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

// ============ VoltAgent (AI Secretary) Types ============

export type LongTermMemoryCategory =
  | 'PREFERENCE'
  | 'CONTACT'
  | 'SCHEDULE'
  | 'HABIT'
  | 'RELATIONSHIP'
  | 'PROJECT'
  | 'GENERAL';

export interface LongTermMemoryItem {
  id: string;
  memory: string;
  category?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  score?: number;
  createdAt?: string;
}

export interface CachedDeadline {
  id: string;
  title: string;
  description?: string;
  deadline: string; // ISO string
  sourceType: string;
  sourceId?: string;
  status: string;
  confidence?: number;
  remindBefore: number[];
  createdAt: string;
}

export interface ExtractedDeadlinePreview {
  date: string; // ISO string
  text: string;
  context: string;
  confidence: number;
  isRecurring?: boolean;
}

// ============ Email Insights API ============

// ============ Email Intelligence Types (2025 Best Practices) ============

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

  // ============ Email Intelligence (2025 Best Practices) ============

  /**
   * Analyze email sentiment with aspect-based analysis
   * Returns emotion detection, churn risk, and aspect-based sentiments
   */
  analyzeSentiment(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean } & SentimentResult>(
      `/ai/sentiment/${emailId}`,
      locale ? { locale } : undefined,
    );
  },

  /**
   * Calculate email priority with multi-factor scoring
   */
  calculatePriority(emailId: string, locale?: string, senderImportance?: 'vip' | 'important' | 'normal' | 'low') {
    const body: { locale?: string; senderImportance?: string } = {};
    if (locale) body.locale = locale;
    if (senderImportance) body.senderImportance = senderImportance;
    return apiClient.post<{ success: boolean } & PriorityResult>(
      `/ai/priority/${emailId}`,
      Object.keys(body).length > 0 ? body : undefined,
    );
  },

  /**
   * Comprehensive email analysis (sentiment + priority + intent)
   */
  analyzeEmail(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean } & EmailAnalysisResult>(
      `/ai/analyze/${emailId}`,
      locale ? { locale } : undefined,
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

  // ============ Submit Actions for Approval ============

  submitAction(payload: {
    actionType: string;
    payload: Record<string, unknown>;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    summary: string;
    confidence?: number;
    autoApproveThreshold?: number;
  }) {
    return apiClient.post<Record<string, unknown>>(
      '/api/v1/voltagent/actions/submit',
      payload,
    );
  },

  // ============ Performance Telemetry ============

  getPerformanceStats() {
    return apiClient.get<{
      success: boolean;
      stats: {
        totalOperations: number;
        avgLatencyMs: number;
        successRate: number;
        totalTokens: number;
      };
    }>('/api/v1/voltagent/stats/performance');
  },

  getRecentMetrics(params?: { agentName?: string; limit?: number }) {
    return apiClient.get<{
      success: boolean;
      metrics: Array<{
        agentName: string;
        duration: number;
        totalTokens: number;
        toolCalls: number;
        success: boolean;
        timestamp: string;
      }>;
      count: number;
    }>('/api/v1/voltagent/stats/metrics', { params });
  },

  getOptimizationStats() {
    return apiClient.get<{
      success: boolean;
      optimizations: Record<string, unknown>;
    }>('/api/v1/voltagent/stats/optimizations');
  },

  // ============ Semantic Cache ============

  invalidateSemanticCache(pattern?: string) {
    return apiClient.post<{
      success: boolean;
      message: string;
      entriesRemoved: number;
    }>('/api/v1/voltagent/cache/invalidate', pattern ? { pattern } : {});
  },

  getCacheAnalytics() {
    return apiClient.get<{
      success: boolean;
      analytics: Record<string, unknown>;
      config: Record<string, unknown>;
      recommendations: unknown;
    }>('/api/v1/voltagent/cache/analytics');
  },

  resetCacheAnalytics() {
    return apiClient.post<{ success: boolean; message: string }>(
      '/api/v1/voltagent/cache/analytics/reset',
    );
  },

  setAdaptiveThreshold(threshold: number) {
    return apiClient.post<
      | { success: true; message: string; newThreshold: number }
      | { success: false; error: string }
    >('/api/v1/voltagent/cache/threshold', { threshold });
  },

  // ============ Daily Briefing ============

  getBriefing() {
    return apiClient.get<{ success: boolean; briefing: Record<string, unknown> }>(
      '/api/v1/voltagent/briefing',
    );
  },

  refreshBriefing() {
    return apiClient.post<{ success: boolean; jobId: string; message: string }>(
      '/api/v1/voltagent/briefing/refresh',
    );
  },

  getBriefingStatus() {
    return apiClient.get<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/voltagent/briefing/status',
    );
  },

  // ============ Long-Term Memory ============

  listMemories(params?: { category?: LongTermMemoryCategory; limit?: number }) {
    return apiClient.get<{ success: boolean; count: number; memories: LongTermMemoryItem[] }>(
      '/api/v1/voltagent/memory',
      { params },
    );
  },

  searchMemories(params: {
    query: string;
    category?: LongTermMemoryCategory;
    limit?: number;
    minImportance?: number;
  }) {
    return apiClient.get<
      | { success: true; count: number; memories: LongTermMemoryItem[] }
      | { success: false; error: string }
    >('/api/v1/voltagent/memory/search', { params });
  },

  addMemoryFact(payload: {
    fact: string;
    category?: LongTermMemoryCategory;
    importance?: number;
  }) {
    return apiClient.post<{ success: boolean; memoryId: string | null }>(
      '/api/v1/voltagent/memory',
      payload,
    );
  },

  deleteMemory(memoryId: string) {
    return apiClient.post<{ success: boolean }>(
      `/api/v1/voltagent/memory/${encodeURIComponent(memoryId)}/delete`,
    );
  },

  deleteAllMemories() {
    return apiClient.post<{ success: boolean; deletedCount: number }>(
      '/api/v1/voltagent/memory/delete-all',
    );
  },

  getMemoryStats() {
    return apiClient.get<{ success: boolean; enabled: boolean } & Record<string, unknown>>(
      '/api/v1/voltagent/memory/stats',
    );
  },

  // ============ Conversations (Chat Sessions) ============

  listConversations(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversations: ConversationSummary[];
      count: number;
    }>('/api/v1/voltagent/conversations', { params });
  },

  getConversation(conversationId: string, params?: { messageLimit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversation: ConversationDetail;
    }>(`/api/v1/voltagent/conversations/${encodeURIComponent(conversationId)}`, { params });
  },

  updateConversation(conversationId: string, payload: { title?: string; isArchived?: boolean }) {
    return apiClient.post<{ success: boolean; message: string }>(
      `/api/v1/voltagent/conversations/${encodeURIComponent(conversationId)}`,
      payload,
    );
  },

  deleteConversation(conversationId: string) {
    return apiClient.post<{ success: boolean; message: string }>(
      `/api/v1/voltagent/conversations/${encodeURIComponent(conversationId)}/delete`,
    );
  },

  generateConversationTitle(conversationId: string, locale?: string) {
    return apiClient.post<{ success: boolean; title: string }>(
      `/api/v1/voltagent/conversations/${encodeURIComponent(conversationId)}/generate-title`,
      undefined,
      { params: locale ? { locale } : undefined },
    );
  },

  // ============ Deadlines ============

  getUpcomingDeadlines(params?: { days?: number }) {
    return apiClient.get<{
      success: boolean;
      enabled: boolean;
      count: number;
      deadlines: CachedDeadline[];
    }>('/api/v1/voltagent/deadlines', { params });
  },

  extractDeadlines(payload: { text: string; locale?: 'en' | 'it' }) {
    return apiClient.post<{ success: boolean; count: number; deadlines: ExtractedDeadlinePreview[] }>(
      '/api/v1/voltagent/deadlines/extract',
      payload,
    );
  },

  completeDeadline(id: string) {
    return apiClient.post<{ success: boolean }>(
      `/api/v1/voltagent/deadlines/${encodeURIComponent(id)}/complete`,
    );
  },

  dismissDeadline(id: string) {
    return apiClient.post<{ success: boolean }>(
      `/api/v1/voltagent/deadlines/${encodeURIComponent(id)}/dismiss`,
    );
  },

  getDeadlineStats() {
    return apiClient.get<{ success: boolean; enabled: boolean } & Record<string, unknown>>(
      '/api/v1/voltagent/deadlines/stats',
    );
  },

  getDeadlineQueueStats() {
    return apiClient.get<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/voltagent/deadlines/queue',
    );
  },

  // ============ Follow-ups ============

  listFollowUps(params?: { status?: string; limit?: number; offset?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/api/v1/voltagent/follow-ups', { params });
  },

  getPendingFollowUps(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/api/v1/voltagent/follow-ups/pending', { params });
  },

  getOverdueFollowUps(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/api/v1/voltagent/follow-ups/overdue', { params });
  },

  getFollowUpStats() {
    return apiClient.get<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/voltagent/follow-ups/stats',
    );
  },

  createFollowUp(payload: { emailId: string; reason?: string; dueDate?: string }) {
    return apiClient.post<{ success: boolean; followUp: Record<string, unknown> }>(
      '/api/v1/voltagent/follow-ups',
      payload,
    );
  },

  analyzeForFollowUp(payload: { body: string; subject?: string }) {
    return apiClient.post<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/voltagent/follow-ups/analyze',
      payload,
    );
  },

  getFollowUp(id: string) {
    return apiClient.get<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/voltagent/follow-ups/${encodeURIComponent(id)}`,
    );
  },

  resolveFollowUp(id: string) {
    return apiClient.post<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/voltagent/follow-ups/${encodeURIComponent(id)}/resolve`,
    );
  },

  snoozeFollowUp(id: string, dueDate: string) {
    return apiClient.post<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/voltagent/follow-ups/${encodeURIComponent(id)}/snooze`,
      { dueDate },
    );
  },

  // ============ Action Items ============

  listActionItems(params?: { status?: string; sourceType?: string; limit?: number; offset?: number }) {
    return apiClient.get<{
      success: boolean;
      items: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/voltagent/action-items', { params });
  },

  getPendingActionItems() {
    return apiClient.get<{
      success: boolean;
      items: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/voltagent/action-items/pending');
  },

  getOverdueActionItems() {
    return apiClient.get<{
      success: boolean;
      items: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/voltagent/action-items/overdue');
  },

  getActionItemStats() {
    return apiClient.get<{ success: boolean; stats: Record<string, unknown> }>(
      '/api/v1/voltagent/action-items/stats',
    );
  },

  createActionItem(payload: {
    title: string;
    description?: string;
    sourceType?: string;
    sourceId?: string;
    priority?: number;
    dueDate?: string;
  }) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      '/api/v1/voltagent/action-items',
      payload,
    );
  },

  analyzeForActionItems(payload: { text: string }) {
    return apiClient.post<{
      success: boolean;
      needsExtraction: boolean;
      detected: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/voltagent/action-items/analyze', payload);
  },

  extractActionItems(payload: { emailId: string; subject: string; body: string; senderEmail?: string }) {
    return apiClient.post<{ success: boolean; createdIds: string[]; count: number }>(
      '/api/v1/voltagent/action-items/extract',
      payload,
    );
  },

  queueActionItemExtraction(payload: { emailId?: string; emailIds?: string[] }) {
    return apiClient.post<
      | { success: true; jobId: string }
      | { success: false; error: string }
    >('/api/v1/voltagent/action-items/queue', payload);
  },

  getActionItem(id: string) {
    return apiClient.get<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/voltagent/action-items/${encodeURIComponent(id)}`,
    );
  },

  updateActionItemStatus(id: string, status: string) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/voltagent/action-items/${encodeURIComponent(id)}/status`,
      { status },
    );
  },

  updateActionItemPriority(id: string, priority: number) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/voltagent/action-items/${encodeURIComponent(id)}/priority`,
      { priority },
    );
  },

  updateActionItemDueDate(id: string, dueDate: string | null) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/voltagent/action-items/${encodeURIComponent(id)}/due-date`,
      { dueDate },
    );
  },

  // ============ AI Secretary Analytics ============

  getDashboardAnalytics() {
    return apiClient.get<{ success: boolean; analytics: Record<string, unknown> }>(
      '/api/v1/voltagent/analytics/dashboard',
    );
  },

  getEmailAnalytics(params?: { period?: 'day' | 'week' | 'month' }) {
    return apiClient.get<{ success: boolean; analytics: Record<string, unknown> }>(
      '/api/v1/voltagent/analytics/email',
      { params },
    );
  },

  runAiAnalytics(payload: { query: string; data?: Record<string, unknown>; locale?: string }) {
    return apiClient.post<{ success: boolean; result: Record<string, unknown> }>(
      '/api/v1/voltagent/analytics/ai',
      payload,
    );
  },

  invalidateAnalyticsCache() {
    return apiClient.post<{ success: boolean; message: string }>(
      '/api/v1/voltagent/analytics/invalidate',
    );
  },

  getAnalyticsStatus() {
    return apiClient.get<{ success: boolean; enabled: boolean }>(
      '/api/v1/voltagent/analytics/status',
    );
  },
};

// ============ Unified Knowledge Types (P1.6) ============

export type UnifiedSearchSource = 'emails' | 'deadlines' | 'followups' | 'actions';

export type UnifiedSearchResult = {
  success: boolean;
  context: string;
  sources: string[];
  itemCount: number;
};

export type RememberResult = {
  success: boolean;
  memoryId?: string;
};

export type KnowledgeStats = {
  success: boolean;
  memoryCount: number;
  deadlineCount: number;
  followupCount: number;
  actionCount: number;
};

// ============ Unified Knowledge API (P1.6 - Memory-First RAG) ============

export const unifiedKnowledgeApi = {
  /**
   * Search across all knowledge sources with memory-first RAG.
   * Searches: emails, deadlines, follow-ups, action items, and user memories.
   */
  search(payload: {
    query: string;
    sources?: UnifiedSearchSource[];
    limit?: number;
  }) {
    return apiClient.post<UnifiedSearchResult>('/api/v1/voltagent/knowledge/search', payload);
  },

  /**
   * Store information in long-term memory for future retrieval.
   */
  remember(payload: {
    content: string;
    category?: 'preference' | 'fact' | 'contact' | 'project' | 'general';
  }) {
    return apiClient.post<RememberResult>('/api/v1/voltagent/knowledge/remember', payload);
  },

  /**
   * Get unified knowledge base statistics.
   */
  getStats() {
    return apiClient.get<KnowledgeStats>('/api/v1/voltagent/knowledge/stats');
  },
};

// Legacy API alias for backwards compatibility (maps to voltAgentApi)
export const multiAgentApi = {
  processMessage: async (payload: {
    message: string;
    sessionId?: string;
    conversationId?: string; // Alias for sessionId
    forceAgent?: string;
    autoApproveThreshold?: number;
    locale?: string;
  }): Promise<MultiAgentResponse> => {
    // Support both sessionId and conversationId (conversationId takes precedence)
    const convId = payload.conversationId || payload.sessionId;
    const response = await voltAgentApi.chat({
      message: payload.message,
      conversationId: convId,
      locale: payload.locale,
    });
    const result = response.data;
    // Map ChatResult to MultiAgentResponse format
    // Return the conversationId from response or the one we sent
    const responseConvId = (result as { conversationId?: string }).conversationId || convId;
    return {
      ...result,
      sessionId: responseConvId,
      conversationId: responseConvId,
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
