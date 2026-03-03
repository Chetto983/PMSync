/**
 * AI Hooks Index
 *
 * Centralized exports for AI-related React hooks.
 * Chat UI uses assistant-ui runtime (see src/components/chat/).
 * These hooks cover HITL actions, compose, and email AI analysis.
 */

// Compose hooks
export { useAiCompose, type ComposeOptions, type ComposeResult } from './use-ai-compose';

// AI actions hooks (HITL)
export { useAiActions, aiActionsKeys } from './use-ai-actions';

// Email AI analysis hooks (Phase 8)
export {
  useEmailSummarize,
  useSmartReplies,
  useEmailSentiment,
  useEmailPriority,
  useEmailSummarizeMutation,
  useSmartRepliesMutation,
  emailAiKeys,
} from './use-email-ai';

// Re-export types from API for convenience
export type {
  ChatMessage,
  ChatResult,
  PendingAction,
  PendingActionSummary,
  ActionCounts,
  LearningProfileStats,
  SentimentResult,
  PriorityResult,
  EmailAnalysisResult,
} from '@/lib/api/ai';
