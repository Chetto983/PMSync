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
    <ActionBarPrimitive.Root className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <ActionBarPrimitive.Copy
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t.chat.actions.copy}
      >
        <Copy className="h-3.5 w-3.5" />
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={t.chat.actions.reload}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}
