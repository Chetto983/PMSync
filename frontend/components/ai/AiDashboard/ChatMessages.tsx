'use client';

import React, { useEffect } from 'react';
import { Box, Typography, Paper, alpha, useTheme, IconButton, Tooltip, Fade } from '@mui/material';
import { Bot, User, Copy, Check, ArrowDown } from 'lucide-react';
import { useChatScroll } from './useChatScroll';
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
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/src/components/ai-elements/reasoning';

/** Reasoning part type for AI SDK extended thinking */
interface ReasoningPart {
  type: 'reasoning';
  text?: string;
  state?: 'streaming' | 'complete';
}

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
/**
 * Scroll-to-bottom floating button.
 * Appears when user scrolls up in the chat.
 */
function ScrollToBottomButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  const theme = useTheme();

  return (
    <Fade in={visible}>
      <IconButton
        onClick={onClick}
        sx={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          bgcolor: alpha(theme.palette.background.paper, 0.9),
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.2),
          boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.15)}`,
          '&:hover': {
            bgcolor: theme.palette.background.paper,
          },
        }}
      >
        <ArrowDown size={20} />
      </IconButton>
    </Fade>
  );
}

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

  // Smart scroll: only auto-scroll when user is at bottom
  // Uses IntersectionObserver on endRef - works with any scrollable ancestor
  const { endRef, isAtBottom, scrollToBottom } = useChatScroll({
    deps: [messages.length, sending, hasAgentActivity, agentSteps.length],
  });


  return (
    <Box
      sx={{
        position: 'relative', // For scroll-to-bottom button positioning
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
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
            {/* User messages: Paper with subtle background. Assistant: no container (clean typography) */}
            {message.role === 'user' ? (
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.5, md: 2 },
                  borderRadius: 3,
                  bgcolor: alpha(theme.palette.secondary.main, 0.08),
                  color: 'text.primary',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}
                >
                  {getMessageText(message)}
                </Typography>
              </Paper>
            ) : (
              /* Assistant messages: no container, just clean typography */
              <Box sx={{ '& > *:first-of-type': { mt: 0 }, '& > *:last-child': { mb: 0 } }}>
                {/* Native AI SDK v6 pattern: iterate through message.parts */}
                {message.parts.map((part, partIndex) => {
                  // DEBUG: Log non-text parts to see tools
                  if (process.env.NODE_ENV === 'development' && part.type !== 'text') {
                    console.log('[ChatMessages] Tool part:', { type: part.type, ...('toolName' in part ? { toolName: (part as { toolName: string }).toolName } : {}) });
                  }

                  // Reasoning parts -> Reasoning component with shimmer
                  if (part.type === 'reasoning') {
                    const reasoningPart = part as ReasoningPart;
                    return (
                      <Reasoning
                        key={`reasoning-${partIndex}`}
                        isStreaming={reasoningPart.state === 'streaming'}
                        defaultOpen={true}
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>
                          {reasoningPart.text || ''}
                        </ReasoningContent>
                      </Reasoning>
                    );
                  }

                  // Text parts -> MessageResponse (uses Streamdown)
                  // Strip suggestions code blocks - they're rendered as chips separately
                  if (part.type === 'text') {
                    const cleanText = (part.text || '').replace(/```suggestions\s*\n?\s*\[[\s\S]*?\]\s*\n?```/g, '').trim();
                    if (!cleanText) return null; // Skip empty text parts
                    return <MessageResponse key={partIndex}>{cleanText}</MessageResponse>;
                  }
                  // AI SDK v6: 'dynamic-tool' type for dynamic tools
                  if (part.type === 'dynamic-tool') {
                    const toolPart = part as ToolPart;
                    return (
                      <Tool key={toolPart.toolCallId || `tool-${partIndex}`} defaultOpen={false}>
                        <ToolHeader
                          type="dynamic-tool"
                          state={toolPart.state}
                          toolName={(toolPart as { toolName: string }).toolName}
                        />
                        <ToolContent>
                          <ToolInput input={toolPart.input} />
                          <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  // AI SDK v6: 'tool-{name}' format for static tools (e.g., 'tool-list_emails')
                  if (part.type.startsWith('tool-')) {
                    const toolPart = part as ToolPart;
                    return (
                      <Tool key={toolPart.toolCallId || `tool-${partIndex}`} defaultOpen={false}>
                        <ToolHeader
                          type={toolPart.type as `tool-${string}`}
                          state={toolPart.state}
                        />
                        <ToolContent>
                          <ToolInput input={toolPart.input} />
                          <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  // Other part types (reasoning, sources, step-start, etc.) - skip for now
                  return null;
                })}
              </Box>
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

      {/* Scroll-to-bottom button - appears when scrolled up */}
      <ScrollToBottomButton
        visible={!isAtBottom && messages.length > 4}
        onClick={scrollToBottom}
      />

      <div ref={endRef} />
    </Box>
  );
}

export default ChatMessages;
