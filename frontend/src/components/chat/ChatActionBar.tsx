'use client';

import { ActionBarPrimitive } from '@assistant-ui/react';
import { Copy, RefreshCw } from 'lucide-react';
import Box from '@mui/material/Box';
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
        <Box component={Copy} sx={{ width: 14, height: 14 }} />
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload
        className="chat-inline-action-btn"
        aria-label={t.chat.actions.reload}
      >
        <Box component={RefreshCw} sx={{ width: 14, height: 14 }} />
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}
