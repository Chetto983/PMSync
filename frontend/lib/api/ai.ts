import { apiClient, API_BASE_URL, getCsrfToken } from '../api-client';

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
  conversationId?: string;
};

export type AiOperationMeta = {
  operation: string;
  version: string;
  source: 'live' | 'cache' | 'fallback';
  status: 'ok' | 'degraded';
  generatedAt: string;
  locale?: string;
  model?: string;
  warnings?: string[];
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
  parts: MessagePart[];
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

export type StreamEvent =
  | { type: 'metadata'; conversationId: string }
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId?: string }
  | { type: 'error'; message: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'finish' };

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

type ChatRequestPayload = {
  message: string;
  conversationId?: string;
  locale?: string;
  model?: 'small' | 'medium' | 'large';
};

type StreamConsumerCallbacks = {
  onChunk?: (chunk: string) => void;
  onDone?: () => void;
  onConversationId?: (conversationId: string) => void;
  /** Called when the stream is retrying after a failure. */
  onReconnecting?: (attempt: number, maxRetries: number) => void;
};

const AI_CHAT_ENDPOINT = `${API_BASE_URL}/api/v1/ai/chat`;

/** Total timeout for an SSE stream (ms). No data at all after this = abort. */
export const SSE_TIMEOUT_MS = 120_000;
/** Keepalive interval (ms). If no data chunk arrives within this window, abort. */
export const SSE_KEEPALIVE_MS = 30_000;
/** Max automatic retries on stream failure before giving up. */
export const SSE_MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms): 1s, 2s, 4s. */
export const SSE_RETRY_BASE_MS = 1_000;

function extractSsePayload(frame: string): string | null {
  const lines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (lines.length === 0) {
    return null;
  }

  return lines.join('\n');
}

async function createChatStreamResponse(
  payload: ChatRequestPayload,
  signal?: AbortSignal,
): Promise<Response> {
  const csrfToken = await getCsrfToken();

  return fetch(AI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
    signal,
  });
}

