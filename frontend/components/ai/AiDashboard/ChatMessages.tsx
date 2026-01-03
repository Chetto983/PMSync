'use client';

import React from 'react';
import { Box, Typography, Paper, Chip, alpha, useTheme, Link } from '@mui/material';
import { Bot, User, Sparkles, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import type { Message } from './index';
import { AgentProgressIndicator } from './AgentProgressIndicator';
import { InlineActionCard, type PendingAction } from './InlineActionCard';
import { multiAgentApi } from '@/lib/api/ai';
import { useAgentActivityStream } from '@/hooks/ai/use-agent-activity-stream';

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  /** Current conversation ID for filtering agent events */
  conversationId?: string | null;
}

// Hook to fetch pending actions for a message
function usePendingActionsForMessage(actionIds: string[] | undefined) {
  return useQuery({
    queryKey: ["ai", "pendingActions", "inline", actionIds?.join(",") || ""],
    queryFn: async () => {
      if (!actionIds || actionIds.length === 0) return [];
      const response = await multiAgentApi.getPendingActions({ limit: 50 });
      const allActions = response.data?.actions || [];
      return allActions.filter((a: PendingAction) => actionIds.includes(a.id));
    },
    enabled: !!actionIds && actionIds.length > 0,
    staleTime: 10 * 1000,
    refetchInterval: 5 * 1000,
  });
}

// Component to render inline actions for a message
function MessageInlineActions({ actionIds }: { actionIds: string[] }) {
  const { data: actions = [] } = usePendingActionsForMessage(actionIds);
  if (!actions.length) return null;
  return (
    <Box sx={{ mt: 1 }}>
      {actions.map((action: PendingAction) => (
        <InlineActionCard key={action.id} action={action} />
      ))}
    </Box>
  );
}

// Markdown components for styled rendering
const MarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.7, '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, mt: 2, '&:first-of-type': { mt: 0 } }}>
      {children}
    </Typography>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, mt: 1.5, '&:first-of-type': { mt: 0 } }}>
      {children}
    </Typography>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, mt: 1, '&:first-of-type': { mt: 0 } }}>
      {children}
    </Typography>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <Box component="ul" sx={{ pl: 2.5, mb: 1.5, '& li': { mb: 0.5 } }}>
      {children}
    </Box>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <Box component="ol" sx={{ pl: 2.5, mb: 1.5, '& li': { mb: 0.5 } }}>
      {children}
    </Box>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <Typography component="li" variant="body2" sx={{ lineHeight: 1.6 }}>
      {children}
    </Typography>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 500 }}>
      {children}
    </Link>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    return isInline ? (
      <Box
        component="code"
        sx={{
          bgcolor: 'action.hover',
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          fontSize: '0.85em',
          fontFamily: 'monospace',
        }}
      >
        {children}
      </Box>
    ) : (
      <Box
        component="pre"
        sx={{
          bgcolor: 'background.default',
          p: 1.5,
          borderRadius: 2,
          overflow: 'auto',
          fontSize: '0.85rem',
          fontFamily: 'monospace',
          mb: 1.5,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <code>{children}</code>
      </Box>
    );
  },
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <Box
      sx={{
        borderLeft: '3px solid',
        borderColor: 'primary.main',
        pl: 2,
        py: 0.5,
        my: 1.5,
        bgcolor: 'action.hover',
        borderRadius: '0 8px 8px 0',
      }}
    >
      {children}
    </Box>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <Box component="strong" sx={{ fontWeight: 600 }}>
      {children}
    </Box>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <Box component="em">{children}</Box>
  ),
};

export function ChatMessages({ messages, sending, conversationId }: ChatMessagesProps) {
  const theme = useTheme();

  // Real-time agent activity streaming
  const { steps: agentSteps, isActive: hasAgentActivity } = useAgentActivityStream({
    sessionId: conversationId,
  });

  // Auto-scroll to bottom ref
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages or agent activity changes
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, hasAgentActivity, agentSteps]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: '100%',
        justifyContent: messages.length <= 4 ? 'flex-end' : 'flex-start',
      }}
    >
      {messages.map((message, index) => (
        <Box
          key={index}
          sx={{
            display: 'flex',
            flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
            gap: 1.5,
            alignItems: 'flex-start',
          }}
        >
          {/* Avatar */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...(message.role === 'user'
                ? {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  color: 'primary.main',
                }
                : {
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                  color: 'white',
                }),
            }}
          >
            {message.role === 'user' ? <User size={18} /> : <Bot size={18} />}
          </Box>

          {/* Message Content */}
          <Box sx={{ flex: 1, maxWidth: { xs: '85%', sm: '80%' } }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.5, md: 2 },
                borderRadius: 3,
                ...(message.role === 'user'
                  ? {
                    bgcolor: 'primary.main',
                    color: 'white',
                    borderBottomRightRadius: 0.5,
                  }
                  : {
                    bgcolor: alpha(theme.palette.background.default, 0.8),
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.08),
                    borderBottomLeftRadius: 0.5,
                  }),
              }}
            >
              {message.role === 'user' ? (
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}
                >
                  {message.content}
                </Typography>
              ) : (
                <Box sx={{ '& > *:first-of-type': { mt: 0 }, '& > *:last-child': { mb: 0 } }}>
                  <ReactMarkdown components={MarkdownComponents}>
                    {message.content}
                  </ReactMarkdown>
                </Box>
              )}
            </Paper>

            {/* Inline Action Cards - Show below assistant messages with pending actions */}
            {message.role === 'assistant' && message.pendingActionIds && message.pendingActionIds.length > 0 && (
              <MessageInlineActions actionIds={message.pendingActionIds} />
            )}

            {/* Metadata */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 0.5,
                px: 0.5,
                flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Clock size={10} />
                {formatTime(message.timestamp)}
              </Typography>

              {message.agentUsed && (
                <Chip
                  icon={<Sparkles size={10} />}
                  label={message.agentUsed}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    '& .MuiChip-icon': { fontSize: 10 },
                  }}
                />
              )}

              {message.intent && (
                <Chip
                  label={message.intent}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
      ))}

      {/* Agent Progress Indicator - Shows live agent chain with real-time streaming */}
      <AgentProgressIndicator
        isActive={sending || hasAgentActivity}
        agentSteps={agentSteps.length > 0 ? agentSteps : undefined}
      />
      <div ref={messagesEndRef} />
    </Box>
  );
}

export default ChatMessages;
