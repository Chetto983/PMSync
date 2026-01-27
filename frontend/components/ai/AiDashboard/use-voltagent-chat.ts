'use client';
/**
 * VoltAgent Chat Hook - AI SDK v6 Native Integration
 *
 * Uses @ai-sdk/react useChat hook with DefaultChatTransport.
 * Backend V3 endpoint uses VoltAgent's toUIMessageStream() for protocol compliance.
 *
 * @see https://voltagent.dev/docs/ui/ai-sdk-integration/
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
 */
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useState, useMemo, useRef } from 'react';

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

function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseVoltAgentChatOptions {
  initialConversationId?: string;
  locale?: string;
  onError?: (error: Error) => void;
  onConversationIdChange?: (conversationId: string) => void;
}

/** Tool invocation from AI SDK */
export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  state?: 'calling' | 'complete';
}

/** Message part from AI SDK */
export interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'reasoning';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
}

/** Message with full AI SDK v6 structure */
export interface ChatMessageWithParts {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  toolInvocations?: ToolInvocation[];
}

export interface UseVoltAgentChatReturn {
  messages: ChatMessageWithParts[];
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  error: Error | undefined;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  regenerate: () => void;
  conversationId: string;
  setConversationId: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMessages: (messages: any[]) => void;
}

export function useVoltAgentChat(options: UseVoltAgentChatOptions = {}): UseVoltAgentChatReturn {
  const { initialConversationId, locale = 'en', onError, onConversationIdChange } = options;

  const [conversationId, setConversationIdState] = useState(
    () => initialConversationId || generateConversationId()
  );

  // Ref to prevent transport recreation during streaming
  // Transport uses ref.current which always has latest value
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const setConversationId = useCallback(
    (id: string) => {
      setConversationIdState(id);
      onConversationIdChange?.(id);
    },
    [onConversationIdChange]
  );

  // Create DefaultChatTransport for AI SDK v6 V3 endpoint
  // NOTE: Do NOT put body here - it becomes stale (GitHub Issue #7819)
  // Use prepareSendMessagesRequest instead - it's called fresh each time
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: `${API_BASE_URL}/api/v1/voltagent/chat/stream/v3`,
      headers: () => ({
        Authorization: `Bearer ${getAuthToken()}`,
      }),
      // IMPORTANT: body is passed via prepareSendMessagesRequest, NOT here
      // transport#body is cached and becomes stale (see: github.com/vercel/ai/issues/7819)
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
        } else if (typeof lastMessage?.content === 'string') {
          messageText = lastMessage.content;
        }
        return {
          body: {
            message: messageText,
            conversationId: conversationIdRef.current, // Fresh value via ref
            locale,
          },
        };
      },
    });
  }, [locale]);

  // OFFICIAL FIX for "Maximum update depth exceeded"
  // Source: https://ai-sdk.dev/docs/troubleshooting/react-maximum-update-depth-exceeded
  // "By default, the UI is re-rendered on every chunk. This can overload rendering."
  const chat = useChat({
    transport,
    id: conversationId,
    experimental_throttle: 50, // Throttle UI updates to 50ms to prevent render cascade
    onError: (error) => {
      onError?.(error);
    },
  });

  // Map AI SDK messages to our interface (preserving full structure)
  const messagesWithParts = useMemo((): ChatMessageWithParts[] => {
    return chat.messages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system',
      parts: (msg.parts || []).map((p: { type: string; text?: string }) => ({
        type: p.type as MessagePart['type'],
        text: p.text,
      })),
      toolInvocations: msg.toolInvocations?.map((t: { toolCallId: string; toolName: string; args: unknown; result?: unknown }) => ({
        toolCallId: t.toolCallId,
        toolName: t.toolName,
        args: t.args,
        result: 'result' in t ? t.result : undefined,
        state: 'result' in t ? 'complete' as const : 'calling' as const,
      })),
    }));
  }, [chat.messages]);

  // Wrapper for sendMessage that takes just a string
  const sendMessage = useCallback(
    async (content: string) => {
      // AI SDK 6.0 expects parts format
      await chat.sendMessage({
        role: 'user',
        parts: [{ type: 'text' as const, text: content }],
      });
    },
    [chat]
  );

  // Map AI SDK status to our interface
  const status = useMemo(() => {
    if (chat.error) return 'error';
    return chat.status as 'ready' | 'submitted' | 'streaming' | 'error';
  }, [chat.status, chat.error]);

  return {
    messages: messagesWithParts,
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

export default useVoltAgentChat;
