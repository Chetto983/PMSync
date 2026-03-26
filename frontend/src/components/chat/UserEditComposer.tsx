'use client';

import { ComposerPrimitive, MessagePrimitive } from '@assistant-ui/react';
import { Check, X } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Inline edit composer rendered in-place for user messages.
 * Reuses the main composer styling, constrained to the user bubble width.
 */
export function UserEditComposer() {
  const t = useTranslations();
  const cancelLabel = t.common?.cancel || 'Cancel';
  const saveLabel = t.common?.save || 'Save';

  return (
    <MessagePrimitive.Root className="chat-message-row chat-message-user">
      <ComposerPrimitive.Root className="chat-composer chat-user-edit-form">
        <ComposerPrimitive.Input
          placeholder={t.chat.composer.placeholder}
          className="chat-composer-input chat-user-edit-input"
          aria-label={t.chat.actions.edit}
          autoFocus
        />
        <div className="chat-composer-actions chat-user-edit-actions">
          <ComposerPrimitive.Cancel
            className="chat-composer-btn chat-user-edit-btn-cancel"
            aria-label={cancelLabel}
          >
            <Box component={X} sx={{ width: 16, height: 16 }} strokeWidth={2.5} />
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send
            className="chat-composer-btn chat-composer-btn-send"
            aria-label={saveLabel}
          >
            <Box component={Check} sx={{ width: 16, height: 16 }} strokeWidth={2.5} />
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
