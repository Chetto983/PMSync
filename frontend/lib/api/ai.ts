import { apiClient, API_BASE_URL } from '../api-client';
import { getAuthToken } from '../utils/auth-token';

// ============ Personalization Types (migrated from deleted personalization.ts) ============

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
  memoryType: MemoryType; // Backend uses memoryType (Prisma model field)
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

export type LearnInteractionPayload = {
  action: string;
  context: string;
  outcome: 'positive' | 'negative' | 'neutral';
};

export type WorkingHoursResponse = {
  success: boolean;
  withinWorkingHours: boolean;
  reason?: string;
  workingHours?: {
    start?: string;
    end?: string;
    days?: string[];
  };
};

// ============ Personalization API (Restored 2025-01-07) ============

const DEFAULT_PROFILE: UserProfile = {
  jobRole: 'IC',
  communicationStyle: 'CASUAL',
  responseLength: 'MODERATE',
  proactivityLevel: 'MEDIUM',
  timezone: 'UTC',
  language: 'en',
};

export const personalizationApi = {
  // Get user profile - returns defaults (profile service not yet implemented)
  getProfile() {
    return Promise.resolve({ data: { success: true, profile: DEFAULT_PROFILE } });
  },

  // Update user profile - not yet implemented
  updateProfile(_profile: Partial<UserProfile>) {
    return Promise.resolve({ data: { success: true, profile: DEFAULT_PROFILE } });
  },

  // Get personalization context - not yet implemented
  getContext(_body?: { query?: string }) {
    return Promise.resolve({ data: { success: true, context: {} } });
  },

  // Get memories by type - RESTORED
  getMemories(params: { type?: MemoryType; limit?: number }) {
    return apiClient.get<{ success: boolean; memories: Memory[]; total: number }>(
      '/api/v1/ai/memory',
      { params: { type: params.type, limit: params.limit } }
    );
  },

  // Search memories - RESTORED
  searchMemories(payload: { query: string; limit?: number }) {
    return apiClient.get<{ success: boolean; memories: Memory[]; total: number }>(
      '/api/v1/ai/memory/search',
      { params: payload }
    );
  },

  // Store a memory - RESTORED
  storeMemory(memory: StoreMemoryPayload) {
    return apiClient.post<{ success: boolean; memory: Memory }>(
      '/api/v1/ai/memory',
      memory
    );
  },

  // Delete a memory - RESTORED
  deleteMemory(memoryId: string) {
    return apiClient.delete<{ success: boolean; message: string }>(
      `/api/v1/ai/memory/${memoryId}`
    );
  },

  // Clear all memories - RESTORED
  clearAllMemories() {
    return apiClient.delete<{ success: boolean; message: string; count: number }>(
      '/api/v1/ai/memory'
    );
  },

  // Learn from user interaction - not yet implemented
  learnFromInteraction(_payload: LearnInteractionPayload) {
    return Promise.resolve({ data: { success: true } });
  },

  // Check working hours - returns default (not yet implemented)
  getWorkingHours() {
    return Promise.resolve({
      data: {
        success: true,
        withinWorkingHours: true,
        workingHours: { start: '09:00', end: '18:00', days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] },
      } as WorkingHoursResponse,
    });
  },

  // Get memory history - RESTORED
  getMemoryHistory(memoryId: string) {
    return apiClient.get<{
      success: boolean;
      history: Array<{
        action: string;
        previousValue?: string;
        newValue?: string;
        createdAt: string;
      }>;
    }>(`/api/v1/ai/memory/${memoryId}/history`);
  },

  // Get procedural patterns - RESTORED
  getPatterns() {
    return apiClient.get<{
      success: boolean;
      patterns: Array<{
        id: string;
        taskType: string;
        trigger: string;
        steps: unknown;
        successRate: number;
        lastUsedAt: string;
      }>;
    }>('/api/v1/ai/memory/patterns');
  },
};

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
  /** ConversationId for linking to inline chat actions */
  sessionId?: string;
  /** AI reasoning for proposing this action */
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

