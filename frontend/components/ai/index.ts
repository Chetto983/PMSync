/**
 * AI Components
 *
 * Modern AI chat components with streaming support.
 * Follows 2025 best practices from:
 * - https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
 * - https://bricxlabs.com/blogs/message-screen-ui-deisgn
 * - Superhuman's AI integration patterns
 */

export { TypingIndicator } from './TypingIndicator';
export { StreamingMessage } from './StreamingMessage';
export { ChatPanel } from './ChatPanel';

// Re-export hook for convenience
export { useAiStreamChat } from '@/hooks/use-ai-stream-chat';
export type { StreamChatMessage, ChatStatus } from '@/hooks/use-ai-stream-chat';
