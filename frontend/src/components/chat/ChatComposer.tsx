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
    <ComposerPrimitive.Root className="chat-composer">
      <ComposerPrimitive.Input
        placeholder={t.chat.composer.placeholder}
        className="chat-composer-input"
        autoFocus
      />
      <div className="chat-composer-actions">
        <ComposerPrimitive.Cancel
          className="chat-composer-btn chat-composer-btn-cancel"
          aria-label={t.chat.composer.stop}
        >
          <Square className="h-4 w-4" />
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send
          className="chat-composer-btn chat-composer-btn-send"
          aria-label={t.chat.composer.send}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
