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
import { useCallback, useState, useMemo, useRef, useEffect } from 'react';

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

/**
 * Extract suggested questions from message text and return cleaned text.
 * Format: ```suggestions\n["Q1?", "Q2?"]\n```
 */
function extractSuggestedQuestions(text: string): {
  cleanText: string;
  questions: string[] | undefined;
} {
  const suggestionsRegex = /```suggestions\s*\n(\[[\s\S]*?\])\s*\n```/;
  const match = text.match(suggestionsRegex);

  if (!match) {
    return { cleanText: text, questions: undefined };
  }

  try {
    const questions = JSON.parse(match[1]);
    if (Array.isArray(questions) && questions.length > 0) {
      // Remove the suggestions block from text
      const cleanText = text.replace(suggestionsRegex, '').trim();
      return { cleanText, questions };
    }
  } catch {
    // Invalid JSON - return original
  }

  return { cleanText: text, questions: undefined };
}

/**
 * Extract ask-user clarification request from message text.
 * Format: ```ask-user\n{...}\n```
 */
function extractAskUser(text: string): {
  cleanText: string;
  askUser: AskUserData | undefined;
} {
  const askUserRegex = /```ask-user\s*\n(\{[\s\S]*?\})\s*\n```/;
  const match = text.match(askUserRegex);

  if (!match) {
    return { cleanText: text, askUser: undefined };
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.question && parsed.options) {
      const cleanText = text.replace(askUserRegex, '').trim();
      return {
        cleanText,
        askUser: {
          question: parsed.question,
          header: parsed.header || 'Clarification',
          options: parsed.options,
          multiSelect: parsed.multiSelect || false,
        },
      };
    }
  } catch {
    // Invalid JSON - return original
  }

  return { cleanText: text, askUser: undefined };
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
  /** Suggested follow-up questions (parsed from assistant response) */
  suggestedQuestions?: string[];
  /** Ask-user clarification request (Claude Code style) */
  askUser?: AskUserData;
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

  // Sync ref with state changes (must be in useEffect, not during render)
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

  // Create DefaultChatTransport for AI SDK v6 V3 endpoint
  // NOTE: Do NOT put body here - it becomes stale (GitHub Issue #7819)
  // Use prepareSendMessagesRequest instead - it's called fresh each time
  /* eslint-disable react-hooks/refs -- ref accessed in callback (prepareSendMessagesRequest), not during render */
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
  /* eslint-enable react-hooks/refs */

  // OFFICIAL FIX for "Maximum update depth exceeded"
  // Source: https://ai-sdk.dev/docs/troubleshooting/react-maximum-update-depth-exceeded
  // See also: https://github.com/vercel/ai/issues/1610
  // "By default, the UI is re-rendered on every chunk. This can overload rendering."
  const chat = useChat({
    transport,
    id: conversationId,
    experimental_throttle: 100, // Throttle UI updates to 100ms to prevent render cascade
    onError: (error) => {
      onError?.(error);
    },
  });

  // Map AI SDK messages to our interface (preserving full structure)
  // Parse suggested questions from assistant messages
  const messagesWithParts = useMemo((): ChatMessageWithParts[] => {
    return chat.messages.map((msg) => {
      // Extract text from parts
      const originalParts = (msg.parts || []).map((p: { type: string; text?: string }) => ({
        type: p.type as MessagePart['type'],
        text: p.text,
      }));

      // For assistant messages, check for suggested questions and ask-user
      let suggestedQuestions: string[] | undefined;
      let askUser: AskUserData | undefined;
      let finalParts = originalParts;

      if (msg.role === 'assistant') {
        // Combine all text parts to find suggestions/ask-user
        const fullText = originalParts
          .filter((p: MessagePart) => p.type === 'text' && p.text)
          .map((p: MessagePart) => p.text)
          .join('');

        // Extract ask-user first (so we can clean it from text)
        const askUserResult = extractAskUser(fullText);
        askUser = askUserResult.askUser;
        let cleanedText = askUserResult.cleanText;

        // Then extract suggestions
        const suggestionsResult = extractSuggestedQuestions(cleanedText);
        suggestedQuestions = suggestionsResult.questions;
        cleanedText = suggestionsResult.cleanText;

        // If we found anything to clean, update the text parts
        if (cleanedText !== fullText) {
          finalParts = originalParts.map((p: MessagePart) => {
            if (p.type === 'text' && p.text) {
              return { ...p, text: cleanedText };
            }
            return p;
          });
          // Keep only the first text part with content
          let foundText = false;
          finalParts = finalParts.filter((p: MessagePart) => {
            if (p.type === 'text') {
              if (!foundText && p.text) {
                foundText = true;
                return true;
              }
              return false;
            }
            return true;
          });
        }
      }

      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: finalParts,
        toolInvocations: msg.toolInvocations?.map((t: { toolCallId: string; toolName: string; args: unknown; result?: unknown }) => ({
          toolCallId: t.toolCallId,
          toolName: t.toolName,
          args: t.args,
          result: 'result' in t ? t.result : undefined,
          state: 'result' in t ? 'complete' as const : 'calling' as const,
        })),
        suggestedQuestions,
        askUser,
      };
    });
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
