'use client';

import { ActionBarPrimitive } from '@assistant-ui/react';
import { Copy, RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Action bar for assistant messages: copy to clipboard and regenerate.
 * Shows on hover via CSS opacity transition.
 */
export function ChatActionBar() {
  const t = useTranslations();

  return (
    <ActionBarPrimitive.Root className="chat-inline-actions">
      <ActionBarPrimitive.Copy
        className="chat-inline-action-btn"
        aria-label={t.chat.actions.copy}
      >
        <Copy className="h-3.5 w-3.5" />
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload
        className="chat-inline-action-btn"
        aria-label={t.chat.actions.reload}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}
