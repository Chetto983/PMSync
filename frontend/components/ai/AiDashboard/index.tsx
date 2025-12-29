'use client';

/**
 * AI Dashboard - Modern 2025 Design
 * Clean, widget-based layout following main dashboard pattern
 * With conversation session management (PostgreSQL persistence)
 */

import React, { Suspense, lazy, useState, useRef, useCallback } from 'react';
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
import { Sparkles, Send, Zap, PanelRightOpen, X, MessageSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAuth } from '@/lib/hooks/use-auth';

// Lazy loaded widgets
const ChatMessages = lazy(() => import('./ChatMessages'));
const QuickActions = lazy(() => import('./QuickActions'));
const LearningWidget = lazy(() => import('./LearningWidget'));
const AiMemoryWidget = lazy(() => import('./AiMemoryWidget'));
const ChatSessionList = lazy(() => import('./ChatSessionList'));
const MentionInput = lazy(() => import('./MentionInput'));

// Types
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agentUsed?: string;
  intent?: string;
  pendingActionIds?: string[];
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';

  // Mobile detection and drawer state
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [widgetsDrawerOpen, setWidgetsDrawerOpen] = useState(false);

  // Start a new chat session
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setPrompt('');
  }, []);

  // Load an existing conversation
  const handleSelectConversation = useCallback(async (id: string | null) => {
    if (!id) {
      handleNewChat();
      return;
    }

    try {
      const { voltAgentApi, multiAgentApi } = await import('@/lib/api/ai');

      // Fetch conversation and pending actions in parallel
      const [conversationRes, pendingActionsRes] = await Promise.all([
        voltAgentApi.getConversation(id),
        multiAgentApi.getPendingActions({ limit: 50 }),
      ]);

      if (conversationRes.data?.conversation) {
        const conv = conversationRes.data.conversation;
        setConversationId(conv.id);

        // Filter pending actions for this conversation (by sessionId)
        // Include actions with matching sessionId, or actions with undefined sessionId (legacy compat)
        const allPendingActions = pendingActionsRes.data?.actions || [];
        const conversationActions = allPendingActions.filter(
          (a) => a.sessionId === conv.id || (!a.sessionId && allPendingActions.length === 1)
        );

        // Map messages
        const filteredMessages = conv.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant');

        // Match pending actions to assistant messages by timestamp
        // For each action, find the assistant message with the closest timestamp (before the action)
        const messageActionMap = new Map<number, string[]>();

        for (const action of conversationActions) {
          const actionTime = new Date(action.suspendedAt).getTime();
          let bestMatchIndex = -1;
          let bestTimeDiff = Infinity;

          // Find the assistant message closest to (and before) the action creation time
          for (let i = 0; i < filteredMessages.length; i++) {
            const msg = filteredMessages[i];
            if (msg.role !== 'assistant') continue;

            const msgTime = new Date(msg.createdAt || 0).getTime();
            const timeDiff = actionTime - msgTime;

            // Message must be before or very close to the action (within 30 seconds)
            if (timeDiff >= -30000 && timeDiff < bestTimeDiff) {
              bestTimeDiff = timeDiff;
              bestMatchIndex = i;
            }
          }

          // Attach action to the best matching message (or last assistant if no match)
          if (bestMatchIndex >= 0) {
            const existing = messageActionMap.get(bestMatchIndex) || [];
            existing.push(action.id);
            messageActionMap.set(bestMatchIndex, existing);
          }
        }

        // If we have unmatched actions, attach them to the last assistant message
        if (conversationActions.length > 0 && messageActionMap.size === 0) {
          for (let i = filteredMessages.length - 1; i >= 0; i--) {
            if (filteredMessages[i].role === 'assistant') {
              messageActionMap.set(i, conversationActions.map(a => a.id));
              break;
            }
          }
        }

        setMessages(
          filteredMessages.map((m, index) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.createdAt || Date.now()),
            pendingActionIds: messageActionMap.get(index),
          }))
        );
      }
    } catch {
      // Ignore errors, just start fresh
      handleNewChat();
    }
  }, [handleNewChat]);

  const handleSendMessage = useCallback(async (customPrompt?: string) => {
    const text = customPrompt || prompt.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const currentMessageCount = messages.length;
    setMessages(prev => [...prev, userMessage]);
    setPrompt('');
    setSending(true);

    try {
      // Dynamic import to avoid circular deps
      const { multiAgentApi, voltAgentApi } = await import('@/lib/api/ai');
      const response = await multiAgentApi.processMessage({
        message: text,
        locale: t.locale,
        conversationId: conversationId || undefined,
      });

      // If we got a new conversationId from the response, store it
      if (response.conversationId && !conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.messages?.join('\n') || response.text || t.ai?.chat?.error || 'No response',
        timestamp: new Date(),
        agentUsed: response.agentUsed,
        intent: response.intent?.intent,
        pendingActionIds: response.pendingActionIds || [],
      };

      setMessages(prev => [...prev, assistantMessage]);
      // Refresh pending actions if new actions were created
      if (response.pendingActionIds?.length) {
        queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
      }

      // Auto-generate title after first exchange (2 messages: user + assistant)
      const newConvId = response.conversationId || conversationId;
      if (newConvId && currentMessageCount === 0) {
        try {
          await voltAgentApi.generateConversationTitle(newConvId, t.locale);
          queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
        } catch {
          // Ignore title generation errors
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t.ai?.chat?.error || 'Si è verificato un errore. Riprova.',
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [prompt, sending, t, conversationId, messages.length, queryClient]);

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
                  badgeContent={messages.length > 0 ? undefined : 0}
                  color="primary"
                  variant="dot"
                  invisible={messages.length === 0}
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
            {messages.length === 0 ? (
              <Suspense fallback={<WidgetSkeleton height={300} />}>
                <QuickActions onSelectQuery={handleSendMessage} userName={userName} />
              </Suspense>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Suspense fallback={<WidgetSkeleton height={300} />}>
                  <ChatMessages messages={messages} sending={sending} conversationId={conversationId} />
                </Suspense>
              </Box>
            )}
          </Box>

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
            {messages.length > 0 && !sending && (
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
                  onChange={setPrompt}
                  onSubmit={() => handleSendMessage()}
                  disabled={sending}
                  placeholder={t.ai?.mentions?.typeHint || t.ai?.inputPlaceholder || 'Type @ for contacts, # for accounts...'}
                  inputRef={inputRef}
                />
              </Suspense>
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

          <Suspense fallback={<WidgetSkeleton height={60} />}>
            <AiMemoryWidget />
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

          {/* AI Memory */}
          <Suspense fallback={<WidgetSkeleton height={60} />}>
            <AiMemoryWidget />
          </Suspense>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
}

export default AiDashboard;
