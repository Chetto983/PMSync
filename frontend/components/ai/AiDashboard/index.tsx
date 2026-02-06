'use client';

/**
 * AI Dashboard - Modern 2025 Design
 * Clean, widget-based layout following main dashboard pattern
 * With conversation session management (PostgreSQL persistence)
 *
 * Uses Vercel AI SDK useChat hook - official VoltAgent pattern
 * Based on: https://voltagent.dev/docs/ui/ai-sdk-integration/
 */

import React, { Suspense, lazy, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  Stack,
  Skeleton,
  alpha,
  useTheme,
  SwipeableDrawer,
  IconButton,
  Badge,
  useMediaQuery,
} from '@mui/material';
import { Sparkles, Send, Zap, PanelRightOpen, X, MessageSquare, StopCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAuth } from '@/lib/hooks/use-auth';
import logger from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import { useVoltAgentChat, getMessageMetadata, type ViewContext } from '@/hooks/use-voltagent-chat';

// Lazy loaded widgets
const ChatMessages = lazy(() => import('./ChatMessages'));
const QuickActions = lazy(() => import('./QuickActions'));
const LearningWidget = lazy(() => import('./LearningWidget'));
const ChatSessionList = lazy(() => import('./ChatSessionList'));
const MentionInput = lazy(() => import('./MentionInput'));
const ChatCommandPalette = lazy(() => import('../ChatCommandPalette'));
const AskUserModal = lazy(() => import('./AskUserModal'));

// Re-export types from hook for ChatMessages
export type { AskUserData, UIMessage, MessageMetadata } from '@/hooks/use-voltagent-chat';
export { getMessageMetadata, getMessageText } from '@/hooks/use-voltagent-chat';


function WidgetSkeleton({ height = 200 }: { height?: number }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
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
    </Paper>
  );
}

