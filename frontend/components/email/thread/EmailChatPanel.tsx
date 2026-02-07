'use client';

/**
 * EmailChatPanel - Slide-in Chat Panel for Email Threads
 *
 * A slide-in panel that provides AI chat functionality within email thread context.
 * Reuses ChatMessages from AiDashboard and useVoltAgentChat hook.
 *
 * @see 06-02-PLAN Task 2
 */

import React, { Suspense, lazy, useState, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slide,
  IconButton,
  Button,
  CircularProgress,
  alpha,
  useTheme,
  useMediaQuery,
  Skeleton,
} from '@mui/material';
import { X, Send, Mail, StopCircle, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useVoltAgentChat, type ViewContext } from '@/hooks/use-voltagent-chat';

// Lazy load chat components
const ChatMessages = lazy(() => import('@/components/ai/AiDashboard/ChatMessages'));

interface EmailChatPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** ID of the email being viewed */
  emailId: string;
  /** Subject of the email for context display */
  emailSubject: string;
  /** Sender of the email for context display */
  emailFrom: string;
  /** Thread ID for the conversation context */
  threadId: string;
}

/**
 * Skeleton loader for chat content
 */
function ChatSkeleton() {
  const theme = useTheme();
  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: 2 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="80%" height={16} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton
        variant="rounded"
        height={100}
        sx={{ borderRadius: 3, bgcolor: alpha(theme.palette.divider, 0.1) }}
      />
    </Box>
  );
}

/**
 * Quick actions for email context - simplified version for panel
 */
