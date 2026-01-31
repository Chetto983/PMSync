/**
 * useAiChat Hook
 *
 * Re-exports the useVoltAgentChat hook for backward compatibility.
 * Based on AI SDK v6 patterns (2025 best practices).
 *
 * Features:
 * - Native AI SDK v6 streaming via DefaultChatTransport
 * - useChat() with proper message parts structure
 * - Metadata extraction for askUser and suggestedQuestions
 * - Conversation management
 */
export {
  useVoltAgentChat as useAiChat,
  useVoltAgentChat,
  getMessageMetadata,
  getMessageText,
  type UseVoltAgentChatReturn,
  type MessageMetadata,
  type AskUserData,
} from '@/hooks/use-voltagent-chat';

// Default export
export { default } from '@/hooks/use-voltagent-chat';