export function AiDashboard() {
  const { user } = useAuth();
  const t = useTranslations();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');
  const toast = useToast();

  // Pending action IDs per message (keyed by message index)

  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';

  // Mobile detection and drawer state
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [widgetsDrawerOpen, setWidgetsDrawerOpen] = useState(false);

  // Command palette state (triggered by "/" at start of input)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // AskUser modal state (for Claude Code style clarifying questions)
  const [askUserModalOpen, setAskUserModalOpen] = useState(false);

  // Track new conversations that need title generation (after first assistant response)
  const needsTitleGenRef = useRef<string | null>(null);

  // ViewContext for context-aware prompts (CHAT-02)
  // Currently hardcoded to 'ai' view; will detect from URL/router when chat is embedded elsewhere
  const viewContext: ViewContext = useMemo(() => ({
    currentView: 'ai',
  }), []);

  // AI SDK useChat hook for streaming
  const {
    messages: chatMessages,
    status,
    sendMessage,
    stop,
    conversationId,
    setConversationId,
    setMessages: setChatMessages,
    // VOLT-01: Error categorization for retry UI
    lastError,
    lastPrompt,
    clearError,
  } = useVoltAgentChat({
    locale: t.locale,
    viewContext,
    onError: (error) => {
      logger.error('[AiDashboard] Chat error:', error);
      // VOLT-01: Don't show toast for retryable errors - we show inline retry UI instead
      if (!error.message.includes('circuit') && !error.message.includes('temporarily unavailable')) {
        toast.error(t.ai?.errors?.chatFailed || 'Failed to send message. Please try again.');
      }
    },
    onConversationIdChange: (newId) => {
      // Mark new conversations for title generation (will be done after first assistant response)
      // Don't call API here - conversation doesn't exist in DB until first message exchange
      if (newId && chatMessages.length === 0) {
        needsTitleGenRef.current = newId;
      }
    },
  });

  // VOLT-01: Handle retry for failed messages
  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      clearError();
      sendMessage(lastPrompt);
    }
  }, [lastPrompt, clearError, sendMessage]);

  // Auto-generate title AFTER first assistant message arrives (conversation now exists in DB)
  // FIX: Use stable reference (length) instead of array to prevent infinite re-renders
  // See: https://github.com/vercel/ai/issues/4741
  const hasAssistantMessage = chatMessages.some(msg => msg.role === 'assistant');
  useEffect(() => {
    const convId = needsTitleGenRef.current;
    // Trigger when we have an assistant response and a pending title generation
    if (convId && hasAssistantMessage && conversationId === convId) {
      needsTitleGenRef.current = null; // Clear flag first to prevent duplicate calls

      import('@/lib/api/ai').then(({ voltAgentApi }) => {
        voltAgentApi.generateConversationTitle(convId, t.locale).then(() => {
          queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
        }).catch((err) => {
          // Log but don't show to user - title generation is non-critical
          logger.debug('[AiDashboard] Title generation failed:', err);
        });
      });
    }
  }, [hasAssistantMessage, conversationId, queryClient, t.locale]);

  const sending = status === 'submitted' || status === 'streaming';

  // Get askUser data from the last assistant message (if any)
  const lastAskUser = React.useMemo(() => {
    const lastAssistant = [...chatMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return undefined;
    return getMessageMetadata(lastAssistant).askUser;
  }, [chatMessages]);

  // Auto-open modal when there's an askUser request and not sending
  React.useEffect(() => {
    if (lastAskUser && !sending) {
      setAskUserModalOpen(true);
    }
  }, [lastAskUser, sending]);

  // Handle askUser response - send it as a new message
  const handleAskUserResponse = useCallback((response: string | string[]) => {
    const responseText = Array.isArray(response) ? response.join(', ') : response;
    setAskUserModalOpen(false);
    // Send the user's choice as a follow-up message
    sendMessage(responseText);
  }, [sendMessage]);

  // Start a new chat session
  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setConversationId(`conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPrompt('');
  }, [setChatMessages, setConversationId]);

  // Load an existing conversation
  const handleSelectConversation = useCallback(async (id: string | null) => {
    if (!id) {
      handleNewChat();
      return;
    }

    // IMPORTANT: Set conversationId FIRST, then wait for React to process
    // This ensures useChat hook reinitializes with the new ID before we load messages
    setConversationId(id);

    try {
      const { voltAgentApi } = await import('@/lib/api/ai');
      const conversationRes = await voltAgentApi.getConversation(id);

      if (conversationRes.data?.conversation) {
        const conv = conversationRes.data.conversation;

        // Map messages
        const filteredMessages = conv.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant');

        // Dedupe and set messages for AI SDK hook (UIMessage format with parts)
        const seenContent = new Set<string>();
        const dedupedMessages = filteredMessages
          .filter((m) => {
            const key = `${m.role}:${m.content.slice(0, 200)}`;
            if (seenContent.has(key)) {
              logger.warn(`[AiDashboard] Duplicate message filtered: ${key.slice(0, 50)}`);
              return false;
            }
            seenContent.add(key);
            return true;
          })
          .map((m, idx) => ({
            id: `msg-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            role: m.role as 'user' | 'assistant',
            // AI SDK v6 UIMessage format requires parts array, not content
            parts: [{ type: 'text' as const, text: m.content }],
          }));

        // Use setTimeout(0) to ensure useChat hook has reinitialized with new conversationId
        // This fixes the "click twice to load" issue - React needs a render cycle to reinitialize useChat
        setTimeout(() => {
          setChatMessages(dedupedMessages);
        }, 0);
      }
    } catch {
      handleNewChat();
    }
  }, [handleNewChat, setConversationId, setChatMessages]);

  // Send message using AI SDK streaming
  const handleSendMessage = useCallback(async (customPrompt?: string) => {
    const text = customPrompt || prompt.trim();
    if (!text || sending) return;

    setPrompt('');

    try {
      await sendMessage(text);

      // Refresh pending actions after message completes
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    } catch (error) {
      logger.error(`[AiDashboard] Send error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      inputRef.current?.focus();
    }
  }, [prompt, sending, sendMessage, queryClient]);

  // Handle prompt changes - detect "/" to open command palette
  const handlePromptChange = useCallback((value: string) => {
    if (value === '/' && prompt === '') {
      setCommandPaletteOpen(true);
      return;
    }
    setPrompt(value);
  }, [prompt]);

  // Handle command selection from palette
  const handleCommandSelect = useCallback((commandPrompt: string) => {
    setPrompt(commandPrompt);
    setCommandPaletteOpen(false);
    inputRef.current?.focus();
  }, []);

  return (
    <Box
      sx={{
        maxWidth: 1800,
        mx: 'auto',
        px: { xs: 1.5, sm: 2, md: 4 },
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // Prevent page scroll
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <Box sx={{ pt: { xs: 2, md: 3 }, pb: { xs: 3, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: { xs: 40, md: 56 },
              height: { xs: 40, md: 56 },
              borderRadius: 2.5,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}`,
              flexShrink: 0,
            }}
          >
            <Sparkles size={isMobile ? 20 : 24} color="white" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="h4"
              noWrap
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.25rem', md: '2rem' },
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {t.ai?.title || 'Assistente AI'}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.75rem', md: '0.875rem' } }}>
              {t.ai?.subtitle || 'Email • Calendario • Contatti'}
            </Typography>
          </Box>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip
              icon={<Zap size={14} />}
              label={t.ai?.online || 'Online'}
              size="small"
              color="success"
              sx={{ fontWeight: 600 }}
            />
            {/* Mobile widgets drawer toggle */}
            {isMobile && (
              <IconButton
                onClick={() => setWidgetsDrawerOpen(true)}
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  borderRadius: 2,
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <Badge
                  badgeContent={chatMessages.length > 0 ? undefined : 0}
                  color="primary"
                  variant="dot"
                  invisible={chatMessages.length === 0}
                >
                  <PanelRightOpen size={20} />
                </Badge>
              </IconButton>
            )}
          </Box>
        </Box>
      </Box>

      {/* Main Grid - Responsive layout with fixed height */}
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: {
            xs: '1fr',
            md: '1fr',
            lg: '1fr minmax(300px, 380px)',
          },
          flex: 1,
          minHeight: 0, // Critical for flexbox overflow
          pb: 2,
        }}
      >
        {/* Chat Area - Fixed height with internal scroll */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            border: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.08),
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%', // Fill grid cell
            minHeight: 0, // Allow flex to shrink
          }}
        >
          {/* Chat Messages - Scrollable container */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0, // Critical: allows flex child to shrink and enable overflow
              overflow: 'auto',
              p: { xs: 2, md: 3 },
              display: 'flex',
              flexDirection: 'column',
              // Smooth scroll behavior
              scrollBehavior: 'smooth',
              '&::-webkit-scrollbar': {
                width: 8,
              },
              '&::-webkit-scrollbar-track': {
                bgcolor: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: alpha(theme.palette.text.secondary, 0.15),
                borderRadius: 4,
                '&:hover': {
                  bgcolor: alpha(theme.palette.text.secondary, 0.25),
                },
              },
            }}
          >
            {chatMessages.length === 0 ? (
              <Suspense fallback={<WidgetSkeleton height={300} />}>
                <QuickActions onSelectQuery={handleSendMessage} userName={userName} viewContext={viewContext} />
              </Suspense>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Suspense fallback={<WidgetSkeleton height={300} />}>
                  <ChatMessages
                    messages={chatMessages}
                    sending={sending}
                    conversationId={conversationId}
                    onSuggestedQuestionSelect={handleSendMessage}
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
                    ? 'AI service temporarily unavailable'
                    : lastError.code === 'RATE_LIMIT'
                    ? (t.ai?.errors?.rateLimit || 'Rate limit reached')
                    : lastError.code === 'TIMEOUT'
                    ? 'Request timed out'
                    : (t.ai?.errors?.connectionLost || 'Connection error')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Please try again in a moment
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<RefreshCw size={16} />}
                onClick={handleRetry}
                disabled={sending}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Retry
              </Button>
            </Box>
          )}

          {/* Input Area - 2025 Glassmorphism Design */}
          <Box
            sx={{
              p: 2,
              borderTop: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.06),
              // Glassmorphism background - aligned with global standard
              background: alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {chatMessages.length > 0 && !sending && (
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
                {[
                  { label: t.ai?.quickActions?.summarizeInbox || 'Riepiloga', prompt: 'Riepiloga le mie email non lette' },
                  { label: t.ai?.quickActions?.todaySchedule || 'Oggi', prompt: 'Cosa ho in agenda oggi?' },
                ].map((action, idx) => (
                  <Chip
                    key={idx}
                    label={action.label}
                    size="small"
                    variant="outlined"
                    onClick={() => handleSendMessage(action.prompt)}
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
              {/* Superhuman-style MentionInput with @ for contacts and # for providers */}
              <Suspense fallback={<Skeleton variant="rounded" height={56} sx={{ flex: 1, borderRadius: 3 }} />}>
                <MentionInput
                  value={prompt}
                  onChange={handlePromptChange}
                  onSubmit={() => handleSendMessage()}
                  disabled={sending}
                  placeholder={t.ai?.mentions?.typeHint || t.ai?.inputPlaceholder || 'Type / for commands, @ for contacts...'}
                  inputRef={inputRef}
                />
              </Suspense>
              {/* Stop Button - Only visible during streaming */}
              {status === 'streaming' && (
                <IconButton
                  onClick={stop}
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
                onClick={() => handleSendMessage()}
                disabled={sending || !prompt.trim()}
                sx={{
                  minWidth: 56,
                  height: 56,
                  borderRadius: 3,
                  // Glassmorphism effect
                  background: sending || !prompt.trim()
                    ? alpha(theme.palette.action.disabled, 0.3)
                    : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.9)} 0%, ${alpha(theme.palette.secondary.main, 0.9)} 100%)`,
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid',
                  borderColor: alpha(theme.palette.common.white, 0.2),
                  boxShadow: sending || !prompt.trim()
                    ? 'none'
                    : `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}, inset 0 1px 1px ${alpha(theme.palette.common.white, 0.2)}`,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                    transform: 'translateY(-2px)',
                    boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.45)}, inset 0 1px 1px ${alpha(theme.palette.common.white, 0.3)}`,
                  },
                  '&:active': {
                    transform: 'translateY(0)',
                  },
                  '&.Mui-disabled': {
                    background: alpha(theme.palette.action.disabled, 0.2),
                    backdropFilter: 'blur(10px)',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.1),
                  },
                }}
              >
                {sending ? (
                  <CircularProgress size={24} sx={{ color: 'white' }} />
                ) : (
                  <Send size={24} />
                )}
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Sidebar Widgets - Hidden on mobile, visible on desktop */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            gap: 2,
            height: '100%', // Fill grid cell height
            overflow: 'auto',
            minHeight: 0, // Critical for flex overflow
            pb: 2, // Padding at bottom for scroll
            '&::-webkit-scrollbar': {
              width: 6,
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha(theme.palette.text.secondary, 0.1),
              borderRadius: 3,
            },
          }}
        >
          {/* Chat Sessions - Primary widget, always visible */}
          <Suspense fallback={<WidgetSkeleton height={200} />}>
            <ChatSessionList
              activeConversationId={conversationId}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
            />
          </Suspense>

          {/* Collapsible widgets - compact when collapsed */}
          {/* PendingActionsWidget removed - now inline in chat messages */}

          <Suspense fallback={<WidgetSkeleton height={60} />}>
            <LearningWidget />
          </Suspense>
        </Box>
      </Box>

      {/* Mobile Widgets Drawer */}
      <SwipeableDrawer
        anchor="right"
        open={widgetsDrawerOpen}
        onClose={() => setWidgetsDrawerOpen(false)}
        onOpen={() => setWidgetsDrawerOpen(true)}
        disableSwipeToOpen={false}
        swipeAreaWidth={20}
        ModalProps={{
          keepMounted: true, // Better mobile performance
        }}
        PaperProps={{
          sx: {
            width: { xs: '85vw', sm: 380 },
            maxWidth: 400,
            bgcolor: 'background.default',
            borderTopLeftRadius: 24,
            borderBottomLeftRadius: 24,
          },
        }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.1),
            position: 'sticky',
            top: 0,
            bgcolor: 'background.default',
            zIndex: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <MessageSquare size={20} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t.ai?.widgets?.title || 'AI Tools'}
            </Typography>
          </Box>
          <IconButton
            onClick={() => setWidgetsDrawerOpen(false)}
            sx={{
              bgcolor: alpha(theme.palette.action.active, 0.08),
              borderRadius: 2,
            }}
          >
            <X size={20} />
          </IconButton>
        </Box>

        {/* Drawer Content */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflow: 'auto',
            flex: 1,
          }}
        >
          {/* Chat Sessions */}
          <Suspense fallback={<WidgetSkeleton height={200} />}>
            <ChatSessionList
              activeConversationId={conversationId}
              onSelectConversation={(id) => {
                handleSelectConversation(id);
                setWidgetsDrawerOpen(false);
              }}
              onNewChat={() => {
                handleNewChat();
                setWidgetsDrawerOpen(false);
              }}
            />
          </Suspense>

          {/* Pending Actions - now inline in chat, no sidebar widget */}

          {/* Learning Widget */}
          <Suspense fallback={<WidgetSkeleton height={60} />}>
            <LearningWidget />
          </Suspense>
        </Box>
      </SwipeableDrawer>

      {/* Command Palette - Quick commands via "/" */}
      <Suspense fallback={null}>
        <ChatCommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onSelectCommand={handleCommandSelect}
        />
      </Suspense>

      {/* AskUser Modal - Claude Code style clarifying questions */}
      <Suspense fallback={null}>
        <AskUserModal
          open={askUserModalOpen}
          data={lastAskUser || null}
          onSubmit={handleAskUserResponse}
          onClose={() => setAskUserModalOpen(false)}
        />
      </Suspense>

      {/* Toast notifications */}
      <toast.ToastContainer />
    </Box>
  );
}

export default AiDashboard;
