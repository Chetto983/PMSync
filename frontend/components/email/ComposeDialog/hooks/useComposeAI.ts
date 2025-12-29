import { useState, useCallback, useRef, useEffect } from 'react';
import { isAxiosError } from 'axios';
import { aiApi } from '@/lib/api/ai';
import { logger } from '@/lib/logger';
import type { ComposeMode } from '../types';

interface UseComposeAIOptions {
  to: string[];
  subject: string;
  mode: ComposeMode;
  locale: string;
  cleanEmailArray: (emails: string[]) => string[];
  onError?: (message: string) => void;
  t: {
    email: {
      composer: {
        aiComposeError: string;
      };
    };
  };
}

interface UseComposeAIReturn {
  aiDialogOpen: boolean;
  setAiDialogOpen: (open: boolean) => void;
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  aiTone: 'formal' | 'casual' | 'technical' | '';
  setAiTone: (tone: 'formal' | 'casual' | 'technical' | '') => void;
  aiVariant: 'A' | 'B';
  setAiVariant: (variant: 'A' | 'B') => void;
  aiPreview: string | null;
  aiPreviewSubject: string | null;
  aiComposing: boolean;
  handleAiGenerate: () => Promise<void>;
  handleAiComposeSubmit: (
    setBody: (body: string) => void,
    setSubject: (subject: string) => void,
    editor: { commands: { setContent: (content: string) => void } } | null
  ) => void;
  resetAiState: () => void;
}

/**
 * Hook to manage AI-assisted composition
 */
export function useComposeAI({
  to,
  subject,
  mode,
  locale,
  cleanEmailArray,
  onError,
  t,
}: UseComposeAIOptions): UseComposeAIReturn {
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState<'formal' | 'casual' | 'technical' | ''>('');
  const [aiVariant, setAiVariant] = useState<'A' | 'B'>('A');
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiPreviewSubject, setAiPreviewSubject] = useState<string | null>(null);
  const [aiComposing, setAiComposing] = useState(false);

  // Track mounted state and abort controller for cleanup (race condition fix)
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Abort any pending AI request on unmount
      abortControllerRef.current?.abort();
    };
  }, []);

  const resetAiState = useCallback(() => {
    setAiPrompt('');
    setAiTone(mode === 'reply' ? 'formal' : '');
    setAiPreview(null);
    setAiPreviewSubject(null);
  }, [mode]);

  const handleAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) {
      return;
    }

    // Cancel any pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setAiComposing(true);
    try {
      const { data } = await aiApi.composeEmail({
        prompt: aiPrompt.trim(),
        to: cleanEmailArray(to),
        subject: subject || undefined,
        tone: aiTone || (mode === 'reply' ? 'formal' : undefined),
        locale,
        variant: aiVariant,
      });

      // Check if still mounted before state updates (race condition fix)
      if (!isMountedRef.current) return;

      if (data?.body) {
        setAiPreview(data.body);
      }
      if (data?.subject) {
        setAiPreviewSubject(data.subject);
      }
    } catch (error) {
      // Check if still mounted and not aborted before handling error
      if (!isMountedRef.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;

      logger.error('AI compose failed', { error });
      let message = t.email.composer.aiComposeError;
      if (isAxiosError(error)) {
        message = error.response?.data?.message || message;
      }
      onError?.(message);
    } finally {
      // Only update state if still mounted (race condition fix)
      if (isMountedRef.current) {
        setAiComposing(false);
      }
    }
  }, [aiPrompt, aiTone, aiVariant, cleanEmailArray, locale, mode, onError, subject, t, to]);

  const handleAiComposeSubmit = useCallback(
    (
      setBody: (body: string) => void,
      setSubject: (subject: string) => void,
      editor: { commands: { setContent: (content: string) => void } } | null
    ) => {
      if (aiPreview) {
        setBody(aiPreview);
        if (editor) {
          editor.commands.setContent(aiPreview);
        }
      }
      if (aiPreviewSubject && !subject) {
        setSubject(aiPreviewSubject);
      }
      // Reset and close
      setAiDialogOpen(false);
      setAiPreview(null);
      setAiPreviewSubject(null);
    },
    [aiPreview, aiPreviewSubject, subject]
  );

  return {
    aiDialogOpen,
    setAiDialogOpen,
    aiPrompt,
    setAiPrompt,
    aiTone,
    setAiTone,
    aiVariant,
    setAiVariant,
    aiPreview,
    aiPreviewSubject,
    aiComposing,
    handleAiGenerate,
    handleAiComposeSubmit,
    resetAiState,
  };
}
