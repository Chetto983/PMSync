/**
 * AI API Client Tests
 *
 * Tests for both aiApi (email insights) and aiChatApi (AI chat)
 */

import { aiApi, aiChatApi, multiAgentApi } from './ai';
import { apiClient, getCsrfToken } from '../api-client';

// Mock the apiClient
jest.mock('../api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
  getCsrfToken: jest.fn().mockResolvedValue('csrf-token'),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

const { TextDecoder } = require('util');
Object.defineProperty(global, 'TextDecoder', {
  value: TextDecoder,
  writable: true,
});

// Mock fetch for SSE streaming
const mockFetch = jest.fn();
global.fetch = mockFetch;
const mockGetCsrfToken = getCsrfToken as jest.MockedFunction<typeof getCsrfToken>;

function streamFrame(payload: object | string): string {
  return `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
}

function createStreamResponse(frames: string[]) {
  let index = 0;

  return {
    ok: true,
    body: {
      getReader: () => ({
        read: jest.fn().mockImplementation(() => {
          if (index >= frames.length) {
            return Promise.resolve({ done: true, value: undefined });
          }

          const value = Buffer.from(frames[index], 'utf-8');
          index += 1;
          return Promise.resolve({ done: false, value });
        }),
      }),
    },
  };
}

describe('aiApi (Email Insights)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('summarizeEmail', () => {
    it('should call correct endpoint with emailId', async () => {
      const mockResponse = { data: { success: true, summary: 'Email summary' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiApi.summarizeEmail('email-123');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/summarize/email-123', undefined);
    });

    it('should pass locale when provided', async () => {
      const mockResponse = { data: { success: true, summary: 'Riassunto email' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiApi.summarizeEmail('email-123', 'it');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/summarize/email-123', { locale: 'it' });
    });
  });

  describe('generateSmartReplies', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { success: true, suggestions: ['Reply 1', 'Reply 2'] } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiApi.generateSmartReplies('email-123');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/smart-reply/email-123', undefined);
    });

    it('should pass locale and tone', async () => {
      const mockResponse = { data: { success: true, suggestions: ['Formal reply'] } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiApi.generateSmartReplies('email-123', 'en', 'formal');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/smart-reply/email-123', {
        locale: 'en',
        tone: 'formal',
      });
    });
  });

  describe('categorizeEmail', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { success: true, labels: ['work', 'urgent'] } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiApi.categorizeEmail('email-123');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/categorize/email-123', undefined);
    });

    it('should pass locale when provided', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { success: true, labels: [] } });

      await aiApi.categorizeEmail('email-123', 'it');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/categorize/email-123', { locale: 'it' });
    });
  });

  describe('searchMemory', () => {
    it('should call correct endpoint with payload', async () => {
      const mockResponse = {
        data: {
          success: true,
          usedQuery: 'test query',
          items: [{ id: '1', snippet: 'Found content', subject: 'Test' }],
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const payload = { query: 'test query', limit: 10 };
      await aiApi.searchMemory(payload);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/memory/search', payload);
    });

    it('should support emailId-based search', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { success: true, items: [] } });

      await aiApi.searchMemory({ emailId: 'email-123' });

      expect(apiClient.post).toHaveBeenCalledWith('/ai/memory/search', { emailId: 'email-123' });
    });
  });

  describe('composeEmail', () => {
    it('should call correct endpoint with payload', async () => {
      const mockResponse = {
        data: { success: true, body: 'Composed email body', subject: 'Re: Test' },
      };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const payload = {
        prompt: 'Write a follow-up email',
        to: ['test@example.com'],
        tone: 'professional',
      };
      await aiApi.composeEmail(payload);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/compose', payload);
    });
  });
});

describe('aiChatApi (AI Chat)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCsrfToken.mockResolvedValue('csrf-token');
  });

  describe('chat', () => {
    it('should stream the chat response and collect text chunks', async () => {
      mockFetch.mockResolvedValue(
        createStreamResponse([
          streamFrame({ type: 'text-delta', delta: 'Hello! ' }),
          streamFrame({ type: 'text-delta', delta: 'How can I help?' }),
          streamFrame({ type: 'finish' }),
        ]),
      );

      const result = await aiChatApi.chat({ message: 'Hello' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/ai/chat',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'csrf-token',
          }),
          body: JSON.stringify({ message: 'Hello' }),
        }),
      );
      expect(result.data).toEqual({
        text: 'Hello! How can I help?',
        conversationId: undefined,
      });
    });

    it('should pass all options to the streamed transport', async () => {
      mockFetch.mockResolvedValue(
        createStreamResponse([
          streamFrame({ type: 'text-delta', delta: 'Response' }),
          streamFrame({ type: 'finish' }),
        ]),
      );

      await aiChatApi.chat({
        message: 'Send email',
        conversationId: 'conv-123',
        locale: 'it',
        model: 'large',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/ai/chat',
        expect.objectContaining({
          body: JSON.stringify({
            message: 'Send email',
            conversationId: 'conv-123',
            locale: 'it',
            model: 'large',
          }),
        }),
      );
    });

    // data-needs-approval test removed: poll-based HITL replaced by SDK-native approval flow
  });

  describe('streamChat', () => {
    it('should initiate SSE stream and return AbortController', async () => {
      mockFetch.mockResolvedValue(createStreamResponse([streamFrame({ type: 'finish' })]));

      const onChunk = jest.fn();
      const onDone = jest.fn();

      const controller = aiChatApi.streamChat({ message: 'Hi' }, onChunk, onDone);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(controller).toBeInstanceOf(AbortController);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/ai/chat',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'csrf-token',
          }),
          body: JSON.stringify({ message: 'Hi' }),
        }),
      );
      expect(onDone).toHaveBeenCalled();
    });

    it('should handle missing response body', async () => {
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ state: { token: 'test-token' } }),
      );

      mockFetch.mockResolvedValue({
        ok: true,
        body: null, // No body
      });

      const onChunk = jest.fn();
      const onError = jest.fn();

      aiChatApi.streamChat({ message: 'Hi' }, onChunk, undefined, onError);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith('No response body');
    });

    it('should call onError for non-OK response', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const onChunk = jest.fn();
      const onError = jest.fn();

      aiChatApi.streamChat({ message: 'Hi' }, onChunk, undefined, onError);

      // Wait for fetch to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith('HTTP 500: Internal Server Error');
    });
  });

  describe('getPendingActions', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = {
        data: {
          actions: [
            {
              id: 'action-1',
              executionId: 'exec-1',
              actionType: 'SEND_EMAIL',
              severity: 'MEDIUM',
              summary: 'Send email',
              payload: {},
              suspendReason: 'Requires approval',
              suspendedAt: '2025-01-01T00:00:00Z',
              userId: 'user-123',
              agentName: 'EmailAgent',
            },
          ],
          total: 1,
        },
      };
      (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiChatApi.getPendingActions();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/chat/pending-actions');
      expect(result.data.total).toBe(1);
    });
  });

  // getPendingAction test removed — endpoint removed

  describe('approveAction', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { status: 'approved' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiChatApi.approveAction('exec-1');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/chat/approve', {
        actionId: 'exec-1',
        decision: 'approve',
      });
      expect(result.data.status).toBe('approved');
    });
  });

  describe('rejectAction', () => {
    it('should call correct endpoint with reason', async () => {
      const mockResponse = { data: { status: 'rejected' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiChatApi.rejectAction('exec-1', 'Not needed');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/chat/approve', {
        actionId: 'exec-1',
        decision: 'reject',
        rejectionReason: 'Not needed',
      });
    });

    it('should work without rejection reason', async () => {
      const mockResponse = { data: { status: 'rejected' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await aiChatApi.rejectAction('exec-1');

      expect(apiClient.post).toHaveBeenCalledWith('/ai/chat/approve', {
        actionId: 'exec-1',
        decision: 'reject',
      });
    });
  });

  // getActionCounts, resetLearning, getLearningStats, getAggregateStats, getFeedback
  // tests removed — endpoints removed from aiChatApi

  describe('getWritingStyle', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { success: true, profile: { tone: 'professional' } } };
      (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiChatApi.getWritingStyle();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/stats/writing-style');
      expect(result.data.success).toBe(true);
    });
  });

  describe('getBriefing', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { success: true, briefing: { summary: 'Today...' } } };
      (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiChatApi.getBriefing();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/briefing');
      expect(result.data.success).toBe(true);
    });
  });

  describe('refreshBriefing', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { success: true, jobId: 'job-1', message: 'Queued' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiChatApi.refreshBriefing();

      expect(apiClient.post).toHaveBeenCalledWith('/ai/briefing/refresh');
      expect(result.data.jobId).toBe('job-1');
    });
  });

  describe('listConversations', () => {
    it('should call correct endpoint without params', async () => {
      const mockResponse = { data: { success: true, conversations: [], total: 0 } };
      (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

      await aiChatApi.listConversations();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/chat/conversations', { params: undefined });
    });

    it('should pass limit param', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, conversations: [], total: 0 } });

      await aiChatApi.listConversations({ limit: 5 });

      expect(apiClient.get).toHaveBeenCalledWith('/ai/chat/conversations', { params: { limit: 5 } });
    });
  });

  describe('deleteConversation', () => {
    it('should call correct endpoint with DELETE method', async () => {
      const mockResponse = { data: { success: true } };
      (apiClient.delete as jest.Mock).mockResolvedValue(mockResponse);

      await aiChatApi.deleteConversation('conv-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/ai/chat/conversations/conv-1');
    });

    it('should encode conversationId', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: { success: true } });

      await aiChatApi.deleteConversation('conv/special&chars');

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/ai/chat/conversations/${encodeURIComponent('conv/special&chars')}`,
      );
    });
  });

  describe('getUpcomingDeadlines', () => {
    it('should call correct endpoint without params', async () => {
      const mockResponse = { data: { success: true, enabled: true, count: 0, deadlines: [] } };
      (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

      await aiChatApi.getUpcomingDeadlines();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/deadlines', { params: undefined });
    });

    it('should pass days param', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, enabled: true, count: 0, deadlines: [] } });

      await aiChatApi.getUpcomingDeadlines({ days: 7 });

      expect(apiClient.get).toHaveBeenCalledWith('/ai/deadlines', { params: { days: 7 } });
    });
  });

  describe('getPendingFollowUps', () => {
    it('should call correct endpoint', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, count: 0, followUps: [] } });

      await aiChatApi.getPendingFollowUps();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/follow-ups/pending', { params: undefined });
    });

    it('should pass limit param', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, count: 0, followUps: [] } });

      await aiChatApi.getPendingFollowUps({ limit: 10 });

      expect(apiClient.get).toHaveBeenCalledWith('/ai/follow-ups/pending', { params: { limit: 10 } });
    });
  });

  describe('getFollowUpStats', () => {
    it('should call correct endpoint', async () => {
      const mockStats = { pending: 2, reminded: 1, resolved: 5, expired: 0, overdue: 1, dueToday: 1 };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, stats: mockStats } });

      const result = await aiChatApi.getFollowUpStats();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/follow-ups/stats');
      expect(result.data.stats.pending).toBe(2);
    });
  });

  describe('updateFollowUpStatus', () => {
    it('should call correct endpoint with status', async () => {
      (apiClient.patch as jest.Mock).mockResolvedValue({ data: { success: true, updated: 1 } });

      await aiChatApi.updateFollowUpStatus('fu-1', 'resolved');

      expect(apiClient.patch).toHaveBeenCalledWith('/ai/follow-ups/fu-1/status', { status: 'resolved' });
    });
  });

  describe('snoozeFollowUp', () => {
    it('should call correct endpoint with dueDate', async () => {
      (apiClient.patch as jest.Mock).mockResolvedValue({ data: { success: true, dueDate: '2026-03-20' } });

      await aiChatApi.snoozeFollowUp('fu-1', '2026-03-20');

      expect(apiClient.patch).toHaveBeenCalledWith('/ai/follow-ups/fu-1/snooze', { dueDate: '2026-03-20' });
    });
  });

  describe('deleteFollowUp', () => {
    it('should call correct endpoint', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: { success: true } });

      await aiChatApi.deleteFollowUp('fu-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/ai/follow-ups/fu-1');
    });
  });

  describe('getEmailAnalytics', () => {
    it('should call correct endpoint without params', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, analytics: {} } });

      await aiChatApi.getEmailAnalytics();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/analytics/email', { params: undefined });
    });

    it('should pass period param', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, analytics: {} } });

      await aiChatApi.getEmailAnalytics({ period: 'week' });

      expect(apiClient.get).toHaveBeenCalledWith('/ai/analytics/email', { params: { period: 'week' } });
    });
  });

  describe('generateReplyDraft', () => {
    it('should call correct endpoint with params', async () => {
      const mockResponse = { data: { draftId: 'draft-1', body: 'Hello...', subject: 'Re: Test' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const params = { emailId: 'email-1', tone: 'formal', locale: 'en' };
      await aiChatApi.generateReplyDraft(params);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/drafts/generate', params);
    });
  });

  describe('recordDraftFeedback', () => {
    it('should call correct endpoint with params', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });

      const params = { draftId: 'draft-1', action: 'accepted' as const };
      await aiChatApi.recordDraftFeedback(params);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/draft-feedback', params);
    });

    it('should include sentBody when provided', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });

      const params = { draftId: 'draft-1', action: 'edited' as const, sentBody: 'Modified body' };
      await aiChatApi.recordDraftFeedback(params);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/draft-feedback', params);
    });
  });

  describe('getDraftStats', () => {
    it('should call correct endpoint', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, stats: { total: 10 } } });

      await aiChatApi.getDraftStats();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/draft-stats');
    });
  });

  describe('updateManualSamples', () => {
    it('should call correct endpoint with params', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      const params = { samples: 'Sample text here', providerId: 'provider-1' };
      await aiChatApi.updateManualSamples(params);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/writing-style/manual-samples', params);
    });
  });
});

