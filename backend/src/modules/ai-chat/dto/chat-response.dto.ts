/**
 * Type definitions for AI chat streaming response chunks.
 *
 * The actual response is an SSE stream handled by AI SDK v6
 * pipeUIMessageStreamToResponse. These types document the
 * chunk format for frontend consumers.
 *
 * Phase 24: Backend Core Pipeline
 */

/** Possible chunk types emitted in the SSE stream */
export type StreamChunkType =
  | 'text-delta'
  | 'tool-call'
  | 'tool-result'
  | 'error'
  | 'usage'
  | 'needs-approval';

/** Metadata about the completed chat interaction */
export interface ChatUsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  latencyMs: number;
}

/** Conversation info returned alongside stream (via headers or final chunk) */
export interface ConversationInfo {
  conversationId: string;
  isNew: boolean;
}
