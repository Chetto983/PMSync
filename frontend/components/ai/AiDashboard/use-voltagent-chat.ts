'use client';
/**
 * VoltAgent Chat Hook - Vercel AI SDK 6.0 Integration
 *
 * Uses @ai-sdk/react useChat hook with custom transport for our backend.
 * This is the official VoltAgent pattern - no reinventing the wheel.
 *
 * Based on: https://voltagent.dev/docs/ui/ai-sdk-integration/
 * AI SDK 6.0 API: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
 */
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useState, useMemo } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || '';
    }
  } catch {
    /* ignore */
  }
  return '';
}

// Generate a conversation ID - called lazily to avoid React purity issues
function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseVoltAgentChatOptions {
  initialConversationId?: string;
  locale?: string;
  onError?: (error: Error) => void;
  onConversationIdChange?: (conversationId: string) => void;
}

export interface UseVoltAgentChatReturn {
  /** Current messages in the conversation */
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  /** Chat status: ready, submitted, streaming, error */
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  /** Error if any */
  error: Error | undefined;
  /** Send a new message */
  sendMessage: (content: string) => Promise<void>;
  /** Stop the current stream */
  stop: () => void;
  /** Regenerate the last assistant message */
  regenerate: () => void;
  /** Current conversation ID */
  conversationId: string;
  /** Set conversation ID (for loading existing conversations) */
  setConversationId: (id: string) => void;
  /** Set messages directly (for loading existing conversation) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMessages: (messages: any[]) => void;
}

export function useVoltAgentChat(options: UseVoltAgentChatOptions = {}): UseVoltAgentChatReturn {
  const {
    initialConversationId,
    locale = 'en',
    onError,
    onConversationIdChange,
  } = options;

  // Use lazy initialization to avoid impure function calls during render
  const [conversationId, setConversationIdState] = useState(
    () => initialConversationId || generateConversationId()
  );

  const setConversationId = useCallback((id: string) => {
    setConversationIdState(id);
    onConversationIdChange?.(id);
  }, [onConversationIdChange]);

  // Create transport with AI SDK v6 compatible endpoint
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${API_BASE_URL}/api/v1/voltagent/chat/stream/v2`,
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: {
        conversationId,
        locale,
      },
      // Map AI SDK message format to our backend format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prepareSendMessagesRequest: ({ messages }: { messages: any[] }) => {
        const lastMessage = messages[messages.length - 1];
        // Extract text content from parts
        let messageText = '';
        if (lastMessage?.parts) {
          messageText = lastMessage.parts
            .filter((p: { type: string }) => p.type === 'text')
            .map((p: { type: string; text?: string }) => p.text || '')
            .join('');
        }
        return {
          body: {
            message: messageText,
            conversationId,
            locale,
          },
        };
      },
    });
  }, [conversationId, locale]);

  const chat = useChat({
    transport,
    id: conversationId,
    onError: (error) => {
      console.error('[useVoltAgentChat] Error:', error);
      onError?.(error);
    },
  });

  // Convert UIMessage parts to simple content string
  const messagesWithContent = useMemo(() => {
    return chat.messages.map((msg) => {
      let content = '';
      if (msg.parts) {
        content = msg.parts
          .filter((p: { type: string }): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p: { type: 'text'; text: string }) => p.text)
          .join('');
      }
      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
      };
    });
  }, [chat.messages]);

  // Wrapper for sendMessage that takes just a string
  const sendMessage = useCallback(async (content: string) => {
    // AI SDK 6.0 expects parts format
    await chat.sendMessage({
      role: 'user',
      parts: [{ type: 'text' as const, text: content }],
    });
  }, [chat]);

  return {
    messages: messagesWithContent,
    status: chat.status,
    error: chat.error,
    sendMessage,
    stop: chat.stop,
    regenerate: chat.regenerate,
    conversationId,
    setConversationId,
    setMessages: chat.setMessages,
  };
}

export default useVoltAgentChat;