describe('multiAgentApi (Backwards Compatibility)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCsrfToken.mockResolvedValue('csrf-token');
  });

  describe('processMessage', () => {
    it('should map to streamed aiChatApi.chat and transform response', async () => {
      mockFetch.mockResolvedValue(
        createStreamResponse([
          streamFrame({ type: 'text-delta', delta: 'Hello!' }),
          streamFrame({ type: 'finish' }),
        ]),
      );

      const result = await multiAgentApi.processMessage({
        message: 'Hi',
        sessionId: 'session-123',
        locale: 'en',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/ai/chat',
        expect.objectContaining({
          body: JSON.stringify({
            message: 'Hi',
            conversationId: 'session-123',
            locale: 'en',
          }),
        }),
      );
      expect(result.messages).toEqual(['Hello!']);
      expect(result.pendingActionIds).toEqual([]);
      expect(result.executedActionIds).toEqual([]);
    });

    it('should extract pendingActionIds from pendingActions', async () => {
      mockFetch.mockResolvedValue(
        createStreamResponse([
          streamFrame({ type: 'text-delta', delta: 'I will send the email' }),
          streamFrame({
            type: 'data-needs-approval',
            data: {
              actionId: 'action-1',
              actionType: 'SEND_EMAIL',
              actionPayload: {},
            },
          }),
          streamFrame({
            type: 'data-needs-approval',
            data: {
              actionId: 'action-2',
              actionType: 'DRAFT_EMAIL',
              actionPayload: {},
            },
          }),
          streamFrame({ type: 'finish' }),
        ]),
      );

      const result = await multiAgentApi.processMessage({ message: 'Send email' });

      expect(result.pendingActionIds).toEqual(['action-1', 'action-2']);
    });
  });

  describe('getAgents', () => {
    it('should return empty agents array', async () => {
      const result = await multiAgentApi.getAgents();

      expect(result.agents).toEqual([]);
    });
  });

  // getPendingActions, approveAction, rejectAction tests removed:
  // poll-based HITL replaced by SDK-native approval flow
});