async function consumeChatStream(
  payload: ChatRequestPayload,
  callbacks: StreamConsumerCallbacks = {},
  signal?: AbortSignal,
): Promise<ChatResult> {
  // --- Timeout / keepalive abort controller ---
  const internal = new AbortController();
  let keepaliveTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (keepaliveTimer) clearTimeout(keepaliveTimer);
    if (totalTimer) clearTimeout(totalTimer);
  };

  // If the caller already aborted, propagate immediately
  if (signal?.aborted) {
    internal.abort(signal.reason);
  } else {
    signal?.addEventListener('abort', () => internal.abort(signal.reason), { once: true });
  }

  // Total stream timeout
  totalTimer = setTimeout(() => {
    internal.abort(new DOMException('SSE stream timeout', 'TimeoutError'));
  }, SSE_TIMEOUT_MS);

  // Keepalive — reset on every data chunk
  const resetKeepalive = () => {
    if (keepaliveTimer) clearTimeout(keepaliveTimer);
    keepaliveTimer = setTimeout(() => {
      internal.abort(new DOMException('SSE keepalive timeout — no data received', 'TimeoutError'));
    }, SSE_KEEPALIVE_MS);
  };
  resetKeepalive();

  try {
    const response = await createChatStreamResponse(payload, internal.signal);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    const state: ChatResult = {
      text: '',
      conversationId: payload.conversationId,
    };

    let buffer = '';
    let didNotifyDone = false;

    const notifyDone = () => {
      if (didNotifyDone) {
        return;
      }
      didNotifyDone = true;
      callbacks.onDone?.();
    };

    const handleFrame = (frame: string) => {
      const rawPayload = extractSsePayload(frame);
      if (!rawPayload) {
        return;
      }

      if (rawPayload === '[DONE]') {
        notifyDone();
        return;
      }

      let event: StreamEvent;
      try {
        event = JSON.parse(rawPayload) as StreamEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'metadata':
          state.conversationId = event.conversationId;
          callbacks.onConversationId?.(event.conversationId);
          break;
        case 'chunk':
          state.text += event.content;
          callbacks.onChunk?.(event.content);
          break;
        case 'text-delta':
          state.text += event.delta;
          callbacks.onChunk?.(event.delta);
          break;
        case 'done':
          if (event.conversationId) {
            state.conversationId = event.conversationId;
            callbacks.onConversationId?.(event.conversationId);
          }
          notifyDone();
          break;
        case 'finish':
          notifyDone();
          break;
        case 'error':
          throw new Error(event.message);
        default:
          break;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      // Data received — reset keepalive timer
      resetKeepalive();

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';

      for (const frame of frames) {
        handleFrame(frame);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      handleFrame(buffer);
    }

    notifyDone();
    return state;
  } finally {
    cleanup();
  }
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
  meta?: AiOperationMeta;
};

export type PriorityResult = {
  score: number;
  urgency: 'high' | 'medium' | 'low';
  recommendation: 'handle_now' | 'handle_today' | 'handle_this_week' | 'can_wait' | 'archive';
  factors: string[];
  meta?: AiOperationMeta;
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
  meta?: AiOperationMeta;
};

export interface DraftStats {
  totalDrafts: number;
  acceptRate: number;
  editRate: number;
  rejectRate: number;
  avgEditDistance: number;
}

type FollowUpMutationResult = {
  success: boolean;
  error?: string;
};

type ReplyDraftPayload = {
  success: boolean;
  draftId: string;
  body: string;
  subject: string;
  meta?: AiOperationMeta;
  error?: string;
};

// ============ Email Intelligence API ============

export const aiApi = {
  summarizeEmail(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean; summary: string; meta?: AiOperationMeta }>(
      `/ai/summarize/${emailId}`,
      locale ? { locale } : undefined,
    );
  },

  generateSmartReplies(emailId: string, locale?: string, tone?: string) {
    const body: { locale?: string; tone?: string } = {};
    if (locale) body.locale = locale;
    if (tone) body.tone = tone;
    return apiClient.post<{ success: boolean; suggestions: string[]; meta?: AiOperationMeta }>(
      `/ai/smart-reply/${emailId}`,
      Object.keys(body).length > 0 ? body : undefined,
    );
  },

  categorizeEmail(emailId: string, locale?: string) {
    return apiClient.post<{ success: boolean; labels: string[]; meta?: AiOperationMeta }>(
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
    return apiClient.post<{ success: boolean; body: string; subject?: string; meta?: AiOperationMeta }>(
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

// ============ AI Chat API ============

export const aiChatApi = {
  async chat(payload: ChatRequestPayload): Promise<{ data: ChatResult }> {
    const data = await consumeChatStream(payload);
    return { data };
  },

  streamChat(
    payload: ChatRequestPayload,
    onChunk: (chunk: string) => void,
    onDone?: () => void,
    onError?: (error: string) => void,
    onConversationId?: (conversationId: string) => void,
    onReconnecting?: (attempt: number, maxRetries: number) => void,
  ): AbortController {
    const controller = new AbortController();

    const attemptStream = async (attempt: number): Promise<void> => {
      try {
        await consumeChatStream(
          payload,
          {
            onChunk,
            onDone,
            onConversationId,
            onReconnecting,
          },
          controller.signal,
        );
      } catch (error: unknown) {
        const err = error as Error;
        // User-initiated abort — never retry
        if (err.name === 'AbortError' && !err.message?.includes('timeout')) {
          return;
        }
        // Retryable failure (timeout, network error)
        if (attempt < SSE_MAX_RETRIES && !controller.signal.aborted) {
          const delay = SSE_RETRY_BASE_MS * Math.pow(2, attempt - 1);
          onReconnecting?.(attempt, SSE_MAX_RETRIES);
          await new Promise((r) => setTimeout(r, delay));
          if (!controller.signal.aborted) {
            return attemptStream(attempt + 1);
          }
        }
        // Final failure
        if (err.name !== 'AbortError') {
          onError?.(err.message || 'Stream failed');
        }
      }
    };

    attemptStream(1);
    return controller;
  },

  // Stats
  getWritingStyle(providerId?: string) {
    return apiClient.get<{ success: boolean; profile: WritingStyleProfile }>(
      '/ai/stats/writing-style',
      providerId ? { params: { providerId } } : undefined,
    );
  },

  // Daily Briefing
  getBriefing() {
    return apiClient.get<{ success: boolean; briefing: Record<string, unknown>; meta?: AiOperationMeta; error?: string }>(
      '/ai/briefing',
    );
  },

  refreshBriefing() {
    return apiClient.post<{ success: boolean; briefing: Record<string, unknown>; meta?: AiOperationMeta; error?: string }>(
      '/ai/briefing/refresh',
    );
  },

  // Conversations
  listConversations(params?: { limit?: number }) {
    return apiClient.get<{
      success: boolean;
      conversations: ConversationSummary[];
      total: number;
    }>('/ai/chat/conversations', { params });
  },

  deleteConversation(conversationId: string) {
    return apiClient.delete<{ success: boolean }>(
      `/ai/chat/conversations/${encodeURIComponent(conversationId)}`,
    );
  },

  bulkDeleteConversations(ids: string[]) {
    return apiClient.post<{ success: boolean; deletedCount: number }>(
      '/ai/chat/conversations/bulk-delete',
      { ids },
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
  getPendingFollowUps(params?: { limit?: number; includeResolved?: boolean }) {
    return apiClient.get<{
      success: boolean;
      count: number;
      followUps: Array<Record<string, unknown>>;
    }>('/ai/follow-ups/pending', { params });
  },

  getFollowUpStats() {
    return apiClient.get<{
      success: boolean;
      stats: { pending: number; reminded: number; resolved: number; expired: number; overdue: number; dueToday: number };
    }>('/ai/follow-ups/stats');
  },

  updateFollowUpStatus(id: string, status: string) {
    return apiClient.patch<FollowUpMutationResult & { updated?: number }>(
      `/ai/follow-ups/${id}/status`,
      { status },
    );
  },

  snoozeFollowUp(id: string, dueDate: string) {
    return apiClient.patch<FollowUpMutationResult & { dueDate?: string }>(
      `/ai/follow-ups/${id}/snooze`,
      { dueDate },
    );
  },

  deleteFollowUp(id: string) {
    return apiClient.delete<FollowUpMutationResult>(
      `/ai/follow-ups/${id}`,
    );
  },

  /**
   * Get active follow-up for a specific email
   */
  getFollowUpByEmail(emailId: string) {
    return apiClient.get<{ success: boolean; followUp: unknown | null }>(
      `/ai/follow-ups/by-email/${emailId}`,
    );
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
    const payload = {
      emailId: params.emailId,
      ...(params.tone ? { tone: params.tone } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      instruction: params.instructions?.trim() || 'Draft an appropriate professional reply to this email.',
    };

    return apiClient
      .post<{
        success: boolean;
        draft: { draftId: string; body: string; subject: string };
        meta?: AiOperationMeta;
        error?: string;
      }>('/ai/drafts/generate', payload)
      .then((response) => ({
        ...response,
        data: {
          success: response.data.success,
          draftId: response.data.draft.draftId,
          body: response.data.draft.body,
          subject: response.data.draft.subject,
          ...(response.data.meta ? { meta: response.data.meta } : {}),
          ...(response.data.error ? { error: response.data.error } : {}),
        } satisfies ReplyDraftPayload,
      }));
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

