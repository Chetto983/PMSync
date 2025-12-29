/**
 * AI Hooks Index
 *
 * Centralized exports for all AI-related React hooks.
 * Implements 2025 best practices with:
 * - SSE streaming for chat
 * - React Query integration
 * - WebSocket real-time updates
 * - Proper TypeScript types
 */

// Chat hooks
export { useAiChat, useAiStreamChat, type StreamChatMessage, type ChatStatus } from './use-ai-chat';

// Compose hooks
export { useAiCompose, type ComposeOptions, type ComposeResult } from './use-ai-compose';

// Email insights hooks
export { useEmailInsights, emailInsightsKeys } from './use-email-insights';

// AI actions hooks (HITL)
export { useAiActions, aiActionsKeys } from './use-ai-actions';

// Agent activity streaming (real-time WebSocket)
export { useAgentActivityStream, type AgentStep } from './use-agent-activity-stream';

// Re-export types from API for convenience
export type {
  ChatMessage,
  ChatResult,
  PendingAction,
  PendingActionSummary,
  ActionCounts,
  LearningProfileStats,
  AggregateStats,
  SentimentResult,
  PriorityResult,
  EmailAnalysisResult,
} from '@/lib/api/ai';
