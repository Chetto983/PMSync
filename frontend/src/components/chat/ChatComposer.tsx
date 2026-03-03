'use client';

import { ComposerPrimitive } from '@assistant-ui/react';
import { ArrowUp, Square } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Floating composer card: textarea with send/cancel buttons.
 * Rounded container with subtle shadow, send button inside.
 */
export function ChatComposer() {
  const t = useTranslations();

  return (
    <ComposerPrimitive.Root className="mx-3 mb-3 rounded-xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:shadow-[0_2px_12px_hsl(var(--primary)/0.06)]">
      <ComposerPrimitive.Input
        placeholder={t.chat.composer.placeholder}
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground min-h-[44px] max-h-40 border-none outline-none"
        autoFocus
      />
      <div className="flex items-center justify-end gap-1 px-2.5 pb-2.5">
        <ComposerPrimitive.Cancel
          className="inline-flex items-center justify-center size-8 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
          aria-label={t.chat.composer.stop}
        >
          <Square className="h-4 w-4" />
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send
          className="inline-flex items-center justify-center size-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={t.chat.composer.send}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