function EmailQuickActions({ onSelect }: { onSelect: (prompt: string) => void }) {
  const theme = useTheme();
  const t = useTranslations();

  const actions = [
    {
      label: t.ai?.quickActions?.summarizeInbox || 'Summarize',
      prompt: 'Summarize this email thread for me',
    },
    {
      label: t.ai?.emailChat?.draftReply || 'Draft reply',
      prompt: 'Draft a professional reply to this email',
    },
    {
      label: t.ai?.emailChat?.keyPoints || 'Key points',
      prompt: 'What are the key points and action items in this email?',
    },
  ];

  return (
    <Box sx={{ py: 3, px: 2, textAlign: 'center' }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 2,
        }}
      >
        <Sparkles size={24} color="white" />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t.ai?.emailChat?.noMessages || 'Ask me anything about this email'}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {actions.map((action, idx) => (
          <Button
            key={idx}
            variant="outlined"
            size="small"
            onClick={() => onSelect(action.prompt)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
              borderColor: alpha(theme.palette.divider, 0.2),
              '&:hover': {
                borderColor: theme.palette.primary.main,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Email chat panel with slide-in animation.
 * Provides AI chat functionality within email thread context.
 */
export function EmailChatPanel({
  open,
  onClose,
  emailId,
  emailSubject,
  emailFrom,
  threadId,
}: EmailChatPanelProps) {
  const theme = useTheme();
  const t = useTranslations();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');

  // ViewContext for thread mode (CHAT-02)
  const viewContext: ViewContext = useMemo(
    () => ({
      currentView: 'thread',
      selectedEmailId: emailId,
      selectedFolderId: undefined,
      selectedContactId: undefined,
    }),
    [emailId]
  );

  // AI SDK useChat hook with thread context
  const {
    messages: chatMessages,
    status,
    sendMessage,
    stop,
    lastError,
    lastPrompt,
    clearError,
  } = useVoltAgentChat({
    initialConversationId: `thread-${threadId}`,
    locale: t.locale,
    viewContext,
    onError: (error) => {
      console.error('[EmailChatPanel] Chat error:', error);
    },
  });

  const sending = status === 'submitted' || status === 'streaming';

  // Handle retry for failed messages
  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      clearError();
      sendMessage(lastPrompt);
    }
  }, [lastPrompt, clearError, sendMessage]);

  // Send message handler
  const handleSendMessage = useCallback(
    async (customPrompt?: string) => {
      const text = customPrompt || prompt.trim();
      if (!text || sending) return;

      setPrompt('');
      try {
        await sendMessage(text);
      } catch (error) {
        console.error('[EmailChatPanel] Send error:', error);
      } finally {
        inputRef.current?.focus();
      }
    },
    [prompt, sending, sendMessage]
  );

  // Handle Enter key to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  // Panel width: full on mobile, 380px on desktop
  const panelWidth = isMobile ? '100vw' : 380;

  return (
    <Slide direction="left" in={open} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          maxWidth: '100vw',
          zIndex: 1250, // Above FAB (1200), below dialogs (1300)
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          borderLeft: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
          bgcolor: 'background.paper',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.1),
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexShrink: 0,
            // Safe area for iOS notch
            pt: { xs: `calc(8px + env(safe-area-inset-top, 0px))`, md: 2 },
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={20} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {t.ai?.emailChat?.panelTitle || 'AI Assistant'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
              <Mail size={12} color={theme.palette.text.secondary} />
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ maxWidth: isMobile ? 200 : 250 }}
                title={emailSubject}
              >
                {emailSubject || t.common?.noSubject || 'No subject'}
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label={t.ai?.emailChat?.close || 'Close assistant'}
            sx={{
              bgcolor: alpha(theme.palette.action.active, 0.08),
              borderRadius: 2,
              '&:hover': { bgcolor: alpha(theme.palette.action.active, 0.16) },
            }}
          >
            <X size={18} />
          </IconButton>
        </Box>

        {/* Email Context Banner */}
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.06),
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {t.ai?.emailChat?.contextLabel || 'Regarding:'}{' '}
            <Typography
              component="span"
              variant="caption"
              sx={{ fontWeight: 600, color: 'text.primary' }}
            >
              {emailFrom || t.common?.unnamedContact || 'Unknown sender'}
            </Typography>
          </Typography>
        </Box>

        {/* Chat Content - Scrollable */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            scrollBehavior: 'smooth',
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha(theme.palette.text.secondary, 0.15),
              borderRadius: 3,
            },
          }}
        >
          {chatMessages.length === 0 ? (
            <EmailQuickActions onSelect={handleSendMessage} />
          ) : (
            <Suspense fallback={<ChatSkeleton />}>
              <ChatMessages
                messages={chatMessages}
                sending={sending}
                conversationId={`thread-${threadId}`}
                onSuggestedQuestionSelect={handleSendMessage}
              />
            </Suspense>
          )}
        </Box>

        {/* Error Banner */}
        {lastError && lastError.retryable && (
          <Box
            sx={{
              mx: 2,
              mb: 1,
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              border: '1px solid',
              borderColor: alpha(theme.palette.warning.main, 0.3),
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} color={theme.palette.warning.main} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" fontWeight={600} color="warning.main">
                {lastError.code === 'CIRCUIT_OPEN'
                  ? t.ai?.errors?.circuitOpen || 'AI service temporarily unavailable'
                  : lastError.code === 'RATE_LIMIT'
                    ? t.ai?.errors?.rateLimit || 'Rate limit reached'
                    : t.ai?.errors?.connectionLost || 'Connection error'}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="text"
              color="warning"
              startIcon={<RefreshCw size={14} />}
              onClick={handleRetry}
              disabled={sending}
              sx={{ textTransform: 'none', fontWeight: 600, minWidth: 0, px: 1 }}
            >
              {t.common?.retry || 'Retry'}
            </Button>
          </Box>
        )}

        {/* Input Area */}
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.1),
            background: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(8px)',
            flexShrink: 0,
            // Safe area for iOS home indicator
            pb: { xs: `calc(8px + env(safe-area-inset-bottom, 0px))`, md: 2 },
          }}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <Box
              component="input"
              ref={inputRef}
              value={prompt}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder={t.ai?.emailChat?.inputPlaceholder || 'Ask about this email...'}
              sx={{
                flex: 1,
                height: 44,
                px: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.2),
                borderRadius: 2.5,
                fontSize: '0.875rem',
                bgcolor: alpha(theme.palette.background.default, 0.5),
                color: 'text.primary',
                outline: 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                '&:focus': {
                  borderColor: theme.palette.primary.main,
                  boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
                },
                '&:disabled': {
                  opacity: 0.6,
                  cursor: 'not-allowed',
                },
                '&::placeholder': {
                  color: theme.palette.text.secondary,
                  opacity: 0.7,
                },
              }}
            />
            {status === 'streaming' && (
              <IconButton
                onClick={stop}
                title={t.ai?.actions?.stop || 'Stop'}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  bgcolor: alpha(theme.palette.error.main, 0.1),
                  color: 'error.main',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.error.main, 0.2),
                  },
                }}
              >
                <StopCircle size={20} />
              </IconButton>
            )}
            <Button
              variant="contained"
              onClick={() => handleSendMessage()}
              disabled={sending || !prompt.trim()}
              sx={{
                minWidth: 44,
                width: 44,
                height: 44,
                borderRadius: 2.5,
                p: 0,
              }}
            >
              {sending ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <Send size={20} />}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Slide>
  );
}

export default EmailChatPanel;