/**
 * Execution result from HITL action approval/rejection.
 * Contains success/error status and summary for user feedback.
 */
export type ActionExecutionResult = {
  success: boolean;
  error?: string;
  summary?: string | string[];
  data?: Record<string, unknown>;
  executionTimeMs: number;
};

/**
 * Full response from action approval/rejection endpoints.
 * Includes execution result for user feedback.
 */
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

/** AI SDK v6 message part - supports text and tool parts */
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
  /** @deprecated Remove by 2026-06-01: Use parts instead - kept for backwards compatibility */
  content: string;
  /** AI SDK v6 parts array - includes text and tool parts */
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
  | { type: 'metadata'; conversationId: string }
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId?: string }
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
    senderName?: string;
    signature?: string;
  }) {
    return apiClient.post<{ success: boolean; body: string; subject?: string }>(
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
    return apiClient.post<ChatResult>('/api/v1/ai/chat', payload);
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
    /** Callback when conversationId is received (for new conversations) */
    onConversationId?: (conversationId: string) => void,
  ): AbortController {
    const controller = new AbortController();

    fetch(`${API_BASE_URL}/api/v1/ai/chat/stream`, {
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
              if (event.type === 'metadata') {
                // Capture conversationId early (before streaming starts)
                onConversationId?.(event.conversationId);
              } else if (event.type === 'chunk') {
                onChunk(event.content);
              } else if (event.type === 'done') {
                // Also capture conversationId in done event (fallback)
                if (event.conversationId) {
                  onConversationId?.(event.conversationId);
                }
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
      '/api/v1/ai/actions/pending',
    );
  },

  getPendingAction(executionId: string) {
    return apiClient.get<PendingAction>(`/api/v1/ai/actions/${executionId}`);
  },

  approveAction(executionId: string, payload?: Record<string, unknown>) {
    return apiClient.post<ApprovalResponse>(`/api/v1/ai/actions/${executionId}/approve`, {
      payload,
    });
  },

  rejectAction(executionId: string, rejectionReason?: string) {
    return apiClient.post<ApprovalResponse>(`/api/v1/ai/actions/${executionId}/reject`, {
      approved: false,
      rejectionReason,
    });
  },

  // ============ Stats & Learning ============

  getActionCounts() {
    return apiClient.get<{ success: boolean; counts: ActionCounts }>(
      '/api/v1/ai/stats/action-counts',
    );
  },

  // NOTE: getLearningStats removed - endpoint doesn't exist (learning is in-memory only)

  getWritingStyle() {
    return apiClient.get<{ success: boolean; profile: WritingStyleProfile }>(
      '/api/v1/ai/stats/writing-style',
    );
  },

  // NOTE: getAggregateStats REMOVED - endpoint doesn't exist on backend
  // Use getActionCounts() instead to compute aggregate stats

  resetLearning(payload?: { agentName?: string; actionType?: string }) {
    return apiClient.post<{ success: boolean; message: string }>(
      '/api/v1/ai/learning/reset',
      payload || {},
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
      '/api/v1/ai/actions/submit',
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
    }>('/api/v1/ai/stats/performance');
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
    }>('/api/v1/ai/stats/metrics', { params });
  },

  getOptimizationStats() {
    return apiClient.get<{
      success: boolean;
      optimizations: Record<string, unknown>;
    }>('/api/v1/ai/stats/optimizations');
  },

  // ============ Semantic Cache ============

  invalidateSemanticCache(pattern?: string) {
    return apiClient.post<{
      success: boolean;
      message: string;
      entriesRemoved: number;
    }>('/api/v1/ai/cache/invalidate', pattern ? { pattern } : {});
  },

  getCacheAnalytics() {
    return apiClient.get<{
      success: boolean;
      analytics: Record<string, unknown>;
      config: Record<string, unknown>;
      recommendations: unknown;
    }>('/api/v1/ai/cache/analytics');
  },

  resetCacheAnalytics() {
    return apiClient.post<{ success: boolean; message: string }>(
      '/api/v1/ai/cache/analytics/reset',
    );
  },

  setAdaptiveThreshold(threshold: number) {
    return apiClient.post<
      | { success: true; message: string; newThreshold: number }
      | { success: false; error: string }
    >('/api/v1/ai/cache/threshold', { threshold });
  },

  // ============ Daily Briefing ============

  getBriefing() {
    return apiClient.get<{ success: boolean; briefing: Record<string, unknown> }>(
      '/api/v1/ai/briefing',
    );
  },

  refreshBriefing() {
    return apiClient.post<{ success: boolean; jobId: string; message: string }>(
      '/api/v1/ai/briefing/refresh',
    );
  },

  getBriefingStatus() {
    return apiClient.get<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/ai/briefing/status',
    );
  },

  // ============ Long-Term Memory ============

  listMemories(params?: { category?: LongTermMemoryCategory; limit?: number }) {
    return apiClient.get<{ success: boolean; count: number; memories: LongTermMemoryItem[] }>(
      '/api/v1/ai/memory',
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
    >('/api/v1/ai/memory/search', { params });
  },

  addMemoryFact(payload: {
    fact: string;
    category?: LongTermMemoryCategory;
    importance?: number;
  }) {
    return apiClient.post<{ success: boolean; memoryId: string | null }>(
      '/api/v1/ai/memory',
      payload,
    );
  },

  deleteMemory(memoryId: string) {
    return apiClient.delete<{ success: boolean }>(
      `/api/v1/ai/memory/${encodeURIComponent(memoryId)}`,
    );
  },

  deleteAllMemories() {
    return apiClient.delete<{ success: boolean; deletedCount: number }>(
      '/api/v1/ai/memory',
    );
  },

  getMemoryStats() {
    return apiClient.get<{ success: boolean; enabled: boolean } & Record<string, unknown>>(
      '/api/v1/ai/memory/stats',
    );
  },

  // ============ Conversations (Chat Sessions) ============

  listConversations(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversations: ConversationSummary[];
      count: number;
    }>('/api/v1/ai/conversations', { params });
  },

  getConversation(conversationId: string, params?: { messageLimit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversation: ConversationDetail;
    }>(`/api/v1/ai/conversations/${encodeURIComponent(conversationId)}`, { params });
  },

  updateConversation(conversationId: string, payload: { title?: string; isArchived?: boolean }) {
    return apiClient.post<{ success: boolean; message: string }>(
      `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
      payload,
    );
  },

  deleteConversation(conversationId: string) {
    return apiClient.post<{ success: boolean; message: string }>(
      `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}/delete`,
    );
  },

  generateConversationTitle(conversationId: string, locale?: string) {
    return apiClient.post<{ success: boolean; title: string }>(
      `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}/generate-title`,
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
    }>('/api/v1/ai/deadlines', { params });
  },

  extractDeadlines(payload: { text: string; locale?: 'en' | 'it' }) {
    return apiClient.post<{ success: boolean; count: number; deadlines: ExtractedDeadlinePreview[] }>(
      '/api/v1/ai/deadlines/extract',
      payload,
    );
  },

  completeDeadline(id: string) {
    return apiClient.post<{ success: boolean }>(
      `/api/v1/ai/deadlines/${encodeURIComponent(id)}/complete`,
    );
  },

  dismissDeadline(id: string) {
    return apiClient.post<{ success: boolean }>(
      `/api/v1/ai/deadlines/${encodeURIComponent(id)}/dismiss`,
    );
  },

  getDeadlineStats() {
    return apiClient.get<{ success: boolean; enabled: boolean } & Record<string, unknown>>(
      '/api/v1/ai/deadlines/stats',
    );
  },

  getDeadlineQueueStats() {
    return apiClient.get<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/ai/deadlines/queue',
    );
  },

  // ============ Follow-ups ============

  listFollowUps(params?: { status?: string; type?: 'WAITING_FOR' | 'TODO'; limit?: number; offset?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/api/v1/ai/follow-ups', { params });
  },

  getPendingFollowUps(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/api/v1/ai/follow-ups/pending', { params });
  },

  getOverdueFollowUps(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/api/v1/ai/follow-ups/overdue', { params });
  },

  getFollowUpStats() {
    return apiClient.get<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/ai/follow-ups/stats',
    );
  },

  createFollowUp(payload: { emailId: string; reason?: string; dueDate?: string }) {
    return apiClient.post<{ success: boolean; followUp: Record<string, unknown> }>(
      '/api/v1/ai/follow-ups',
      payload,
    );
  },

  analyzeForFollowUp(payload: { body: string; subject?: string }) {
    return apiClient.post<{ success: boolean } & Record<string, unknown>>(
      '/api/v1/ai/follow-ups/analyze',
      payload,
    );
  },

  getFollowUp(id: string) {
    return apiClient.get<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/ai/follow-ups/${encodeURIComponent(id)}`,
    );
  },

  getSmartTiming(id: string) {
    return apiClient.get<{
      success: boolean;
      recommendation: {
        suggestedDate: string;
        reason: string;
        confidence: number;
      };
    }>(`/api/v1/ai/follow-ups/${encodeURIComponent(id)}/smart-timing`);
  },

  resolveFollowUp(id: string) {
    return apiClient.post<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/ai/follow-ups/${encodeURIComponent(id)}/resolve`,
    );
  },

  snoozeFollowUp(id: string, dueDate: string) {
    return apiClient.post<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/ai/follow-ups/${encodeURIComponent(id)}/snooze`,
      { dueDate },
    );
  },

  updateFollowUpStatus(id: string, status: string) {
    return apiClient.patch<{ success: boolean; followUp: Record<string, unknown> }>(
      `/api/v1/ai/follow-ups/${encodeURIComponent(id)}/status`,
      { status },
    );
  },

  deleteFollowUp(id: string) {
    return apiClient.delete<{ success: boolean; message: string }>(
      `/api/v1/ai/follow-ups/${encodeURIComponent(id)}`,
    );
  },

  // ============ Action Items ============

  listActionItems(params?: { status?: string; sourceType?: string; limit?: number; offset?: number }) {
    return apiClient.get<{
      success: boolean;
      items: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/ai/action-items', { params });
  },

  getPendingActionItems() {
    return apiClient.get<{
      success: boolean;
      items: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/ai/action-items/pending');
  },

  getOverdueActionItems() {
    return apiClient.get<{
      success: boolean;
      items: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/ai/action-items/overdue');
  },

  getActionItemStats() {
    return apiClient.get<{ success: boolean; stats: Record<string, unknown> }>(
      '/api/v1/ai/action-items/stats',
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
      '/api/v1/ai/action-items',
      payload,
    );
  },

  analyzeForActionItems(payload: { text: string }) {
    return apiClient.post<{
      success: boolean;
      needsExtraction: boolean;
      detected: Array<Record<string, unknown>>;
      count: number;
    }>('/api/v1/ai/action-items/analyze', payload);
  },

  extractActionItems(payload: { emailId: string; subject: string; body: string; senderEmail?: string }) {
    return apiClient.post<{ success: boolean; createdIds: string[]; count: number }>(
      '/api/v1/ai/action-items/extract',
      payload,
    );
  },

  queueActionItemExtraction(payload: { emailId?: string; emailIds?: string[] }) {
    return apiClient.post<
      | { success: true; jobId: string }
      | { success: false; error: string }
    >('/api/v1/ai/action-items/queue', payload);
  },

  getActionItem(id: string) {
    return apiClient.get<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/ai/action-items/${encodeURIComponent(id)}`,
    );
  },

  updateActionItemStatus(id: string, status: string) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/ai/action-items/${encodeURIComponent(id)}/status`,
      { status },
    );
  },

  updateActionItemPriority(id: string, priority: number) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/ai/action-items/${encodeURIComponent(id)}/priority`,
      { priority },
    );
  },

  updateActionItemDueDate(id: string, dueDate: string | null) {
    return apiClient.post<{ success: boolean; item: Record<string, unknown> }>(
      `/api/v1/ai/action-items/${encodeURIComponent(id)}/due-date`,
      { dueDate },
    );
  },

  // ============ AI Secretary Analytics ============

  getDashboardAnalytics() {
    return apiClient.get<{ success: boolean; analytics: Record<string, unknown> }>(
      '/api/v1/ai/analytics/dashboard',
    );
  },

  getEmailAnalytics(params?: { period?: 'day' | 'week' | 'month' }) {
    return apiClient.get<{ success: boolean; analytics: Record<string, unknown> }>(
      '/api/v1/ai/analytics/email',
      { params },
    );
  },

  runAiAnalytics(payload: { query: string; data?: Record<string, unknown>; locale?: string }) {
    return apiClient.post<{ success: boolean; result: Record<string, unknown> }>(
      '/api/v1/ai/analytics/ai',
      payload,
    );
  },

  invalidateAnalyticsCache() {
    return apiClient.post<{ success: boolean; message: string }>(
      '/api/v1/ai/analytics/invalidate',
    );
  },

  getAnalyticsStatus() {
    return apiClient.get<{ success: boolean; enabled: boolean }>(
      '/api/v1/ai/analytics/status',
    );
  },

  // ============ AI Draft Generation ============

  generateReplyDraft(params: {
    emailId: string;
    tone?: string;
    instructions?: string;
    locale?: string;
  }) {
    return apiClient.post<{ draftId: string; body: string; subject: string }>(
      '/api/v1/ai/generate-reply-draft',
      params,
    );
  },

  recordDraftFeedback(params: {
    draftId: string;
    action: 'accepted' | 'edited' | 'rejected' | 'regenerated';
    sentBody?: string;
  }) {
    return apiClient.post('/api/v1/ai/draft-feedback', params);
  },

  getDraftStats() {
    return apiClient.get<{ success: boolean; stats: DraftStats }>('/api/v1/ai/draft-stats');
  },

  updateManualSamples(params: { samples: string; providerId?: string }) {
    return apiClient.post<{ success: boolean }>(
      '/api/v1/ai/writing-style/manual-samples',
      params,
    );
  },
};

// ============ AI Draft Types ============

export interface DraftStats {
  totalDrafts: number;
  acceptRate: number;
  editRate: number;
  rejectRate: number;
  avgEditDistance: number;
}

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
    return apiClient.post<UnifiedSearchResult>('/api/v1/ai/knowledge/search', payload);
  },

  /**
   * Store information in long-term memory for future retrieval.
   */
  remember(payload: {
    content: string;
    category?: 'preference' | 'fact' | 'contact' | 'project' | 'general';
  }) {
    return apiClient.post<RememberResult>('/api/v1/ai/knowledge/remember', payload);
  },

  /**
   * Get unified knowledge base statistics.
   */
  getStats() {
    return apiClient.get<KnowledgeStats>('/api/v1/ai/knowledge/stats');
  },
};

// ============ Focus Time API ============

export type FocusTimeSlot = {
  start: string;
  end: string;
  duration: number;
  score: number;
  conflictCount: number;
};

export type FocusTimeStats = {
  totalFocusMinutes: number;
  averageDailyFocus: number;
  busyDays: number;
  optimalDays: number;
  meetingLoad: Record<string, number>;
};

export const focusTimeApi = {
  getOptimalSlots(params?: { duration?: number; preferredTime?: string; numSlots?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      slots: FocusTimeSlot[];
    }>('/api/v1/ai/scheduling/focus-time/optimal', { params });
  },

  getStats(params?: { days?: number }) {
    return apiClient.get<{
      success: boolean;
      stats: FocusTimeStats;
    }>('/api/v1/ai/scheduling/focus-time/stats', { params });
  },

  createBlocks(payload: {
    duration?: number;
    frequency?: 'daily' | 'weekly' | 'twice_weekly';
    preferredTime?: 'morning' | 'afternoon' | 'flexible';
    protectFromMeetings?: boolean;
  }) {
    return apiClient.post<{
      success: boolean;
      count: number;
      blocks: FocusTimeSlot[];
    }>('/api/v1/ai/scheduling/focus-time/create', payload);
  },

  getStatus() {
    return apiClient.get<{
      success: boolean;
      isInFocusBlock: boolean;
      currentBlock?: { start: string; end: string; remaining: number };
    }>('/api/v1/ai/scheduling/focus-time/status');
  },
};

// ============ Calendar Conflict API ============

export type CalendarConflict = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  overlapMinutes: number;
};

export type AvailableSlot = {
  start: string;
  end: string;
  duration: number;
  score: number;
};

export const calendarConflictApi = {
  detectConflicts(payload: {
    title: string;
    startTime: string;
    endTime: string;
    duration?: number;
    isFlexible?: boolean;
    includeSuggestions?: boolean;
    numSuggestions?: number;
  }) {
    return apiClient.post<{
      success: boolean;
      hasConflicts: boolean;
      conflicts: CalendarConflict[];
      suggestions?: AvailableSlot[];
    }>('/api/v1/ai/scheduling/conflicts/detect', payload);
  },

  findAvailableSlots(params?: { duration?: number; days?: number; numSlots?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      slots: AvailableSlot[];
    }>('/api/v1/ai/scheduling/conflicts/available-slots', { params });
  },

  getSchedulingPreferences() {
    return apiClient.get<{
      success: boolean;
      preferences: {
        preferredMeetingTimes: string[];
        avoidTimes: string[];
        maxMeetingsPerDay: number;
      };
    }>('/api/v1/ai/scheduling/preferences');
  },

  getDayLoad(params?: { date?: string }) {
    return apiClient.get<{
      success: boolean;
      date: string;
      totalMeetingMinutes: number;
      eventCount: number;
      busyPercentage: number;
    }>('/api/v1/ai/scheduling/day-load', { params });
  },
};

// ============ Meeting Prep API ============

export type MeetingBrief = {
  eventId: string;
  title: string;
  startTime: string;
  attendees: string[];
  summary: string;
  relevantEmails?: Array<{ id: string; subject: string; snippet: string }>;
  actionItems?: Array<{ id: string; title: string }>;
  previousMeetings?: Array<{ id: string; title: string; date: string }>;
};

export const meetingPrepApi = {
  getMeetingBrief(eventId: string, params?: {
    includeEmails?: boolean;
    includePreviousMeetings?: boolean;
    includeActionItems?: boolean;
  }) {
    return apiClient.get<{
      success: boolean;
      brief: MeetingBrief;
    }>(`/api/v1/ai/scheduling/meeting-prep/${eventId}`, { params });
  },

  getUpcomingMeetingsNeedingPrep(params?: { hoursAhead?: number }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      meetings: Array<{
        eventId: string;
        title: string;
        startTime: string;
        attendeeCount: number;
        prepScore: number;
      }>;
    }>('/api/v1/ai/scheduling/meeting-prep', { params });
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
  // getAggregateStats removed - use getActionCounts instead
  resetLearning: voltAgentApi.resetLearning,
  getWritingStyle: voltAgentApi.getWritingStyle,
};
