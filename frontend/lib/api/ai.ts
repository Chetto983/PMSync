import { apiClient } from '../api-client';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  steps?: Array<{ tool: string; output: string }>;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
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

export const aiApi = {
  listSessions() {
    return apiClient.get<{ success: boolean; sessions: ChatSession[] }>('/ai/chat/sessions');
  },
  getSession(sessionId: string) {
    return apiClient.get<{ success: boolean; session: ChatSession | null }>(
      `/ai/chat/sessions/${sessionId}`,
    );
  },
  createSession(locale?: string) {
    return apiClient.post<{ success: boolean; session: ChatSession }>(
      '/ai/chat/sessions',
      { locale },
    );
  },

  deleteSession(sessionId: string) {
    return apiClient.delete<{ success: boolean }>(`/ai/chat/sessions/${sessionId}`);
  },
  sendAgentMessage(payload: {
    sessionId?: string;
    message: string;
    history: ChatMessage[];
    locale?: string;
  }) {
    return apiClient.post<{
      success: boolean;
      sessionId: string;
      session: ChatSession;
      messages: ChatMessage[];
      response: string;
      steps?: Array<{ tool: string; output: string }>;
    }>('/ai/agent', payload);
  },
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
};
