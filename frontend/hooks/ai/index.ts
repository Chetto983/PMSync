/**
 * AI Hooks Index
 *
 * Centralized exports for AI-related React hooks.
 * Chat UI uses assistant-ui runtime (see src/components/chat/).
 * These hooks cover compose and email AI analysis.
 * HITL approval is now SDK-native (see HitlApprovalWrapper in chat components).
 */

// Compose hooks
export { useAiCompose, type ComposeOptions, type ComposeResult } from './use-ai-compose';

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
  SentimentResult,
  PriorityResult,
  EmailAnalysisResult,
} from '@/lib/api/ai';
