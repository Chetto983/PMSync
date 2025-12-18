import { useState, useCallback } from 'react';
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

      if (data?.body) {
        setAiPreview(data.body);
      }
      if (data?.subject) {
        setAiPreviewSubject(data.subject);
      }
    } catch (error) {
      logger.error('AI compose failed', { error });
      let message = t.email.composer.aiComposeError;
      if (isAxiosError(error)) {
        message = error.response?.data?.message || message;
      }
      onError?.(message);
    } finally {
      setAiComposing(false);
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
