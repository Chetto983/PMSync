'use client';
/**
 * VoltAgent Chat Hook - Custom SSE Integration
 *
 * Uses a custom SSE handler for our VoltAgent backend instead of
 * DefaultChatTransport to avoid AI SDK v6.0 strict schema validation issues.
 *
 * Our backend emits:
 * - text-start, text-delta, text-end (for text streaming)
 * - tool-input-start, tool-input-delta, tool-output (for tool calls)
 * - finish (completion)
 * - error (errors)
 */
import { useCallback, useState, useRef } from 'react';

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
  state: 'calling' | 'complete' | 'error';
}

/** Message part from AI SDK */
export interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
}

/** Message with full AI SDK structure */
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
  setMessages: (messages: ChatMessageWithParts[]) => void;
}

export function useVoltAgentChat(options: UseVoltAgentChatOptions = {}): UseVoltAgentChatReturn {
  const { initialConversationId, locale = 'en', onError, onConversationIdChange } = options;

  const [conversationId, setConversationIdState] = useState(
    () => initialConversationId || generateConversationId()
  );
  const [messages, setMessages] = useState<ChatMessageWithParts[]>([]);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');
  const [error, setError] = useState<Error | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);

  const setConversationId = useCallback(
    (id: string) => {
      setConversationIdState(id);
      onConversationIdChange?.(id);
    },
    [onConversationIdChange]
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus('ready');
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Abort any existing request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // Add user message
      const userMessage: ChatMessageWithParts = {
        id: `user-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: content }],
      };

      // Prepare assistant message placeholder
      const assistantId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessageWithParts = {
        id: assistantId,
        role: 'assistant',
        parts: [],
        toolInvocations: [],
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setStatus('submitted');
      setError(undefined);

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/voltagent/chat/stream/v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            message: content,
            conversationId,
            locale,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentText = '';
        const toolInvocations = new Map<string, ToolInvocation>();

        setStatus('streaming');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              switch (event.type) {
                case 'text-delta':
                  currentText += event.delta || '';
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantId
                        ? { ...msg, parts: [{ type: 'text', text: currentText }] }
                        : msg
                    )
                  );
                  break;

                case 'tool-input-start':
                  toolInvocations.set(event.toolCallId, {
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    args: {},
                    state: 'calling',
                  });
                  updateToolInvocations();
                  break;

                case 'tool-input-delta':
                  {
                    const tool = toolInvocations.get(event.toolCallId);
                    if (tool) {
                      try {
                        tool.args = JSON.parse(event.inputTextDelta);
                      } catch {
                        // Args might be streamed in parts - just store raw
                        tool.args = event.inputTextDelta;
                      }
                      updateToolInvocations();
                    }
                  }
                  break;

                case 'tool-output':
                  {
                    const tool = toolInvocations.get(event.toolCallId);
                    if (tool) {
                      try {
                        tool.result = JSON.parse(event.output);
                      } catch {
                        tool.result = event.output;
                      }
                      tool.state = 'complete';
                      updateToolInvocations();
                    }
                  }
                  break;

                case 'error':
                  setError(new Error(event.errorText || event.message || 'Stream error'));
                  setStatus('error');
                  break;
              }
            } catch {
              // Ignore parse errors for partial data
            }
          }
        }

        setStatus('ready');

        function updateToolInvocations() {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, toolInvocations: Array.from(toolInvocations.values()) }
                : msg
            )
          );
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setStatus('ready');
          return;
        }
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setStatus('error');
        onError?.(errorObj);
      }
    },
    [conversationId, locale, onError]
  );

  const regenerate = useCallback(() => {
    // Get the last user message and resend
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      const textContent = lastUserMsg.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text || '')
        .join('');
      // Remove last assistant message
      setMessages((prev) => {
        const withoutLast = [...prev];
        if (withoutLast[withoutLast.length - 1]?.role === 'assistant') {
          withoutLast.pop();
        }
        if (withoutLast[withoutLast.length - 1]?.role === 'user') {
          withoutLast.pop();
        }
        return withoutLast;
      });
      sendMessage(textContent);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    status,
    error,
    sendMessage,
    stop,
    regenerate,
    conversationId,
    setConversationId,
    setMessages,
  };
}

export default useVoltAgentChat;
