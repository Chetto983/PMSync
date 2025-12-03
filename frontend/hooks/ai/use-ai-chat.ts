/**
 * useAiChat Hook
 *
 * Re-exports the useAiStreamChat hook with additional convenience features.
 * Based on Vercel AI SDK patterns (2025 best practices).
 *
 * Features:
 * - Token-by-token SSE streaming
 * - AbortController for stop functionality
 * - Auto-scroll support
 * - Error handling with retry
 * - Message history management
 * - React Query integration ready
 */
export {
  useAiStreamChat as useAiChat,
  useAiStreamChat,
  type StreamChatMessage,
  type ChatStatus,
} from '../use-ai-stream-chat';

// Re-export default
export { default } from '../use-ai-stream-chat';
