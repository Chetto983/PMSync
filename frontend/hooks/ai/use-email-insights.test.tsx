/**
 * Tests for useEmailInsights hook
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useEmailInsights, emailInsightsKeys } from './use-email-insights';
import { aiApi } from '@/lib/api/ai';

// Mock the AI API
jest.mock('@/lib/api/ai', () => ({
  aiApi: {
    summarizeEmail: jest.fn(),
    generateSmartReplies: jest.fn(),
    categorizeEmail: jest.fn(),
    analyzeSentiment: jest.fn(),
    calculatePriority: jest.fn(),
    analyzeEmail: jest.fn(),
  },
}));

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestQueryWrapper;
}

describe('useEmailInsights', () => {
  const testEmailId = 'test-email-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      expect(result.current.summary).toBeNull();
      expect(result.current.smartReplies).toEqual([]);
      expect(result.current.categories).toEqual([]);
      expect(result.current.sentiment).toBeNull();
      expect(result.current.priority).toBeNull();
      expect(result.current.analysis).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('emailInsightsKeys', () => {
    it('should generate correct query keys', () => {
      expect(emailInsightsKeys.all).toEqual(['emailInsights']);
      expect(emailInsightsKeys.summary('123')).toEqual(['emailInsights', 'summary', '123']);
      expect(emailInsightsKeys.smartReplies('123')).toEqual(['emailInsights', 'smartReplies', '123']);
      expect(emailInsightsKeys.categories('123')).toEqual(['emailInsights', 'categories', '123']);
      expect(emailInsightsKeys.sentiment('123')).toEqual(['emailInsights', 'sentiment', '123']);
      expect(emailInsightsKeys.priority('123')).toEqual(['emailInsights', 'priority', '123']);
      expect(emailInsightsKeys.analysis('123')).toEqual(['emailInsights', 'analysis', '123']);
    });
  });

  describe('fetchSummary', () => {
    it('should fetch email summary successfully', async () => {
      const mockSummary = 'This email discusses the upcoming meeting.';
      (aiApi.summarizeEmail as jest.Mock).mockResolvedValueOnce({
        data: { success: true, summary: mockSummary },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let summary;
      await act(async () => {
        summary = await result.current.fetchSummary();
      });

      expect(summary).toBe(mockSummary);
      expect(aiApi.summarizeEmail).toHaveBeenCalledWith(testEmailId, 'en');
    });

    it('should handle summary fetch error', async () => {
      (aiApi.summarizeEmail as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let summary;
      await act(async () => {
        summary = await result.current.fetchSummary();
      });

      expect(summary).toBeUndefined();
    });
  });

  describe('fetchSmartReplies', () => {
    it('should fetch smart replies successfully', async () => {
      const mockReplies = ['Thank you!', 'I will check and get back to you.', 'Sounds good!'];
      (aiApi.generateSmartReplies as jest.Mock).mockResolvedValueOnce({
        data: { success: true, suggestions: mockReplies },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let replies;
      await act(async () => {
        replies = await result.current.fetchSmartReplies();
      });

      expect(replies).toEqual(mockReplies);
      expect(aiApi.generateSmartReplies).toHaveBeenCalledWith(testEmailId, 'en', undefined);
    });

    it('should fetch smart replies with tone', async () => {
      const mockReplies = ['Dear Sir, Thank you for your message.'];
      (aiApi.generateSmartReplies as jest.Mock).mockResolvedValueOnce({
        data: { success: true, suggestions: mockReplies },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.fetchSmartReplies('formal');
      });

      expect(aiApi.generateSmartReplies).toHaveBeenCalledWith(testEmailId, 'en', 'formal');
    });
  });

  describe('fetchCategories', () => {
    it('should fetch categories successfully', async () => {
      const mockCategories = ['work', 'urgent', 'meeting'];
      (aiApi.categorizeEmail as jest.Mock).mockResolvedValueOnce({
        data: { success: true, labels: mockCategories },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let categories;
      await act(async () => {
        categories = await result.current.fetchCategories();
      });

      expect(categories).toEqual(mockCategories);
      expect(aiApi.categorizeEmail).toHaveBeenCalledWith(testEmailId, 'en');
    });
  });

  describe('fetchSentiment', () => {
    it('should fetch sentiment analysis successfully', async () => {
      const mockSentiment = {
        sentiment: 'positive',
        tone: 'friendly',
        emotion: 'happy',
        emotionalIntensity: 0.8,
        churnRisk: false,
        confidence: 0.95,
      };
      (aiApi.analyzeSentiment as jest.Mock).mockResolvedValueOnce({
        data: { success: true, ...mockSentiment },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let sentiment;
      await act(async () => {
        sentiment = await result.current.fetchSentiment();
      });

      expect(sentiment).toEqual(mockSentiment);
      expect(aiApi.analyzeSentiment).toHaveBeenCalledWith(testEmailId, 'en');
    });
  });

  describe('fetchPriority', () => {
    it('should fetch priority successfully', async () => {
      const mockPriority = {
        score: 85,
        urgency: 'high',
        recommendation: 'handle_now',
        factors: ['sender is VIP', 'contains deadline'],
      };
      (aiApi.calculatePriority as jest.Mock).mockResolvedValueOnce({
        data: { success: true, ...mockPriority },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let priority;
      await act(async () => {
        priority = await result.current.fetchPriority();
      });

      expect(priority).toEqual(mockPriority);
      expect(aiApi.calculatePriority).toHaveBeenCalledWith(testEmailId, 'en', undefined);
    });

    it('should fetch priority with sender importance', async () => {
      const mockPriority = {
        score: 95,
        urgency: 'high',
        recommendation: 'handle_now',
        factors: ['VIP sender'],
      };
      (aiApi.calculatePriority as jest.Mock).mockResolvedValueOnce({
        data: { success: true, ...mockPriority },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.fetchPriority('vip');
      });

      expect(aiApi.calculatePriority).toHaveBeenCalledWith(testEmailId, 'en', 'vip');
    });
  });

  describe('fetchAnalysis', () => {
    it('should fetch full analysis successfully', async () => {
      const mockAnalysis = {
        sentiment: 'positive',
        tone: 'professional',
        urgency: 'high',
        intent: 'request_meeting',
        priority: 80,
        escalationRisk: false,
        keyTopics: ['meeting', 'project update'],
        suggestedResponse: 'Confirm availability for the meeting.',
        confidence: 0.9,
      };
      (aiApi.analyzeEmail as jest.Mock).mockResolvedValueOnce({
        data: { success: true, ...mockAnalysis },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId }),
        { wrapper: createWrapper() },
      );

      let analysis;
      await act(async () => {
        analysis = await result.current.fetchAnalysis();
      });

      expect(analysis).toEqual(mockAnalysis);
      expect(aiApi.analyzeEmail).toHaveBeenCalledWith(testEmailId, 'en');
    });
  });

  describe('locale support', () => {
    it('should use provided locale', async () => {
      (aiApi.summarizeEmail as jest.Mock).mockResolvedValueOnce({
        data: { success: true, summary: 'Riepilogo email' },
      });

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId, locale: 'it' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.fetchSummary();
      });

      expect(aiApi.summarizeEmail).toHaveBeenCalledWith(testEmailId, 'it');
    });
  });

  describe('auto-fetch', () => {
    it('should not auto-fetch when autoFetch is false', () => {
      renderHook(
        () => useEmailInsights({ emailId: testEmailId, autoFetch: false }),
        { wrapper: createWrapper() },
      );

      expect(aiApi.summarizeEmail).not.toHaveBeenCalled();
      expect(aiApi.categorizeEmail).not.toHaveBeenCalled();
      expect(aiApi.analyzeSentiment).not.toHaveBeenCalled();
      expect(aiApi.analyzeEmail).not.toHaveBeenCalled();
    });

    it('should auto-fetch when autoFetch is true', async () => {
      (aiApi.summarizeEmail as jest.Mock).mockResolvedValue({
        data: { success: true, summary: 'Summary' },
      });
      (aiApi.categorizeEmail as jest.Mock).mockResolvedValue({
        data: { success: true, labels: [] },
      });
      (aiApi.analyzeSentiment as jest.Mock).mockResolvedValue({
        data: { success: true, sentiment: 'neutral', tone: 'neutral', emotion: 'none', emotionalIntensity: 0, churnRisk: false, confidence: 0.5 },
      });
      (aiApi.analyzeEmail as jest.Mock).mockResolvedValue({
        data: { success: true, sentiment: 'neutral', tone: 'neutral', urgency: 'low', intent: 'info', priority: 50, escalationRisk: false, keyTopics: [], suggestedResponse: '', confidence: 0.5 },
      });

      renderHook(
        () => useEmailInsights({ emailId: testEmailId, autoFetch: true }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(aiApi.summarizeEmail).toHaveBeenCalled();
      });
    });
  });

  describe('loading states', () => {
    it('should track loading state for summary', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (aiApi.summarizeEmail as jest.Mock).mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(
        () => useEmailInsights({ emailId: testEmailId, autoFetch: true }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.summaryLoading).toBe(true));

      await act(async () => {
        resolvePromise!({ data: { success: true, summary: 'Done' } });
      });

      await waitFor(() => expect(result.current.summaryLoading).toBe(false));
    });
  });
});
