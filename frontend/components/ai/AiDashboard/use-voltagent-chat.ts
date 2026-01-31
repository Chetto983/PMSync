'use client';

/**
 * VoltAgent Chat Hook - AI SDK v6 Native Integration
 *
 * Simplified version using AI SDK native patterns.
 * Backend sends metadata via toUIMessageStream({ messageMetadata }).
 *
 * Refactored 2026-01-31: Removed client-side text parsing, use backend metadata.
 *
 * @see https://voltagent.dev/docs/ui/ai-sdk-integration/
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
 */
import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useState, useMemo, useRef, useEffect } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ============ Types ============

/** AskUser data structure for clarifying questions */
export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserData {
  question: string;
  header: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

/** Message metadata sent by backend */
export interface MessageMetadata {
  suggestedQuestions?: string[];
  askUser?: AskUserData;
  totalTokens?: number;
}

export interface UseVoltAgentChatOptions {
  initialConversationId?: string;
  locale?: string;
  onError?: (error: Error) => void;
  onConversationIdChange?: (conversationId: string) => void;
}

// Re-export AI SDK types for consumers
export type { UIMessage };

export interface UseVoltAgentChatReturn {
  /** AI SDK native messages with parts structure */
  messages: UIMessage[];
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  error: Error | undefined;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  regenerate: () => void;
  conversationId: string;
  setConversationId: (id: string) => void;
  setMessages: (messages: UIMessage[]) => void;
}

// ============ Helpers ============

function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('auth-storage');
    return JSON.parse(stored || '{}')?.state?.token || '';
  } catch {
    return '';
  }
}

function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractTextFromParts(message: UIMessage | undefined): string {
  if (!message?.parts) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && 'text' in p)
    .map((p) => p.text)
    .join('');
}

// ============ Hook ============

export function useVoltAgentChat(options: UseVoltAgentChatOptions = {}): UseVoltAgentChatReturn {
  const { initialConversationId, locale = 'en', onError, onConversationIdChange } = options;

  // Conversation ID management
  const [conversationId, setConversationIdState] = useState(
    () => initialConversationId || generateConversationId()
  );
  const conversationIdRef = useRef(conversationId);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const setConversationId = useCallback(
    (id: string) => {
      setConversationIdState(id);
      onConversationIdChange?.(id);
    },
    [onConversationIdChange]
  );

  // Transport - stable reference, uses ref for fresh conversationId
  // Note: ref is accessed in callback (prepareSendMessagesRequest), not during render
  /* eslint-disable react-hooks/refs */
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE_URL}/api/v1/voltagent/chat/stream/v3`,
        headers: () => ({
          Authorization: `Bearer ${getAuthToken()}`,
        }),
        // Fresh body on each request (fixes stale conversationId issue)
        // See: github.com/vercel/ai/issues/7819
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: extractTextFromParts(messages[messages.length - 1] as UIMessage),
            conversationId: conversationIdRef.current,
            locale,
          },
        }),
      }),
    [locale]
  );
  /* eslint-enable react-hooks/refs */

  // AI SDK useChat - handles everything
  const chat = useChat({
    transport,
    id: conversationId,
    experimental_throttle: 100, // SDK handles render batching
    onError,
  });

  // Simple string-based sendMessage wrapper
  const sendMessage = useCallback(
    async (content: string) => {
      await chat.sendMessage({ text: content });
    },
    [chat]
  );

  // Map status
  const status = useMemo((): UseVoltAgentChatReturn['status'] => {
    if (chat.error) return 'error';
    return chat.status;
  }, [chat.status, chat.error]);

  return {
    messages: chat.messages,
    status,
    error: chat.error,
    sendMessage,
    stop: chat.stop,
    regenerate: chat.regenerate,
    conversationId,
    setConversationId,
    setMessages: chat.setMessages,
  };
}

// ============ Metadata Helpers ============

/**
 * Extract metadata from a message (for use in components).
 * Checks message.metadata first, then falls back to toolInvocations.
 */
export function getMessageMetadata(message: UIMessage): MessageMetadata {
  const metadata: MessageMetadata = {};

  // Primary: Check message.metadata (sent by backend)
  const rawMetadata = message.metadata as MessageMetadata | undefined;
  if (rawMetadata?.suggestedQuestions) {
    metadata.suggestedQuestions = rawMetadata.suggestedQuestions;
  }
  if (rawMetadata?.askUser) {
    metadata.askUser = rawMetadata.askUser;
  }
  if (rawMetadata?.totalTokens) {
    metadata.totalTokens = rawMetadata.totalTokens;
  }

  // Fallback: Check toolInvocations for ask_user_clarification
  // (backward compatibility with tool-based approach)
  if (!metadata.askUser && message.parts) {
    for (const part of message.parts) {
      if (
        part.type === 'tool-invocation' &&
        'toolName' in part &&
        part.toolName === 'ask_user_clarification' &&
        'result' in part &&
        part.result &&
        typeof part.result === 'object'
      ) {
        const result = part.result as Record<string, unknown>;
        if (result.__askUser === true) {
          metadata.askUser = {
            question: result.question as string,
            header: (result.header as string) || 'Clarification',
            options: result.options as AskUserOption[],
            multiSelect: (result.multiSelect as boolean) || false,
          };
          break;
        }
      }
    }
  }

  return metadata;
}

/**
 * Get text content from a message.
 */
export function getMessageText(message: UIMessage): string {
  return extractTextFromParts(message);
}

export default useVoltAgentChat;
