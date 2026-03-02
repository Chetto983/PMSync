'use client';

import { ComposerPrimitive } from '@assistant-ui/react';
import { Send, Square } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Chat composer with input field, send button, and cancel (stop streaming) button.
 * Uses ComposerPrimitive from assistant-ui for full runtime integration.
 */
export function ChatComposer() {
  const t = useTranslations();

  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 p-3 border-t border-border bg-background">
      <ComposerPrimitive.Input
        placeholder={t.chat.composer.placeholder}
        className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[40px] max-h-[120px]"
        autoFocus
      />
      <ComposerPrimitive.Cancel
        className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
        aria-label={t.chat.composer.stop}
      >
        <Square className="h-4 w-4" />
      </ComposerPrimitive.Cancel>
      <ComposerPrimitive.Send
        className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={t.chat.composer.send}
      >
        <Send className="h-4 w-4" />
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
