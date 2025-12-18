import { useState, useCallback, useRef, useEffect } from 'react';
import { voltAgentApi, aiApi } from '@/lib/api/ai';
import { logger } from '@/lib/logger';
import type { ChatMessage, ToneType } from '../types';
import type { AppTranslations } from '@/locales';

interface UseAiComposeOptions {
  emailBody: string;
  emailSubject: string;
  recipients: string[];
  mode: 'compose' | 'reply' | 'forward';
  locale: string;
  t: AppTranslations;
  onUpdateSubject: (subject: string) => void;
}

interface UseAiComposeReturn {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isStreaming: boolean;
  tone: ToneType;
  setTone: (tone: ToneType) => void;
  generatingSubject: boolean;
  copiedId: string | null;
  handleStop: () => void;
  handleSendMessage: (messageText?: string) => void;
  handleGenerateSubject: () => void;
  handleCopy: (message: ChatMessage) => void;
  clearChat: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook to manage AI compose chat state and actions
 */
export function useAiCompose({
  emailBody,
  emailSubject,
  recipients,
  mode,
  locale,
  t,
  onUpdateSubject,
}: UseAiComposeOptions): UseAiComposeReturn {
  const localeKey = locale.toLowerCase().startsWith('it') ? 'it' : 'en';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tone, setTone] = useState<ToneType>('casual');
  const [generatingSubject, setGeneratingSubject] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Stop streaming
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      if (streamingContentRef.current) {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: streamingContentRef.current,
                suggestion: streamingContentRef.current,
                isStreaming: false,
              },
            ];
          }
          return prev;
        });
      }

      streamingContentRef.current = '';
      setIsStreaming(false);
    }
  }, []);

  // Build context prompt for the AI
  const buildContextPrompt = useCallback(
    (userRequest: string): string => {
      const isIt = localeKey === 'it';
      const parts: string[] = [];

      const toneInstruction = {
        formal: isIt ? 'Usa un tono formale e professionale.' : 'Use a formal, professional tone.',
        casual: isIt ? 'Usa un tono amichevole e informale.' : 'Use a friendly, casual tone.',
        technical: isIt ? 'Usa un tono tecnico e preciso.' : 'Use a technical, precise tone.',
      };
      parts.push(toneInstruction[tone]);

      if (isIt) {
        parts.push(
          `L'utente sta ${mode === 'reply' ? 'rispondendo a' : mode === 'forward' ? 'inoltrando' : 'scrivendo'} un'email.`
        );
        if (emailSubject) parts.push(`Oggetto: ${emailSubject}`);
        if (recipients.length > 0) parts.push(`Destinatari: ${recipients.join(', ')}`);
        if (emailBody.trim()) parts.push(`\nBozza attuale:\n---\n${emailBody}\n---`);
        parts.push(`\nRichiesta: ${userRequest}`);
        parts.push("\nRispondi con il testo dell'email. Non includere spiegazioni.");
      } else {
        parts.push(
          `The user is ${mode === 'reply' ? 'replying to' : mode === 'forward' ? 'forwarding' : 'composing'} an email.`
        );
        if (emailSubject) parts.push(`Subject: ${emailSubject}`);
        if (recipients.length > 0) parts.push(`Recipients: ${recipients.join(', ')}`);
        if (emailBody.trim()) parts.push(`\nCurrent draft:\n---\n${emailBody}\n---`);
        parts.push(`\nRequest: ${userRequest}`);
        parts.push('\nRespond with the email text only. No explanations.');
      }

      return parts.join('\n');
    },
    [emailBody, emailSubject, recipients, mode, localeKey, tone]
  );

  // Send message with streaming
  const handleSendMessage = useCallback(
    (messageText?: string) => {
      const text = messageText || inputValue.trim();
      if (!text || isStreaming) return;

      handleStop();

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInputValue('');
      setIsStreaming(true);
      streamingContentRef.current = '';

      const contextPrompt = buildContextPrompt(text);

      abortControllerRef.current = voltAgentApi.streamChat(
        {
          message: contextPrompt,
          locale: localeKey,
          model: 'medium',
        },
        (chunk) => {
          streamingContentRef.current += chunk;
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [...prev.slice(0, -1), { ...lastMessage, content: streamingContentRef.current }];
            }
            return prev;
          });
        },
        () => {
          const finalContent = streamingContentRef.current;
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: finalContent, suggestion: finalContent, isStreaming: false },
              ];
            }
            return prev;
          });
          streamingContentRef.current = '';
          setIsStreaming(false);
          abortControllerRef.current = null;
        },
        (errorMessage) => {
          logger.error('AI stream error', { errorMessage });
          const errorContent = t.email.composer.aiChatError;

          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.isStreaming) {
              return [...prev.slice(0, -1), { ...lastMessage, content: errorContent, isStreaming: false }];
            }
            return prev;
          });
          streamingContentRef.current = '';
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      );
    },
    [inputValue, isStreaming, handleStop, buildContextPrompt, localeKey, t]
  );

  // Generate smart subject
  const handleGenerateSubject = useCallback(async () => {
    if (!emailBody.trim() || generatingSubject) return;

    setGeneratingSubject(true);
    try {
      const { data } = await aiApi.composeEmail({
        prompt:
          localeKey === 'it'
            ? `Genera un oggetto email breve e efficace per questa email:\n${emailBody}`
            : `Generate a short, effective email subject line for this email:\n${emailBody}`,
        locale: localeKey,
      });

      if (data?.subject) {
        onUpdateSubject(data.subject);
      }
    } catch (error) {
      logger.error('Subject generation error', { error });
    } finally {
      setGeneratingSubject(false);
    }
  }, [emailBody, localeKey, onUpdateSubject, generatingSubject]);

  // Copy message to clipboard
  const handleCopy = useCallback((message: ChatMessage) => {
    if (message.suggestion) {
      navigator.clipboard.writeText(message.suggestion);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  // Clear chat
  const clearChat = useCallback(() => {
    handleStop();
    setMessages([]);
  }, [handleStop]);

  return {
    messages,
    inputValue,
    setInputValue,
    isStreaming,
    tone,
    setTone,
    generatingSubject,
    copiedId,
    handleStop,
    handleSendMessage,
    handleGenerateSubject,
    handleCopy,
    clearChat,
  };
}
