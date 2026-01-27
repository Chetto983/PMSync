'use client';

import React, { useEffect } from 'react';
import { Box, Typography, Paper, Chip, alpha, useTheme, Link } from '@mui/material';
import { Bot, User, Sparkles, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from './index';
import { AgentProgressIndicator } from './AgentProgressIndicator';
import { InlineActionCard, type PendingAction } from './InlineActionCard';
import { ToolActivityCard } from './ToolActivityCard';
import { multiAgentApi } from '@/lib/api/ai';
import { useAgentActivityStream } from '@/hooks/ai/use-agent-activity-stream';
import { websocketClient } from '@/lib/websocket-client';

/** Extract text content from message parts */
function getTextContent(parts: Message['parts']): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text || '')
    .join('');
}

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  /** Current conversation ID for filtering agent events */
  conversationId?: string | null;
}

/**
 * Hook to fetch ALL pending actions for a conversation.
 * Uses WebSocket subscription for real-time updates (see ChatMessages component).
 * Filters by sessionId to only show actions for this conversation.
 */
function useConversationPendingActions(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['ai', 'pendingActions', 'conversation', conversationId || ''],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await multiAgentApi.getPendingActions({ limit: 50 });
      const allActions = response.data?.actions || [];
      // Filter by sessionId (conversationId) - only show actions for this conversation
      return allActions.filter((a: PendingAction) =>
        a.sessionId === conversationId ||
        // Fallback: check if payload contains sessionId
        (a.payload as Record<string, unknown>)?.sessionId === conversationId
      );
    },
    enabled: !!conversationId,
    staleTime: 5 * 1000, // Short stale time for responsive HITL
    gcTime: 60 * 1000,
  });
}

/**
 * Component to render ALL pending actions for a conversation.
 * Shows below the last assistant message for inline HITL approval.
 * Follows AI SDK HITL pattern - actions appear in chat flow, not sidebar.
 */
function ConversationPendingActions({ conversationId }: { conversationId: string | null | undefined }) {
  const { data: actions = [] } = useConversationPendingActions(conversationId);

  // Only show PENDING actions (not approved/rejected)
  const pendingActions = actions.filter((a: PendingAction) =>
    !a.status || a.status === 'PENDING'
  );

  if (!pendingActions.length) return null;

  return (
    <Box sx={{ mt: 1 }}>
      {pendingActions.map((action: PendingAction) => (
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
  // Table components for markdown table rendering
  table: ({ children }: { children?: React.ReactNode }) => (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        mb: 2,
        fontSize: '0.85rem',
        '& th, & td': {
          border: '1px solid',
          borderColor: 'divider',
          px: 1.5,
          py: 1,
          textAlign: 'left',
        },
        '& th': {
          bgcolor: 'action.hover',
          fontWeight: 600,
        },
        '& tr:nth-of-type(even)': {
          bgcolor: 'action.hover',
        },
      }}
    >
      {children}
    </Box>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <Box component="thead">{children}</Box>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <Box component="tbody">{children}</Box>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <Box component="tr">{children}</Box>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <Box component="th">{children}</Box>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <Box component="td">{children}</Box>
  ),
  // Horizontal rule
  hr: () => (
    <Box
      component="hr"
      sx={{
        border: 'none',
        borderTop: '1px solid',
        borderColor: 'divider',
        my: 2,
      }}
    />
  ),
};

export function ChatMessages({ messages, sending, conversationId }: ChatMessagesProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  // Real-time agent activity streaming
  const { steps: agentSteps, isActive: hasAgentActivity } = useAgentActivityStream({
    sessionId: conversationId,
  });

  // WebSocket subscription for real-time HITL updates
  // Invalidates pending actions queries when actions are created/approved/rejected/executed
  useEffect(() => {
    const invalidateAllPendingActions = () => {
      // Invalidate all pending actions queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['ai', 'pendingActions'] });
    };

    const unsubCreated = websocketClient.onAiActionCreated(invalidateAllPendingActions);
    const unsubApproved = websocketClient.onAiActionApproved(invalidateAllPendingActions);
    const unsubRejected = websocketClient.onAiActionRejected(invalidateAllPendingActions);
    const unsubExecuted = websocketClient.onAiActionExecuted(invalidateAllPendingActions);
    const unsubFailed = websocketClient.onAiActionFailed(invalidateAllPendingActions);

    return () => {
      unsubCreated();
      unsubApproved();
      unsubRejected();
      unsubExecuted();
      unsubFailed();
    };
  }, [queryClient]);

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
                  {getTextContent(message.parts)}
                </Typography>
              ) : (
                <Box sx={{ '& > *:first-of-type': { mt: 0 }, '& > *:last-child': { mb: 0 } }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                    {getTextContent(message.parts)}
                  </ReactMarkdown>
                  {/* Render tool invocations inline */}
                  {message.toolInvocations?.map((tool) => (
                    <ToolActivityCard
                      key={tool.toolCallId}
                      toolName={tool.toolName}
                      args={tool.args}
                      result={tool.result}
                      state={tool.result !== undefined ? 'complete' : 'calling'}
                    />
                  ))}
                </Box>
              )}
            </Paper>

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

      {/* Conversation-wide Pending Actions - Shows ALL pending HITL actions for this conversation.
          Uses WebSocket for real-time updates (subscribed above).
          This catches any actions created during streaming that weren't mapped to specific messages. */}
      {!sending && messages.length > 0 && (
        <ConversationPendingActions conversationId={conversationId} />
      )}

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
