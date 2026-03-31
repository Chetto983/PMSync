/**
 * useEmailAi Hooks
 *
 * TanStack Query hooks for AI email analysis features.
 * Provides: summarize, smart-reply, sentiment, priority analysis.
 *
 * @example
 * const { summarize, isSummarizing, summary } = useEmailSummarize(emailId);
 * const { smartReplies, isGenerating } = useSmartReplies(emailId);
 */
import { useMutation, useQuery, queryOptions } from '@tanstack/react-query';
import { aiApi, SentimentResult, PriorityResult } from '@/lib/api/ai';

// ============ Query Keys ============

export const emailAiKeys = {
  all: ['email-ai'] as const,
  summarize: (emailId: string, locale?: string) => [...emailAiKeys.all, 'summarize', emailId, locale || 'default'] as const,
  smartReplies: (emailId: string, locale?: string, tone?: string) =>
    [...emailAiKeys.all, 'smart-replies', emailId, locale || 'default', tone || 'default'] as const,
  sentiment: (emailId: string, locale?: string) => [...emailAiKeys.all, 'sentiment', emailId, locale || 'default'] as const,
  priority: (emailId: string, locale?: string) => [...emailAiKeys.all, 'priority', emailId, locale || 'default'] as const,
};

// ============ Query Options ============

export function summarizeEmailOptions(emailId: string, locale?: string) {
  return queryOptions({
    queryKey: emailAiKeys.summarize(emailId, locale),
    queryFn: async () => {
      const response = await aiApi.summarizeEmail(emailId, locale);
      if (!response.data.success) throw new Error('Failed to summarize');
      return response.data.summary;
    },
    enabled: false, // Manual trigger only
    staleTime: 10 * 60 * 1000, // 10 min cache
    gcTime: 30 * 60 * 1000,
  });
}

export function smartRepliesOptions(emailId: string, locale?: string, tone?: string) {
  return queryOptions({
    queryKey: emailAiKeys.smartReplies(emailId, locale, tone),
    queryFn: async () => {
      const response = await aiApi.generateSmartReplies(emailId, locale, tone);
      if (!response.data.success) throw new Error('Failed to generate replies');
      return response.data.suggestions;
    },
    enabled: false, // Manual trigger only
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function sentimentOptions(emailId: string, locale?: string) {
  return queryOptions({
    queryKey: emailAiKeys.sentiment(emailId, locale),
    queryFn: async () => {
      const response = await aiApi.analyzeSentiment(emailId, locale);
      if (!response.data.success) throw new Error('Failed to analyze sentiment');
      return response.data as SentimentResult;
    },
    enabled: false,
    staleTime: 30 * 60 * 1000, // Sentiment rarely changes
    gcTime: 60 * 60 * 1000,
  });
}

export function priorityOptions(emailId: string, locale?: string) {
  return queryOptions({
    queryKey: emailAiKeys.priority(emailId, locale),
    queryFn: async () => {
      const response = await aiApi.calculatePriority(emailId, locale);
      if (!response.data.success) throw new Error('Failed to calculate priority');
      return response.data as PriorityResult;
    },
    enabled: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

// ============ Hooks ============

/**
 * Hook to summarize an email on demand
 */
export function useEmailSummarize(emailId: string, locale?: string) {
  const query = useQuery(summarizeEmailOptions(emailId, locale));

  return {
    summary: query.data ?? null,
    isSummarizing: query.isFetching,
    error: query.error,
    summarize: () => query.refetch(),
  };
}

/**
 * Hook to generate smart replies on demand
 */
export function useSmartReplies(emailId: string, locale?: string, tone?: string) {
  const query = useQuery(smartRepliesOptions(emailId, locale, tone));

  return {
    smartReplies: query.data ?? [],
    isGenerating: query.isFetching,
    error: query.error,
    generateReplies: () => query.refetch(),
  };
}

/**
 * Hook to analyze email sentiment on demand
 */
export function useEmailSentiment(emailId: string, locale?: string) {
  const query = useQuery(sentimentOptions(emailId, locale));

  return {
    sentiment: query.data ?? null,
    isAnalyzing: query.isFetching,
    error: query.error,
    analyzeSentiment: () => query.refetch(),
  };
}

/**
 * Hook to calculate email priority on demand
 */
export function useEmailPriority(emailId: string, locale?: string) {
  const query = useQuery(priorityOptions(emailId, locale));

  return {
    priority: query.data ?? null,
    isAnalyzing: query.isFetching,
    error: query.error,
    calculatePriority: () => query.refetch(),
  };
}

/**
 * Mutation-based summarize hook (alternative pattern)
 */
export function useEmailSummarizeMutation() {
  return useMutation({
    mutationFn: async ({ emailId, locale }: { emailId: string; locale?: string }) => {
      const response = await aiApi.summarizeEmail(emailId, locale);
      if (!response.data.success) throw new Error('Failed to summarize');
      return response.data.summary;
    },
  });
}

/**
 * Mutation-based smart replies hook (alternative pattern)
 */
export function useSmartRepliesMutation() {
  return useMutation({
    mutationFn: async ({
      emailId,
      locale,
      tone,
    }: {
      emailId: string;
      locale?: string;
      tone?: string;
    }) => {
      const response = await aiApi.generateSmartReplies(emailId, locale, tone);
      if (!response.data.success) throw new Error('Failed to generate replies');
      return response.data.suggestions;
    },
  });
}

const emailAiHooks = {
  useEmailSummarize,
  useSmartReplies,
  useEmailSentiment,
  useEmailPriority,
  useEmailSummarizeMutation,
  useSmartRepliesMutation,
};

export default emailAiHooks;
