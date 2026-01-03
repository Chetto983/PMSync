/**
 * useAiCompose Hook
 *
 * React hook for AI-powered email composition.
 * Implements 2025 best practices with React Query integration.
 *
 * Features:
 * - Draft generation from prompts
 * - Tone adjustment (formal, casual, professional)
 * - Subject line generation
 * - Caching with React Query patterns
 * - Loading and error states
 */
import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '@/lib/api/ai';

export interface ComposeOptions {
  /** Email prompt/instructions */
  prompt: string;
  /** Optional recipient emails for context */
  to?: string[];
  /** Optional existing subject */
  subject?: string;
  /** Writing tone */
  tone?: 'formal' | 'casual' | 'professional' | 'friendly' | 'concise';
  /** Locale for AI responses */
  locale?: string;
}

export interface ComposeResult {
  /** Generated email body */
  body: string;
  /** Generated or refined subject line */
  subject?: string;
}

interface UseAiComposeOptions {
  /** Default locale */
  locale?: string;
  /** Default tone */
  defaultTone?: ComposeOptions['tone'];
  /** Callback on successful generation */
  onSuccess?: (result: ComposeResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface UseAiComposeReturn {
  /** Generate email content */
  compose: (options: ComposeOptions) => Promise<ComposeResult | undefined>;
  /** Last generated result */
  result: ComposeResult | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Reset state */
  reset: () => void;
  /** Whether composition is in progress */
  isComposing: boolean;
}

export function useAiCompose(options: UseAiComposeOptions = {}): UseAiComposeReturn {
  const { locale = 'en', defaultTone = 'professional', onSuccess, onError } = options;

  const [result, setResult] = useState<ComposeResult | null>(null);

  const mutation = useMutation({
    mutationFn: async (composeOptions: ComposeOptions) => {
      const response = await aiApi.composeEmail({
        prompt: composeOptions.prompt,
        to: composeOptions.to,
        subject: composeOptions.subject,
        tone: composeOptions.tone || defaultTone,
        locale: composeOptions.locale || locale,
      });

      if (!response.data.success) {
        throw new Error('Failed to generate email');
      }

      return {
        body: response.data.body,
        subject: response.data.subject,
      };
    },
    onSuccess: (data) => {
      setResult(data);
      onSuccess?.(data);
    },
    onError: (error: Error) => {
      onError?.(error);
    },
  });

  const compose = useCallback(
    async (composeOptions: ComposeOptions): Promise<ComposeResult | undefined> => {
      try {
        return await mutation.mutateAsync(composeOptions);
      } catch {
        return undefined;
      }
    },
    [mutation],
  );

  const reset = useCallback(() => {
    setResult(null);
    mutation.reset();
  }, [mutation]);

  return {
    compose,
    result,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset,
    isComposing: mutation.isPending,
  };
}

export default useAiCompose;
