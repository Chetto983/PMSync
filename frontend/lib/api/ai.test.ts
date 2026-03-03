/**
 * AI API Client Tests
 *
 * Tests for both aiApi (email insights) and voltAgentApi (multi-agent chat)
 */

import { aiApi, voltAgentApi, multiAgentApi } from './ai';
import { apiClient } from '../api-client';

// Mock the apiClient
jest.mock('../api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock fetch for SSE streaming
const mockFetch = jest.fn();
global.fetch = mockFetch;

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

describe('voltAgentApi (Multi-Agent Chat)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chat', () => {
    it('should call correct endpoint with message', async () => {
      const mockResponse = {
        data: { text: 'Hello! How can I help?', requiresApproval: false },
      };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await voltAgentApi.chat({ message: 'Hello' });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/chat', { message: 'Hello' });
    });

    it('should pass all options', async () => {
      const mockResponse = { data: { text: 'Response', requiresApproval: false } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await voltAgentApi.chat({
        message: 'Send email',
        conversationId: 'conv-123',
        locale: 'it',
        model: 'large',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/chat', {
        message: 'Send email',
        conversationId: 'conv-123',
        locale: 'it',
        model: 'large',
      });
    });

    it('should return pending actions when approval required', async () => {
      const mockResponse = {
        data: {
          text: 'I will send the email',
          requiresApproval: true,
          pendingActions: [
            {
              id: 'action-1',
              actionType: 'SEND_EMAIL',
              severity: 'MEDIUM',
              summary: 'Send email to test@example.com',
              payload: { to: 'test@example.com' },
            },
          ],
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await voltAgentApi.chat({ message: 'Send email' });

      expect(result.data.requiresApproval).toBe(true);
      expect(result.data.pendingActions).toHaveLength(1);
    });
  });

  describe('streamChat', () => {
    it('should initiate SSE stream and return AbortController', () => {
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({ state: { token: 'test-token' } }),
      );

      // Mock a successful response with an empty reader (we just test the fetch call)
      const mockReader = {
        read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const onChunk = jest.fn();
      const onDone = jest.fn();

      const controller = voltAgentApi.streamChat({ message: 'Hi' }, onChunk, onDone);

      expect(controller).toBeInstanceOf(AbortController);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/ai/chat/stream',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({ message: 'Hi' }),
        }),
      );
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

      voltAgentApi.streamChat({ message: 'Hi' }, onChunk, undefined, onError);

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

      voltAgentApi.streamChat({ message: 'Hi' }, onChunk, undefined, onError);

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

      const result = await voltAgentApi.getPendingActions();

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/ai/actions/pending');
      expect(result.data.total).toBe(1);
    });
  });

  // getPendingAction test removed — endpoint removed

  describe('approveAction', () => {
    it('should call correct endpoint', async () => {
      const mockResponse = { data: { status: 'approved' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await voltAgentApi.approveAction('exec-1');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/actions/exec-1/approve', {
        payload: undefined,
      });
      expect(result.data.status).toBe('approved');
    });
  });

  describe('rejectAction', () => {
    it('should call correct endpoint with reason', async () => {
      const mockResponse = { data: { status: 'rejected' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await voltAgentApi.rejectAction('exec-1', 'Not needed');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/actions/exec-1/reject', {
        approved: false,
        rejectionReason: 'Not needed',
      });
    });

    it('should work without rejection reason', async () => {
      const mockResponse = { data: { status: 'rejected' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await voltAgentApi.rejectAction('exec-1');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/actions/exec-1/reject', {
        approved: false,
        rejectionReason: undefined,
      });
    });
  });

  // getActionCounts, resetLearning, getLearningStats, getAggregateStats, getFeedback
  // tests removed — endpoints removed from voltAgentApi
});

describe('multiAgentApi (Backwards Compatibility)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processMessage', () => {
    it('should map to voltAgentApi.chat and transform response', async () => {
      const mockResponse = {
        data: {
          text: 'Hello!',
          requiresApproval: false,
          pendingActions: [],
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await multiAgentApi.processMessage({
        message: 'Hi',
        sessionId: 'session-123',
        locale: 'en',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/chat', {
        message: 'Hi',
        conversationId: 'session-123',
        locale: 'en',
      });
      expect(result.messages).toEqual(['Hello!']);
      expect(result.pendingActionIds).toEqual([]);
      expect(result.executedActionIds).toEqual([]);
    });

    it('should extract pendingActionIds from pendingActions', async () => {
      const mockResponse = {
        data: {
          text: 'I will send the email',
          requiresApproval: true,
          pendingActions: [
            { id: 'action-1', actionType: 'SEND_EMAIL', severity: 'MEDIUM', summary: 'Send' },
            { id: 'action-2', actionType: 'DRAFT_EMAIL', severity: 'LOW', summary: 'Draft' },
          ],
        },
      };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

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

  describe('getPendingActions', () => {
    it('should delegate to voltAgentApi', async () => {
      const mockResponse = { data: { actions: [], total: 0 } };
      (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

      await multiAgentApi.getPendingActions();

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/ai/actions/pending');
    });
  });

  describe('approveAction', () => {
    it('should delegate to voltAgentApi', async () => {
      const mockResponse = { data: { status: 'approved' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await multiAgentApi.approveAction('exec-1');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/actions/exec-1/approve', {
        payload: undefined,
      });
    });
  });

  describe('rejectAction', () => {
    it('should delegate to voltAgentApi', async () => {
      const mockResponse = { data: { status: 'rejected' } };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await multiAgentApi.rejectAction('exec-1', 'Not needed');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/ai/actions/exec-1/reject', {
        approved: false,
        rejectionReason: 'Not needed',
      });
    });
  });
});
