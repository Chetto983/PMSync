'use client';

import React, { useEffect } from 'react';
import { Box, Typography, Paper, alpha, useTheme, IconButton, Tooltip, Fade } from '@mui/material';
import { Bot, User, Copy, Check, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
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
import { Tool, ToolHeader, ToolContent } from '@/src/components/ai-elements/tool';
import type { ToolPart } from '@/src/components/ai-elements/tool';
import { SmartToolOutput } from '@/src/components/ai-elements/tool-renderers/SmartToolOutput';
import { Suggestions, Suggestion } from '@/src/components/ai-elements/suggestion';
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/src/components/ai-elements/reasoning';
import { Shimmer } from '@/src/components/ai-elements/shimmer';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/src/components/ai-elements/chain-of-thought';
import { Sources, SourcesTrigger, SourcesContent, Source } from '@/src/components/ai-elements/sources';
import { ArtifactPanel } from './ArtifactPanel';
import { Search, FileText, Mail, Calendar, Users, Circle, BookOpenText, type LucideIcon } from 'lucide-react';

/** Human-readable tool names for ChainOfThought display */
const TOOL_NAME_MAP: Record<string, string> = {
  list_emails: 'Listing emails',
  search_emails: 'Searching emails',
  read_email: 'Reading email',
  draft_email: 'Drafting email',
  send_email: 'Sending email',
  list_contacts: 'Listing contacts',
  search_contacts: 'Searching contacts',
  list_calendar_events: 'Listing events',
  create_calendar_event: 'Creating event',
  list_follow_ups: 'Listing follow-ups',
  create_follow_up: 'Creating follow-up',
};

/**
 * Get icon for a tool based on its name.
 */
function getToolIcon(toolName?: string): LucideIcon {
  if (!toolName) return Circle;
  if (toolName.includes('search') || toolName.includes('list')) return Search;
  if (toolName.includes('email') || toolName.includes('mail')) return Mail;
  if (toolName.includes('calendar') || toolName.includes('event')) return Calendar;
  if (toolName.includes('contact')) return Users;
  if (toolName.includes('read') || toolName.includes('get')) return FileText;
  return Circle;
}

/**
 * Get tool status for ChainOfThought step.
 */
function getToolStatus(state?: string): 'complete' | 'active' | 'pending' {
  if (state === 'complete' || state === 'result') return 'complete';
  if (state === 'streaming' || state === 'running') return 'active';
  return 'pending';
}

/**
 * Determine if a tool output should render as an Artifact panel.
 * - draft_email tool outputs -> Artifact
 * - Code blocks >10 lines -> Artifact
 */
function shouldRenderAsArtifact(toolPart: ToolPart): boolean {
  const toolName = (toolPart as { toolName?: string }).toolName;
  if (toolName === 'draft_email') return true;

  const output = toolPart.output;
  if (typeof output === 'string') {
    const lines = output.split('\n').length;
    const hasDefinitions = /^(class|function|export|import|interface|type|const|let|var)\s/m.test(output);
    if (lines > 10 || hasDefinitions) return true;
  }
  return false;
}

/**
 * Get artifact title from tool part.
 */
function getArtifactTitle(toolPart: ToolPart): string {
  const toolName = (toolPart as { toolName?: string }).toolName;
  if (toolName === 'draft_email') return 'Draft Reply';
  return 'Generated Content';
}

/**
 * Group consecutive tool parts for ChainOfThought display.
 * Returns groups where each group with >1 tool should use ChainOfThought.
 */
type PartWithType = UIMessage['parts'][number];

function groupToolParts(parts: PartWithType[]): Array<{
  isChain: boolean;
  parts: PartWithType[];
  startIndex: number;
}> {
  const groups: Array<{ isChain: boolean; parts: PartWithType[]; startIndex: number }> = [];
  let currentToolGroup: PartWithType[] = [];
  let currentStartIndex = 0;

  parts.forEach((part, index) => {
    const isTool = part.type.startsWith('tool-') || part.type === 'dynamic-tool';

    if (isTool) {
      if (currentToolGroup.length === 0) {
        currentStartIndex = index;
      }
      currentToolGroup.push(part);
    } else {
      // Flush tool group if exists
      if (currentToolGroup.length > 0) {
        groups.push({
          isChain: currentToolGroup.length > 1,
          parts: currentToolGroup,
          startIndex: currentStartIndex,
        });
        currentToolGroup = [];
      }
      // Add non-tool part as single item
      groups.push({
        isChain: false,
        parts: [part],
        startIndex: index,
      });
    }
  });

  // Flush remaining tool group
  if (currentToolGroup.length > 0) {
    groups.push({
      isChain: currentToolGroup.length > 1,
      parts: currentToolGroup,
      startIndex: currentStartIndex,
    });
  }

  return groups;
}

/** Source reference for RAG citations */
interface SourceReference {
  id: string;
  type: 'email' | 'contact' | 'document';
  title: string;
  snippet?: string;
}

/**
 * Extract source references from tool outputs.
 * RAG tools (search_emails, list_contacts, etc.) return items that can be cited.
 */
function extractSources(parts: PartWithType[]): SourceReference[] {
  const sources: SourceReference[] = [];

  for (const part of parts) {
    if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
      const toolPart = part as ToolPart;
      const toolName = (toolPart as { toolName?: string }).toolName;
      const output = toolPart.output;

      // Email search results
      if (toolName?.includes('email') && Array.isArray(output)) {
        for (const item of output.slice(0, 3)) {
          if (item.id && item.subject) {
            sources.push({
              id: item.id,
              type: 'email',
              title: item.subject,
              snippet: item.snippet || item.from,
            });
          }
        }
      }

      // Contact search results
      if (toolName?.includes('contact') && Array.isArray(output)) {
        for (const item of output.slice(0, 3)) {
          if (item.id && (item.name || item.displayName)) {
            sources.push({
              id: item.id,
              type: 'contact',
              title: item.name || item.displayName,
              snippet: item.email || item.company,
            });
          }
        }
      }
    }
  }

  return sources;
}

