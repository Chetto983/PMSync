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
 * - Conversation persistence via backend
 * - Session continuity across page refreshes
 *
 * Based on: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { voltAgentApi, ChatMessage, ConversationMessage } from '@/lib/api/ai';
import logger from '@/lib/logger';

export interface StreamChatMessage extends ChatMessage {
  id: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export type ChatStatus = 'idle' | 'streaming' | 'error' | 'loading';

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
  /** Max message history to keep in UI (default: 100) */
  maxHistory?: number;
  /** Callback when conversationId is assigned/updated (for new conversations) */
  onConversationIdChange?: (conversationId: string) => void;
  /** Auto-load existing messages when conversationId is provided */
  autoLoadHistory?: boolean;
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
  /** Clear all messages and start fresh */
  clearMessages: () => void;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Retry last failed message */
  retry: () => Promise<void>;
  /** Current conversation ID (may be set after first message) */
  currentConversationId: string | undefined;
  /** Reload conversation history from backend */
  reloadHistory: () => Promise<void>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert backend ConversationMessage to StreamChatMessage format
 */
function toStreamChatMessage(msg: ConversationMessage, idx: number): StreamChatMessage {
  return {
    id: `backend-${idx}-${Date.now()}`,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
    isStreaming: false,
  };
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
    onConversationIdChange,
    autoLoadHistory = true,
  } = options;

  const [messages, setMessages] = useState<StreamChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(initialConversationId);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');
  const streamingContentRef = useRef('');
  const isInitializedRef = useRef(false);

  /**
   * Load existing conversation messages from backend
   */
  const reloadHistory = useCallback(async () => {
    if (!currentConversationId) return;

    setStatus('loading');
    setError(null);

    try {
      const response = await voltAgentApi.getConversation(currentConversationId, { messageLimit: 50 });
      if (response.data.success && response.data.conversation?.messages) {
        const loadedMessages = response.data.conversation.messages
          .filter((msg: ConversationMessage) => msg.role !== 'system') // Filter system messages
          .map(toStreamChatMessage);

        setMessages(loadedMessages);
      }
    } catch (err) {
      logger.error('[useAiStreamChat] Failed to load conversation history:', err instanceof Error ? err : new Error(String(err)));
      setError('Failed to load conversation history');
    } finally {
      setStatus('idle');
    }
  }, [currentConversationId]);

  // Load existing conversation on mount if conversationId is provided
  useEffect(() => {
    if (autoLoadHistory && initialConversationId && !isInitializedRef.current) {
      isInitializedRef.current = true;
      setCurrentConversationId(initialConversationId);
      reloadHistory();
    }
  }, [autoLoadHistory, initialConversationId, reloadHistory]);

  // Update conversationId ref when it changes from parent
  useEffect(() => {
    if (initialConversationId !== currentConversationId && initialConversationId) {
      setCurrentConversationId(initialConversationId);
      if (autoLoadHistory) {
        reloadHistory();
      }
    }
  }, [initialConversationId, currentConversationId, autoLoadHistory, reloadHistory]);

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

      // Start streaming - use current conversationId if we have one
      abortControllerRef.current = voltAgentApi.streamChat(
        {
          message: content,
          conversationId: currentConversationId,
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
        // onConversationId - capture the conversationId from response
        (newConversationId) => {
          if (newConversationId && newConversationId !== currentConversationId) {
            setCurrentConversationId(newConversationId);
            onConversationIdChange?.(newConversationId);
          }
        },
      );
    },
    [status, stop, locale, model, maxHistory, currentConversationId, onStreamStart, onStreamEnd, onChunk, onError, onConversationIdChange],
  );

  const clearMessages = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
    // Don't clear conversationId - the backend will reuse it
    // To start a completely new conversation, parent should change conversationId prop
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
    currentConversationId,
    reloadHistory,
  };
}

export default useAiStreamChat;
