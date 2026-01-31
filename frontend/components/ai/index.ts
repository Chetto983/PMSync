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

// Re-export the modern AI SDK v6 hook
export { useVoltAgentChat, getMessageMetadata, getMessageText } from '@/hooks/use-voltagent-chat';
export type { UseVoltAgentChatReturn, MessageMetadata, AskUserData } from '@/hooks/use-voltagent-chat';