/**
 * Get icon for source type.
 */
function getSourceIcon(type: string): React.ElementType {
  switch (type) {
    case 'email': return Mail;
    case 'contact': return Users;
    default: return BookOpenText;
  }
}

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

  // Get current active action text from agent steps
  const activeAction = agentSteps.find(s => s.status === 'active')?.action;

  /**
   * Create custom thinking message for Reasoning component.
   * Shows dynamic action text during streaming, duration after completion.
   */
  /* eslint-disable react/display-name */
  const createThinkingMessage = React.useCallback((currentAction?: string) => {
    return (isStreaming: boolean, duration?: number) => {
      if (isStreaming || duration === 0) {
        // Use current action if available, otherwise default
        const text = currentAction || 'Thinking...';
        return <Shimmer duration={1.5}>{text}</Shimmer>;
      }
      if (duration === undefined) {
        return <span>Thought for a few seconds</span>;
      }
      return <span>Thought for {duration} seconds</span>;
    };
  }, []);
  /* eslint-enable react/display-name */

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
          component={motion.div}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: index * 0.05 }}
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
                {/* Process message parts with ChainOfThought grouping */}
                {groupToolParts(message.parts).map((group, groupIndex) => {
                  // Multiple consecutive tools - wrap in ChainOfThought
                  if (group.isChain) {
                    return (
                      <ChainOfThought key={`chain-${groupIndex}`} defaultOpen={false}>
                        <ChainOfThoughtHeader>
                          Processing your request ({group.parts.length} steps)
                        </ChainOfThoughtHeader>
                        <ChainOfThoughtContent>
                          {group.parts.map((part, partIndex) => {
                            const toolPart = part as ToolPart;
                            const toolName = part.type === 'dynamic-tool'
                              ? (toolPart as { toolName?: string }).toolName
                              : part.type.replace(/^tool-/, '');
                            const ToolIcon = getToolIcon(toolName);
                            return (
                              <ChainOfThoughtStep
                                key={toolPart.toolCallId || `step-${partIndex}`}
                                icon={ToolIcon}
                                label={TOOL_NAME_MAP[toolName || ''] || toolName || 'Processing'}
                                status={getToolStatus(toolPart.state)}
                              />
                            );
                          })}
                        </ChainOfThoughtContent>
                      </ChainOfThought>
                    );
                  }

                  // Single tool or non-tool parts - render directly
                  return group.parts.map((part, partIndex) => {
                    const absIndex = group.startIndex + partIndex;

                    // DEBUG: Log non-text parts to see tools
                    if (process.env.NODE_ENV === 'development' && part.type !== 'text') {
                      //console.log('[ChatMessages] Tool part:', { type: part.type, ...('toolName' in part ? { toolName: (part as { toolName: string }).toolName } : {}) });
                    }

                    // Reasoning parts -> Reasoning component with shimmer
                    if (part.type === 'reasoning') {
                      const reasoningPart = part as ReasoningPart;
                      return (
                        <Reasoning
                          key={`reasoning-${absIndex}`}
                          isStreaming={reasoningPart.state === 'streaming'}
                          defaultOpen={true}
                        >
                          <ReasoningTrigger getThinkingMessage={createThinkingMessage(activeAction)} />
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
                      return <MessageResponse key={absIndex}>{cleanText}</MessageResponse>;
                    }

                    // AI SDK v6: 'dynamic-tool' or 'tool-{name}' types
                    if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
                      const toolPart = part as ToolPart;
                      // Extract tool name: dynamic-tool has .toolName, tool-{name} has name in type
                      const toolName = part.type === 'dynamic-tool'
                        ? (toolPart as { toolName?: string }).toolName
                        : part.type.replace(/^tool-/, '');

                      // Check if this should be an artifact (draft emails, large code)
                      if (shouldRenderAsArtifact(toolPart) && toolPart.output) {
                        return (
                          <React.Fragment key={toolPart.toolCallId || `tool-${absIndex}`}>
                            {/* Tool header still shows the action */}
                            <Tool defaultOpen={false}>
                              {part.type === 'dynamic-tool' ? (
                                <ToolHeader
                                  type="dynamic-tool"
                                  state={toolPart.state}
                                  toolName={toolName || 'unknown'}
                                />
                              ) : (
                                <ToolHeader
                                  type={toolPart.type as `tool-${string}`}
                                  state={toolPart.state}
                                />
                              )}
                            </Tool>
                            {/* Output in Artifact panel */}
                            <ArtifactPanel
                              title={getArtifactTitle(toolPart)}
                              type={toolName === 'draft_email' ? 'email-draft' : 'code'}
                              content={
                                typeof toolPart.output === 'string'
                                  ? <pre className="whitespace-pre-wrap text-sm">{toolPart.output}</pre>
                                  : <pre className="text-sm">{JSON.stringify(toolPart.output, null, 2)}</pre>
                              }
                              rawContent={
                                typeof toolPart.output === 'string'
                                  ? toolPart.output
                                  : JSON.stringify(toolPart.output, null, 2)
                              }
                            />
                          </React.Fragment>
                        );
                      }

                      // Regular tool rendering
                      return (
                        <Tool key={toolPart.toolCallId || `tool-${absIndex}`} defaultOpen={false}>
                          {part.type === 'dynamic-tool' ? (
                            <ToolHeader
                              type="dynamic-tool"
                              state={toolPart.state}
                              toolName={toolName || 'unknown'}
                            />
                          ) : (
                            <ToolHeader
                              type={toolPart.type as `tool-${string}`}
                              state={toolPart.state}
                            />
                          )}
                          <ToolContent>
                            <SmartToolOutput
                              output={toolPart.output}
                              errorText={toolPart.errorText}
                              toolName={toolName}
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }

                    // Other part types - skip
                    return null;
                  });
                })}

                {/* Sources - rendered after message content when applicable */}
                {(() => {
                  const sources = extractSources(message.parts);
                  if (sources.length === 0) return null;
                  return (
                    <Sources className="mt-3">
                      <SourcesTrigger count={sources.length} />
                      <SourcesContent>
                        {sources.map((source, idx) => {
                          const SourceIcon = getSourceIcon(source.type);
                          return (
                            <Source key={source.id || idx} title={source.title}>
                              <SourceIcon className="h-4 w-4" />
                              <span className="block font-medium">{source.title}</span>
                              {source.snippet && (
                                <span className="text-muted-foreground text-xs ml-1">— {source.snippet}</span>
                              )}
                            </Source>
                          );
                        })}
                      </SourcesContent>
                    </Sources>
                  );
                })()}
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
