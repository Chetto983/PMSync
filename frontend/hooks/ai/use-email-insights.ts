/**
 * useEmailInsights Hook
 *
 * React hook for AI-powered email analysis.
 * Implements 2025 best practices with React Query integration.
 *
 * Features:
 * - Email summarization
 * - Smart reply suggestions
 * - Email categorization/labeling
 * - Sentiment analysis
 * - Priority calculation
 * - Comprehensive email analysis
 * - Caching with React Query
 */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  aiApi,
  SentimentResult,
  PriorityResult,
  EmailAnalysisResult,
} from '@/lib/api/ai';

// Query key factory for consistent caching
export const emailInsightsKeys = {
  all: ['emailInsights'] as const,
  summary: (emailId: string) => [...emailInsightsKeys.all, 'summary', emailId] as const,
  smartReplies: (emailId: string) => [...emailInsightsKeys.all, 'smartReplies', emailId] as const,
  categories: (emailId: string) => [...emailInsightsKeys.all, 'categories', emailId] as const,
  sentiment: (emailId: string) => [...emailInsightsKeys.all, 'sentiment', emailId] as const,
  priority: (emailId: string) => [...emailInsightsKeys.all, 'priority', emailId] as const,
  analysis: (emailId: string) => [...emailInsightsKeys.all, 'analysis', emailId] as const,
};

interface UseEmailInsightsOptions {
  /** Email ID to analyze */
  emailId: string;
  /** Locale for AI responses */
  locale?: string;
  /** Whether to auto-fetch on mount */
  autoFetch?: boolean;
  /** Stale time in milliseconds */
  staleTime?: number;
}

interface UseEmailInsightsReturn {
  // Summary
  summary: string | null;
  summaryLoading: boolean;
  summaryError: Error | null;
  fetchSummary: () => Promise<string | undefined>;

  // Smart Replies
  smartReplies: string[];
  smartRepliesLoading: boolean;
  smartRepliesError: Error | null;
  fetchSmartReplies: (tone?: string) => Promise<string[] | undefined>;

  // Categories
  categories: string[];
  categoriesLoading: boolean;
  categoriesError: Error | null;
  fetchCategories: () => Promise<string[] | undefined>;

  // Sentiment
  sentiment: SentimentResult | null;
  sentimentLoading: boolean;
  sentimentError: Error | null;
  fetchSentiment: () => Promise<SentimentResult | undefined>;

  // Priority
  priority: PriorityResult | null;
  priorityLoading: boolean;
  priorityError: Error | null;
  fetchPriority: (senderImportance?: 'vip' | 'important' | 'normal' | 'low') => Promise<PriorityResult | undefined>;

  // Full Analysis
  analysis: EmailAnalysisResult | null;
  analysisLoading: boolean;
  analysisError: Error | null;
  fetchAnalysis: () => Promise<EmailAnalysisResult | undefined>;

  // Bulk
  isLoading: boolean;
  invalidateAll: () => void;
}

