'use client';

/**
 * ChatInput - Chat input area component
 *
 * Extracted from AiDashboard/index.tsx to reduce file size (CHAT-04).
 * Contains the input box, quick action chips, and send/stop buttons.
 * Used by both desktop ChatArea and mobile MobileChatDialog.
 *
 * @see 07-01-PLAN.md for refactoring context
 */

import React, { Suspense, lazy, type RefObject } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Chip,
  Stack,
  Skeleton,
  IconButton,
  alpha,
  useTheme,
} from '@mui/material';
import { Send, StopCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { UIMessage } from '@/hooks/use-voltagent-chat';

// Lazy loaded input
const MentionInput = lazy(() => import('./MentionInput'));

export interface ChatInputProps {
  chatMessages: UIMessage[];
  sending: boolean;
  prompt: string;
  status: string;

  // Handlers
  onSendMessage: (customPrompt?: string) => void;
  onPromptChange: (value: string) => void;
  onStop: () => void;

  // Refs
  inputRef: RefObject<HTMLInputElement | null>;

  // Optional: hide quick actions (for mobile where space is limited)
  hideQuickActions?: boolean;
}

export function ChatInput({
  chatMessages,
  sending,
  prompt,
  status,
  onSendMessage,
  onPromptChange,
  onStop,
  inputRef,
  hideQuickActions = false,
}: ChatInputProps) {
  const theme = useTheme();
  const t = useTranslations();

  return (
    <Box
      sx={{
        p: 2,
        borderTop: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.06),
        background: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {!hideQuickActions && chatMessages.length > 0 && !sending && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
          {[
            {
              label: t.ai?.quickActions?.summarizeInbox || 'Summarize',
              prompt: t.ai?.examples?.email?.summarize || 'Summarize my unread emails',
            },
            {
              label: t.ai?.quickActions?.todaySchedule || 'Today',
              prompt: t.ai?.examples?.calendar?.todayAgenda || "What's on my agenda today?",
            },
          ].map((action, idx) => (
            <Chip
              key={idx}
              label={action.label}
              size="small"
              variant="outlined"
              onClick={() => onSendMessage(action.prompt)}
              sx={{
                fontSize: '0.75rem',
                cursor: 'pointer',
                borderColor: alpha(theme.palette.primary.main, 0.3),
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            />
          ))}
        </Stack>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
        <Suspense
          fallback={<Skeleton variant="rounded" height={56} sx={{ flex: 1, borderRadius: 3 }} />}
        >
          <MentionInput
            value={prompt}
            onChange={onPromptChange}
            onSubmit={() => onSendMessage()}
            disabled={sending}
            placeholder={
              t.ai?.mentions?.typeHint ||
              t.ai?.inputPlaceholder ||
              'Type / for commands, @ for contacts...'
            }
            inputRef={inputRef}
          />
        </Suspense>

        {/* Stop Button - Only visible during streaming */}
        {status === 'streaming' && (
          <IconButton
            onClick={onStop}
            title={t.ai?.actions?.stop || 'Stop'}
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.error.main, 0.1),
              border: '1px solid',
              borderColor: alpha(theme.palette.error.main, 0.3),
              color: 'error.main',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: alpha(theme.palette.error.main, 0.2),
                borderColor: 'error.main',
              },
            }}
          >
            <StopCircle size={24} />
          </IconButton>
        )}

        {/* Glassmorphism Send Button */}
        <Button
          variant="contained"
          onClick={() => onSendMessage()}
          disabled={sending || !prompt.trim()}
          aria-label={t.common?.send || 'Send message'}
          sx={{
            minWidth: 56,
            height: 56,
            borderRadius: 3,
            background:
              sending || !prompt.trim()
                ? alpha(theme.palette.action.disabled, 0.3)
                : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.9)} 0%, ${alpha(theme.palette.secondary.main, 0.9)} 100%)`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid',
            borderColor: alpha(theme.palette.common.white, 0.2),
            boxShadow:
              sending || !prompt.trim()
                ? 'none'
                : `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}, inset 0 1px 1px ${alpha(theme.palette.common.white, 0.2)}`,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              transform: 'translateY(-2px)',
              boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.45)}, inset 0 1px 1px ${alpha(theme.palette.common.white, 0.3)}`,
            },
            '&:active': { transform: 'translateY(0)' },
            '&.Mui-disabled': {
              background: alpha(theme.palette.action.disabled, 0.2),
              backdropFilter: 'blur(10px)',
              border: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.1),
            },
          }}
        >
          {sending ? <CircularProgress size={24} sx={{ color: 'white' }} /> : <Send size={24} />}
        </Button>
      </Box>
    </Box>
  );
}

export default ChatInput;
