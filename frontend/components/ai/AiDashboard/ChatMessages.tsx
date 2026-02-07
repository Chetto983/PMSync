'use client';

import React, { useEffect } from 'react';
import { Box, Typography, Paper, alpha, useTheme, IconButton, Tooltip } from '@mui/material';
import { Bot, User, Copy, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type UIMessage, getMessageMetadata, getMessageText } from '@/hooks/use-voltagent-chat';
import { TypingIndicator } from './TypingIndicator';
import { InlineActionCard, type PendingAction } from './InlineActionCard';
import { multiAgentApi } from '@/lib/api/ai';
import { useAgentActivityStream } from '@/hooks/ai/use-agent-activity-stream';
import { websocketClient } from '@/lib/websocket-client';
// ai-elements components (shadcn-based) - located in src/components/ai-elements
import { MessageResponse } from '@/src/components/ai-elements/message';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/src/components/ai-elements/tool';
import type { ToolPart } from '@/src/components/ai-elements/tool';
import { Suggestions, Suggestion } from '@/src/components/ai-elements/suggestion';

interface ChatMessagesProps {
  messages: UIMessage[];
  sending: boolean;
  /** Current conversation ID for filtering agent events */
  conversationId?: string | null;
  /** Callback when user clicks a suggested question */
  onSuggestedQuestionSelect?: (question: string) => void;
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

export function ChatMessages({ messages, sending, conversationId, onSuggestedQuestionSelect }: ChatMessagesProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  // Copy to clipboard state
  const [copiedMessageId, setCopiedMessageId] = React.useState<string | null>(null);

  // Copy message content to clipboard
  const handleCopy = React.useCallback(async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch  { }
  }, []);

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

  // Scroll to bottom whenever messages count or agent activity changes
  // FIX: Use messages.length instead of messages array to prevent infinite re-renders
  // See: https://github.com/vercel/ai/issues/4741
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending, hasAgentActivity, agentSteps.length]);

  // DEBUG: Log message structure to understand VoltAgent format
  React.useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      console.log('[ChatMessages DEBUG] Last message:', {
        role: lastMsg.role,
        id: lastMsg.id,
        partsCount: lastMsg.parts?.length,
        parts: lastMsg.parts?.map((p, i) => ({
          index: i,
          type: p.type,
          keys: Object.keys(p),
          // Safe stringify for debugging
          preview: JSON.stringify(p).slice(0, 200),
        })),
        rawMessage: lastMsg,
      });
    }
  }, [messages.length]);

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
                  {getMessageText(message)}
                </Typography>
              ) : (
                <Box sx={{ '& > *:first-of-type': { mt: 0 }, '& > *:last-child': { mb: 0 } }}>
                  {/* Native AI SDK pattern: iterate through message.parts */}
                  {message.parts.map((part, partIndex) => {
                    // Text parts -> MessageResponse (uses Streamdown)
                    if (part.type === 'text') {
                      return <MessageResponse key={partIndex}>{part.text}</MessageResponse>;
                    }
                    // AI SDK v4: 'tool-invocation' type with args/result structure
                    if (part.type === 'tool-invocation') {
                      const invocation = part as unknown as {
                        type: 'tool-invocation';
                        toolInvocationId: string;
                        toolName: string;
                        args: unknown;
                        state: 'call' | 'partial-call' | 'result';
                        result?: unknown;
                      };
                      // Map AI SDK state to ai-elements state
                      const mappedState = invocation.state === 'result' ? 'output-available'
                        : invocation.state === 'partial-call' ? 'input-streaming'
                        : 'input-available';
                      return (
                        <Tool key={invocation.toolInvocationId} defaultOpen={false}>
                          <ToolHeader
                            type="dynamic-tool"
                            state={mappedState}
                            toolName={invocation.toolName}
                          />
                          <ToolContent>
                            <ToolInput input={invocation.args} />
                            <ToolOutput output={invocation.result} errorText={undefined} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    // Legacy: tool-{name} parts from ai-elements
                    if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                      const toolPart = part as ToolPart;
                      const isDynamic = toolPart.type === 'dynamic-tool';
                      return (
                        <Tool key={toolPart.toolCallId} defaultOpen={false}>
                          {isDynamic ? (
                            <ToolHeader
                              type="dynamic-tool"
                              state={toolPart.state}
                              toolName={(toolPart as { toolName: string }).toolName}
                            />
                          ) : (
                            <ToolHeader
                              type={toolPart.type as `tool-${string}`}
                              state={toolPart.state}
                            />
                          )}
                          <ToolContent>
                            <ToolInput input={toolPart.input} />
                            <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    // Other part types (reasoning, sources, etc.) - skip for now
                    return null;
                  })}
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
              {/* Copy button for assistant messages */}
              {message.role === 'assistant' && (
                <Tooltip title={copiedMessageId === `msg-${index}` ? 'Copied!' : 'Copy'}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(getMessageText(message), `msg-${index}`)}
                    sx={{
                      width: 22,
                      height: 22,
                      color: copiedMessageId === `msg-${index}` ? 'success.main' : 'text.secondary',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                      },
                    }}
                  >
                    {copiedMessageId === `msg-${index}` ? <Check size={12} /> : <Copy size={12} />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            {/* Suggested follow-up questions using ai-elements Suggestions */}
            {(() => {
              const metadata = getMessageMetadata(message);
              const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
              return (
                isLastAssistant &&
                metadata.suggestedQuestions &&
                metadata.suggestedQuestions.length > 0 &&
                !sending &&
                onSuggestedQuestionSelect && (
                  <Box sx={{ mt: 2 }}>
                    <Suggestions>
                      {metadata.suggestedQuestions.map((q) => (
                        <Suggestion
                          key={q}
                          suggestion={q}
                          onClick={onSuggestedQuestionSelect}
                          disabled={sending}
                        />
                      ))}
                    </Suggestions>
                  </Box>
                )
              );
            })()}
          </Box>
        </Box>
      ))}

      {/* Conversation-wide Pending Actions - Shows ALL pending HITL actions for this conversation.
          Uses WebSocket for real-time updates (subscribed above).
          This catches any actions created during streaming that weren't mapped to specific messages. */}
      {!sending && messages.length > 0 && (
        <ConversationPendingActions conversationId={conversationId} />
      )}

      {/* Real-time agent activity indicator - shows actual agent action from WebSocket */}
      <TypingIndicator
        isActive={sending && messages.length > 0}
        action={agentSteps.find(s => s.status === 'active')?.action}
      />

      <div ref={messagesEndRef} />
    </Box>
  );
}

export default ChatMessages;