export function useEmailInsights(options: UseEmailInsightsOptions): UseEmailInsightsReturn {
  const { emailId, locale = 'en', autoFetch = false, staleTime = 5 * 60 * 1000 } = options;
  const queryClient = useQueryClient();

  // Summary Query
  const summaryQuery = useQuery({
    queryKey: emailInsightsKeys.summary(emailId),
    queryFn: async () => {
      const response = await aiApi.summarizeEmail(emailId, locale);
      if (!response.data.success) throw new Error('Failed to summarize email');
      return response.data.summary;
    },
    enabled: autoFetch && !!emailId,
    staleTime,
  });

  // Smart Replies Mutation (uses mutation for tone parameter)
  const smartRepliesMutation = useMutation({
    mutationFn: async (tone?: string) => {
      const response = await aiApi.generateSmartReplies(emailId, locale, tone);
      if (!response.data.success) throw new Error('Failed to generate smart replies');
      return response.data.suggestions;
    },
  });

  // Categories Query
  const categoriesQuery = useQuery({
    queryKey: emailInsightsKeys.categories(emailId),
    queryFn: async () => {
      const response = await aiApi.categorizeEmail(emailId, locale);
      if (!response.data.success) throw new Error('Failed to categorize email');
      return response.data.labels;
    },
    enabled: autoFetch && !!emailId,
    staleTime,
  });

  // Sentiment Query
  const sentimentQuery = useQuery({
    queryKey: emailInsightsKeys.sentiment(emailId),
    queryFn: async () => {
      const response = await aiApi.analyzeSentiment(emailId, locale);
      if (!response.data.success) throw new Error('Failed to analyze sentiment');
      const { success: _, ...result } = response.data;
      return result as SentimentResult;
    },
    enabled: autoFetch && !!emailId,
    staleTime,
  });

  // Priority Mutation (uses mutation for senderImportance parameter)
  const priorityMutation = useMutation({
    mutationFn: async (senderImportance?: 'vip' | 'important' | 'normal' | 'low') => {
      const response = await aiApi.calculatePriority(emailId, locale, senderImportance);
      if (!response.data.success) throw new Error('Failed to calculate priority');
      const { success: _, ...result } = response.data;
      return result as PriorityResult;
    },
  });

  // Full Analysis Query
  const analysisQuery = useQuery({
    queryKey: emailInsightsKeys.analysis(emailId),
    queryFn: async () => {
      const response = await aiApi.analyzeEmail(emailId, locale);
      if (!response.data.success) throw new Error('Failed to analyze email');
      const { success: _, ...result } = response.data;
      return result as EmailAnalysisResult;
    },
    enabled: autoFetch && !!emailId,
    staleTime,
  });

  // Fetch functions
  const fetchSummary = useCallback(async () => {
    try {
      return await queryClient.fetchQuery({
        queryKey: emailInsightsKeys.summary(emailId),
        queryFn: async () => {
          const response = await aiApi.summarizeEmail(emailId, locale);
          if (!response.data.success) throw new Error('Failed to summarize');
          return response.data.summary;
        },
        staleTime,
      });
    } catch {
      return undefined;
    }
  }, [emailId, locale, queryClient, staleTime]);

  const fetchSmartReplies = useCallback(
    async (tone?: string) => {
      try {
        return await smartRepliesMutation.mutateAsync(tone);
      } catch {
        return undefined;
      }
    },
    [smartRepliesMutation],
  );

  const fetchCategories = useCallback(async () => {
    try {
      return await queryClient.fetchQuery({
        queryKey: emailInsightsKeys.categories(emailId),
        queryFn: async () => {
          const response = await aiApi.categorizeEmail(emailId, locale);
          if (!response.data.success) throw new Error('Failed to categorize');
          return response.data.labels;
        },
        staleTime,
      });
    } catch {
      return undefined;
    }
  }, [emailId, locale, queryClient, staleTime]);

  const fetchSentiment = useCallback(async () => {
    try {
      return await queryClient.fetchQuery({
        queryKey: emailInsightsKeys.sentiment(emailId),
        queryFn: async () => {
          const response = await aiApi.analyzeSentiment(emailId, locale);
          if (!response.data.success) throw new Error('Failed to analyze sentiment');
          const { success: _, ...result } = response.data;
          return result as SentimentResult;
        },
        staleTime,
      });
    } catch {
      return undefined;
    }
  }, [emailId, locale, queryClient, staleTime]);

  const fetchPriority = useCallback(
    async (senderImportance?: 'vip' | 'important' | 'normal' | 'low') => {
      try {
        return await priorityMutation.mutateAsync(senderImportance);
      } catch {
        return undefined;
      }
    },
    [priorityMutation],
  );

  const fetchAnalysis = useCallback(async () => {
    try {
      return await queryClient.fetchQuery({
        queryKey: emailInsightsKeys.analysis(emailId),
        queryFn: async () => {
          const response = await aiApi.analyzeEmail(emailId, locale);
          if (!response.data.success) throw new Error('Failed to analyze');
          const { success: _, ...result } = response.data;
          return result as EmailAnalysisResult;
        },
        staleTime,
      });
    } catch {
      return undefined;
    }
  }, [emailId, locale, queryClient, staleTime]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: emailInsightsKeys.all });
  }, [queryClient]);

  const isLoading =
    summaryQuery.isLoading ||
    smartRepliesMutation.isPending ||
    categoriesQuery.isLoading ||
    sentimentQuery.isLoading ||
    priorityMutation.isPending ||
    analysisQuery.isLoading;

  return {
    // Summary
    summary: summaryQuery.data ?? null,
    summaryLoading: summaryQuery.isLoading,
    summaryError: summaryQuery.error,
    fetchSummary,

    // Smart Replies
    smartReplies: smartRepliesMutation.data ?? [],
    smartRepliesLoading: smartRepliesMutation.isPending,
    smartRepliesError: smartRepliesMutation.error,
    fetchSmartReplies,

    // Categories
    categories: categoriesQuery.data ?? [],
    categoriesLoading: categoriesQuery.isLoading,
    categoriesError: categoriesQuery.error,
    fetchCategories,

    // Sentiment
    sentiment: sentimentQuery.data ?? null,
    sentimentLoading: sentimentQuery.isLoading,
    sentimentError: sentimentQuery.error,
    fetchSentiment,

    // Priority
    priority: priorityMutation.data ?? null,
    priorityLoading: priorityMutation.isPending,
    priorityError: priorityMutation.error,
    fetchPriority,

    // Full Analysis
    analysis: analysisQuery.data ?? null,
    analysisLoading: analysisQuery.isLoading,
    analysisError: analysisQuery.error,
    fetchAnalysis,

    // Bulk
    isLoading,
    invalidateAll,
  };
}

export default useEmailInsights;
