/**
 * useAiStreamChat Hook
 *
 * React hook for streaming AI chat with VoltAgent.
 * Implements 2025 best practices:
 * - Token-by-token streaming
 * - AbortController for stop functionality
 * - Auto-scroll support
 * - Error handling with retry
 * - Message history management
 *
 * Based on: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { voltAgentApi, ChatMessage } from '@/lib/api/ai';

export interface StreamChatMessage extends ChatMessage {
  id: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export type ChatStatus = 'idle' | 'streaming' | 'error';

interface UseAiStreamChatOptions {
  /** Initial conversation ID for continuing sessions */
  conversationId?: string;
  /** Locale for AI responses */
  locale?: string;
  /** Model size preference */
  model?: 'small' | 'medium' | 'large';
  /** Callback when streaming starts */
  onStreamStart?: () => void;
  /** Callback when streaming completes */
  onStreamEnd?: (fullText: string) => void;
  /** Callback on each chunk */
  onChunk?: (chunk: string, fullText: string) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Max message history to keep (default: 100) */
  maxHistory?: number;
}

interface UseAiStreamChatReturn {
  /** All messages in the conversation */
  messages: StreamChatMessage[];
  /** Current streaming message content */
  streamingContent: string;
  /** Current chat status */
  status: ChatStatus;
  /** Error message if any */
  error: string | null;
  /** Send a message (starts streaming) */
  sendMessage: (content: string) => Promise<void>;
  /** Stop current streaming */
  stop: () => void;
  /** Clear all messages */
  clearMessages: () => void;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Retry last failed message */
  retry: () => Promise<void>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useAiStreamChat(
  options: UseAiStreamChatOptions = {},
): UseAiStreamChatReturn {
  const {
    conversationId: initialConversationId,
    locale = 'en',
    model,
    onStreamStart,
    onStreamEnd,
    onChunk,
    onError,
    maxHistory = 100,
  } = options;

  const [messages, setMessages] = useState<StreamChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef(initialConversationId);
  const lastUserMessageRef = useRef<string>('');
  const streamingContentRef = useRef('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      // Finalize the streaming message with current content
      if (streamingContentRef.current) {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: streamingContentRef.current,
                isStreaming: false,
              },
            ];
          }
          return prev;
        });
      }

      setStreamingContent('');
      streamingContentRef.current = '';
      setStatus('idle');
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || status === 'streaming') return;

      // Stop any existing stream
      stop();

      // Save for potential retry
      lastUserMessageRef.current = content;

      // Add user message
      const userMessage: StreamChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      // Add placeholder assistant message
      const assistantMessage: StreamChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => {
        const updated = [...prev, userMessage, assistantMessage];
        // Trim to max history
        if (updated.length > maxHistory) {
          return updated.slice(-maxHistory);
        }
        return updated;
      });

      setStatus('streaming');
      setError(null);
      setStreamingContent('');
      streamingContentRef.current = '';

      onStreamStart?.();

      // Start streaming
      abortControllerRef.current = voltAgentApi.streamChat(
        {
          message: content,
          conversationId: conversationIdRef.current,
          locale,
          model,
        },
        // onChunk
        (chunk) => {
          streamingContentRef.current += chunk;
          setStreamingContent(streamingContentRef.current);
          onChunk?.(chunk, streamingContentRef.current);

          // Update the assistant message content
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: streamingContentRef.current },
              ];
            }
            return prev;
          });
        },
        // onDone
        () => {
          const finalContent = streamingContentRef.current;

          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: finalContent,
                  isStreaming: false,
                },
              ];
            }
            return prev;
          });

          setStreamingContent('');
          streamingContentRef.current = '';
          setStatus('idle');
          abortControllerRef.current = null;

          onStreamEnd?.(finalContent);
        },
        // onError
        (errorMessage) => {
          setError(errorMessage);
          setStatus('error');

          // Remove the failed assistant message
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return prev.slice(0, -1);
            }
            return prev;
          });

          setStreamingContent('');
          streamingContentRef.current = '';
          abortControllerRef.current = null;

          onError?.(errorMessage);
        },
      );
    },
    [status, stop, locale, model, maxHistory, onStreamStart, onStreamEnd, onChunk, onError],
  );

  const clearMessages = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
  }, [stop]);

  const retry = useCallback(async () => {
    if (lastUserMessageRef.current) {
      await sendMessage(lastUserMessageRef.current);
    }
  }, [sendMessage]);

  return {
    messages,
    streamingContent,
    status,
    error,
    sendMessage,
    stop,
    clearMessages,
    isStreaming: status === 'streaming',
    retry,
  };
}

export default useAiStreamChat;
