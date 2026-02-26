'use client';

/**
 * useChatController - State management and handlers for AiDashboard
 *
 * Extracted from AiDashboard/index.tsx to reduce file size (CHAT-04).
 * Contains all state, refs, effects, and handlers for chat functionality.
 *
 * @see 07-01-PLAN.md for refactoring context
 */

import { useState, useRef, useCallback, useEffect, useMemo, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import {
  useVoltAgentChat,
  getMessageMetadata,
  type ViewContext,
  type ChatError,
  type AskUserData,
  type UIMessage,
} from '@/hooks/use-voltagent-chat';
import { useEmailUIStore } from '@/stores/email-ui-store';

export interface ChatControllerState {
  // State
  prompt: string;
  sending: boolean;
  chatMessages: UIMessage[];
  conversationId: string | null;
  lastError: ChatError | null;
  lastAskUser: AskUserData | undefined;
  status: string;

  // Booleans
  commandPaletteOpen: boolean;
  askUserModalOpen: boolean;
  widgetsDrawerOpen: boolean;
  mobileChatOpen: boolean;

  // Refs
  inputRef: RefObject<HTMLInputElement | null>;

  // Setters
  setPrompt: (value: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setAskUserModalOpen: (open: boolean) => void;
  setWidgetsDrawerOpen: (open: boolean) => void;
  setMobileChatOpen: (open: boolean) => void;
  setMobileDialogDismissed: (dismissed: boolean) => void;

  // Handlers
  handleRetry: () => void;
  handleAskUserResponse: (response: string | string[]) => void;
  handleNewChat: () => void;
  handleSelectConversation: (id: string | null) => Promise<void>;
  handleSendMessage: (customPrompt?: string) => Promise<void>;
  handlePromptChange: (value: string) => void;
  handleCommandSelect: (commandPrompt: string) => void;
  stop: () => void;

  // ViewContext (for passing to child components)
  viewContext: ViewContext;
}

export interface UseChatControllerOptions {
  locale: string;
  isMobileChat: boolean;
}

export function useChatController(options: UseChatControllerOptions): ChatControllerState {
  const { locale, isMobileChat } = options;

  const queryClient = useQueryClient();
  const toast = useToast();

  // ============ Refs ============
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileDialogDismissedRef = useRef(false);
  const needsTitleGenRef = useRef<string | null>(null);

  // ============ State ============
  const [prompt, setPrompt] = useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [askUserModalOpen, setAskUserModalOpen] = useState(false);
  const [widgetsDrawerOpen, setWidgetsDrawerOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // AI prompt bridge from email list "Apply AI Suggestions" button
  const pendingAiPrompt = useEmailUIStore((state) => state.pendingAiPrompt);
  const clearPendingAiPrompt = useEmailUIStore((state) => state.clearPendingAiPrompt);

  // ViewContext - hardcoded to 'ai' for now (CHAT-02)
  const viewContext: ViewContext = useMemo(
    () => ({
      currentView: 'ai',
    }),
    []
  );

  // ============ VoltAgent Chat Hook ============
  const {
    messages: chatMessages,
    status,
    sendMessage,
    stop,
    conversationId,
    setConversationId,
    setMessages: setChatMessages,
    lastError,
    lastPrompt,
    clearError,
  } = useVoltAgentChat({
    locale,
    viewContext,
    onError: (error) => {
      logger.error('[useChatController] Chat error:', error);
      // VOLT-01: Don't show toast for retryable errors - inline retry UI instead
      if (!error.message.includes('circuit') && !error.message.includes('temporarily unavailable')) {
        toast.error('Failed to send message. Please try again.');
      }
    },
    onConversationIdChange: (newId) => {
      // Mark new conversations for title generation after first assistant response
      if (newId && chatMessages.length === 0) {
        needsTitleGenRef.current = newId;
      }
    },
  });

  const sending = status === 'submitted' || status === 'streaming';

  // ============ Derived State ============
  const lastAskUser = useMemo(() => {
    const lastAssistant = [...chatMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return undefined;
    return getMessageMetadata(lastAssistant).askUser;
  }, [chatMessages]);

  // ============ Effects ============

  // Auto-generate title AFTER first assistant message arrives
  const hasAssistantMessage = chatMessages.some((msg) => msg.role === 'assistant');
  useEffect(() => {
    const convId = needsTitleGenRef.current;
    if (convId && hasAssistantMessage && conversationId === convId) {
      needsTitleGenRef.current = null;

      import('@/lib/api/ai').then(({ voltAgentApi }) => {
        voltAgentApi
          .generateConversationTitle(convId, locale)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
          })
          .catch((err) => {
            logger.debug('[useChatController] Title generation failed:', err);
          });
      });
    }
  }, [hasAssistantMessage, conversationId, queryClient, locale]);

  // Auto-open modal when there's an askUser request and not sending
  useEffect(() => {
    if (lastAskUser && !sending) {
      setAskUserModalOpen(true);
    }
  }, [lastAskUser, sending]);

  // CHAT-03: Auto-open mobile chat dialog when there's an active conversation
  useEffect(() => {
    if (isMobileChat && chatMessages.length > 0 && !mobileChatOpen && !mobileDialogDismissedRef.current) {
      setMobileChatOpen(true);
    }
    // Reset dismissed flag when switching back to desktop
    if (!isMobileChat) {
      mobileDialogDismissedRef.current = false;
    }
  }, [isMobileChat, chatMessages.length, mobileChatOpen]);

  // Auto-send pending AI prompt from email list "Apply AI Suggestions" button
  useEffect(() => {
    if (pendingAiPrompt && !sending) {
      const prompt = pendingAiPrompt;
      clearPendingAiPrompt();
      // Small delay to ensure chat UI is mounted and ready
      const timer = setTimeout(() => {
        sendMessage(prompt);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [pendingAiPrompt, sending, clearPendingAiPrompt, sendMessage]);

  // ============ Handlers ============

  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      clearError();
      sendMessage(lastPrompt);
    }
  }, [lastPrompt, clearError, sendMessage]);

  const handleAskUserResponse = useCallback(
    (response: string | string[]) => {
      const responseText = Array.isArray(response) ? response.join(', ') : response;
      setAskUserModalOpen(false);
      sendMessage(responseText);
    },
    [sendMessage]
  );

  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setConversationId(`conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPrompt('');
    mobileDialogDismissedRef.current = false;
  }, [setChatMessages, setConversationId]);

  const handleSelectConversation = useCallback(
    async (id: string | null) => {
      if (!id) {
        handleNewChat();
        return;
      }

      setConversationId(id);

      try {
        const { voltAgentApi } = await import('@/lib/api/ai');
        const conversationRes = await voltAgentApi.getConversation(id);

        if (conversationRes.data?.conversation) {
          const conv = conversationRes.data.conversation;

          const filteredMessages = conv.messages.filter(
            (m) => m.role === 'user' || m.role === 'assistant'
          );

          const seenContent = new Set<string>();
          const dedupedMessages = filteredMessages
            .filter((m) => {
              const key = `${m.role}:${m.content.slice(0, 200)}`;
              if (seenContent.has(key)) {
                logger.warn(`[useChatController] Duplicate message filtered: ${key.slice(0, 50)}`);
                return false;
              }
              seenContent.add(key);
              return true;
            })
            .map((m, idx) => ({
              id: `msg-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              role: m.role as 'user' | 'assistant',
              parts:
                m.parts && m.parts.length > 0
                  ? (m.parts as unknown as UIMessage['parts'])
                  : [{ type: 'text' as const, text: m.content }],
            })) as UIMessage[];

          setTimeout(() => {
            setChatMessages(dedupedMessages);
          }, 0);
        }
      } catch {
        handleNewChat();
      }
    },
    [handleNewChat, setConversationId, setChatMessages]
  );

  const handleSendMessage = useCallback(
    async (customPrompt?: string) => {
      const text = customPrompt || prompt.trim();
      if (!text || sending) return;

      setPrompt('');

      try {
        await sendMessage(text);
        queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
        queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      } catch (error) {
        logger.error(
          `[useChatController] Send error: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        inputRef.current?.focus();
      }
    },
    [prompt, sending, sendMessage, queryClient]
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      if (value === '/' && prompt === '') {
        setCommandPaletteOpen(true);
        return;
      }
      setPrompt(value);
    },
    [prompt]
  );

  const handleCommandSelect = useCallback((commandPrompt: string) => {
    setPrompt(commandPrompt);
    setCommandPaletteOpen(false);
    inputRef.current?.focus();
  }, []);

  const setMobileDialogDismissed = useCallback((dismissed: boolean) => {
    mobileDialogDismissedRef.current = dismissed;
  }, []);

  return {
    // State
    prompt,
    sending,
    chatMessages,
    conversationId,
    lastError,
    lastAskUser,
    status,

    // Booleans
    commandPaletteOpen,
    askUserModalOpen,
    widgetsDrawerOpen,
    mobileChatOpen,

    // Refs
    inputRef,

    // Setters
    setPrompt,
    setCommandPaletteOpen,
    setAskUserModalOpen,
    setWidgetsDrawerOpen,
    setMobileChatOpen,
    setMobileDialogDismissed,

    // Handlers
    handleRetry,
    handleAskUserResponse,
    handleNewChat,
    handleSelectConversation,
    handleSendMessage,
    handlePromptChange,
    handleCommandSelect,
    stop,

    // ViewContext
    viewContext,
  };
}

export default useChatController;
