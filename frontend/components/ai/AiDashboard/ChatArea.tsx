'use client';

/**
 * ChatArea - Chat messages and input area component
 *
 * Extracted from AiDashboard/index.tsx to reduce file size (CHAT-04).
 * Contains the scrollable messages container, error banner, and input area.
 * Used by DesktopLayout for the main chat panel.
 *
 * @see 07-01-PLAN.md for refactoring context
 */

import React, { Suspense, lazy, type RefObject } from 'react';
import { Box, Typography, Button, Skeleton, alpha, useTheme } from '@mui/material';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ChatError, ViewContext, UIMessage } from '@/hooks/use-voltagent-chat';
import { ChatInput } from './ChatInput';

// Lazy loaded components
const ChatMessages = lazy(() => import('./ChatMessages'));
const QuickActions = lazy(() => import('./QuickActions'));

function WidgetSkeleton({ height = 200 }: { height?: number }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        p: 2.5,
        height,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="50%" height={20} />
          <Skeleton width="70%" height={14} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={height - 100} sx={{ borderRadius: 2 }} />
    </Box>
  );
}

export interface ChatAreaProps {
  chatMessages: UIMessage[];
  sending: boolean;
  conversationId: string | null;
  prompt: string;
  status: string;
  lastError: ChatError | null;
  viewContext: ViewContext;
  userName: string;

  // Handlers
  onSendMessage: (customPrompt?: string) => void;
  onPromptChange: (value: string) => void;
  onRetry: () => void;
  onStop: () => void;

  // Refs
  inputRef: RefObject<HTMLInputElement | null>;
}

export function ChatArea({
  chatMessages,
  sending,
  conversationId,
  prompt,
  status,
  lastError,
  viewContext,
  userName,
  onSendMessage,
  onPromptChange,
  onRetry,
  onStop,
  inputRef,
}: ChatAreaProps) {
  const theme = useTheme();
  const t = useTranslations();

  return (
    <>
      {/* Chat Messages - Scrollable container */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          p: { xs: 2, md: 3 },
          display: 'flex',
          flexDirection: 'column',
          scrollBehavior: 'smooth',
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.text.secondary, 0.15),
            borderRadius: 4,
            '&:hover': { bgcolor: alpha(theme.palette.text.secondary, 0.25) },
          },
        }}
      >
        {chatMessages.length === 0 ? (
          <Suspense fallback={<WidgetSkeleton height={300} />}>
            <QuickActions onSelectQuery={onSendMessage} userName={userName} viewContext={viewContext} />
          </Suspense>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Suspense fallback={<WidgetSkeleton height={300} />}>
              <ChatMessages
                messages={chatMessages}
                sending={sending}
                conversationId={conversationId}
                onSuggestedQuestionSelect={onSendMessage}
              />
            </Suspense>
          </Box>
        )}
      </Box>

      {/* VOLT-01: Error Banner with Retry Button */}
      {lastError && lastError.retryable && (
        <Box
          sx={{
            mx: 2,
            mb: 1,
            p: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.warning.main, 0.1),
            border: '1px solid',
            borderColor: alpha(theme.palette.warning.main, 0.3),
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <AlertTriangle size={20} color={theme.palette.warning.main} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={600} color="warning.main">
              {lastError.code === 'CIRCUIT_OPEN'
                ? (t.ai?.errors?.circuitOpen || 'AI service temporarily unavailable')
                : lastError.code === 'RATE_LIMIT'
                  ? (t.ai?.errors?.rateLimit || 'Rate limit reached')
                  : lastError.code === 'TIMEOUT'
                    ? (t.ai?.errors?.timeout || 'Request timed out')
                    : (t.ai?.errors?.connectionLost || 'Connection error')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.errors?.retryHint || 'Please try again in a moment'}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<RefreshCw size={16} />}
            onClick={onRetry}
            disabled={sending}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            {t.ai?.chat?.retry || t.common?.retry || 'Retry'}
          </Button>
        </Box>
      )}

      {/* Input Area */}
      <ChatInput
        chatMessages={chatMessages}
        sending={sending}
        prompt={prompt}
        status={status}
        onSendMessage={onSendMessage}
        onPromptChange={onPromptChange}
        onStop={onStop}
        inputRef={inputRef}
      />
    </>
  );
}

export default ChatArea;
