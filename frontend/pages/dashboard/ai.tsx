import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Badge,
  Card,
  CardContent,
  Stack,
  Collapse,
  Snackbar,
  Alert,
  Avatar,
  keyframes,
  alpha,
} from '@mui/material';
import {
  Send,
  Bot,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mail,
  Calendar,
  Users,
  RefreshCw,
  History,
  User,
  Zap,
  FileText,
  Search,
  Bell,
  //Star,
  //MessageSquare,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Layout } from '@/components/layout/Layout';
import { multiAgentApi, type MultiAgentResponse, type PendingAction, type ActionFeedback } from '@/lib/api/multi-agent';
import { websocketClient, type RealtimeAiActionEvent } from '@/lib/websocket-client';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/lib/hooks/use-translations';

// Shimmer animation for thinking state
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// Pulse animation for avatar
const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
`;

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agentUsed?: string;
  intent?: string;
  pendingActionIds?: string[];
};

// Example queries organized by category
const exampleQueries = [
  {
    category: 'Email',
    icon: Mail,
    color: '#3b82f6',
    queries: [
      { text: 'Summarize my unread emails', prompt: 'Summarize my unread emails' },
      { text: 'Find emails from last week', prompt: 'Find all emails from last week' },
      { text: 'Draft a reply to the latest email', prompt: 'Help me draft a reply to my latest email' },
    ],
  },
  {
    category: 'Calendar',
    icon: Calendar,
    color: '#10b981',
    queries: [
      { text: 'Schedule a meeting tomorrow', prompt: 'Schedule a meeting tomorrow at 2pm' },
      { text: "What's on my agenda today?", prompt: "What's on my calendar for today?" },
      { text: 'Find free time this week', prompt: 'When am I free this week for a 1-hour meeting?' },
    ],
  },
  {
    category: 'Contacts',
    icon: Users,
    color: '#8b5cf6',
    queries: [
      { text: 'Find John\'s contact info', prompt: 'Find contact info for John' },
      { text: 'Add a new contact', prompt: 'Add a new contact named Jane Doe with email jane@example.com' },
      { text: 'Update contact details', prompt: 'Update the phone number for my contact John' },
    ],
  },
];

// Quick action chips for common tasks
const quickActions = [
  { icon: FileText, text: 'Summarize inbox', prompt: 'Summarize my inbox' },
  { icon: Bell, text: 'Important emails', prompt: 'Show me important unread emails' },
  { icon: Calendar, text: "Today's schedule", prompt: "What's on my schedule today?" },
  { icon: Search, text: 'Search contacts', prompt: 'Search my contacts' },
];

// Thinking indicator component with shimmer effect
function ThinkingIndicator() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, maxWidth: '80%' }}>
      <Avatar
        sx={{
          width: 36,
          height: 36,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          animation: `${pulse} 1.5s ease-in-out infinite`,
        }}
      >
        <Sparkles size={18} />
      </Avatar>
      <Box
        sx={{
          bgcolor: 'action.hover',
          borderRadius: 2,
          borderTopLeftRadius: 0,
          p: 2,
          minWidth: 200,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Bot size={14} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            AI Assistant
          </Typography>
        </Box>
        <Box
          sx={{
            height: 12,
            borderRadius: 1,
            background: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.text.primary, 0.05)} 25%, ${alpha(theme.palette.text.primary, 0.15)} 50%, ${alpha(theme.palette.text.primary, 0.05)} 75%)`,
            backgroundSize: '200% 100%',
            animation: `${shimmer} 1.5s infinite`,
            mb: 1,
          }}
        />
        <Box
          sx={{
            height: 12,
            width: '70%',
            borderRadius: 1,
            background: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.text.primary, 0.05)} 25%, ${alpha(theme.palette.text.primary, 0.15)} 50%, ${alpha(theme.palette.text.primary, 0.05)} 75%)`,
            backgroundSize: '200% 100%',
            animation: `${shimmer} 1.5s infinite`,
            animationDelay: '0.2s',
          }}
        />
      </Box>
    </Box>
  );
}

// Empty state with example queries
function EmptyState({ onSelectQuery }: { onSelectQuery: (prompt: string) => void }) {
  const t = useTranslations();

  return (
    <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
      {/* Hero Section */}
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 3,
          boxShadow: '0 10px 40px rgba(102, 126, 234, 0.3)',
        }}
      >
        <Sparkles size={40} color="white" />
      </Box>

      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t.ai?.welcome || 'How can I help you today?'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 400, mx: 'auto' }}>
        {t.ai?.description || 'Your intelligent assistant for email, calendar, and contacts. Ask me anything or try one of the suggestions below.'}
      </Typography>

      {/* Quick Actions */}
      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" sx={{ gap: 1, mb: 4 }}>
        {quickActions.map((action, index) => (
          <Chip
            key={index}
            icon={<action.icon size={14} />}
            label={action.text}
            onClick={() => onSelectQuery(action.prompt)}
            sx={{
              borderRadius: 2,
              px: 1,
              '&:hover': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiChip-icon': { color: 'inherit' },
              },
            }}
            variant="outlined"
          />
        ))}
      </Stack>

      {/* Category Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
          maxWidth: 800,
          mx: 'auto',
        }}
      >
        {exampleQueries.map((category) => (
          <Card
            key={category.category}
            variant="outlined"
            sx={{
              borderRadius: 2,
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: category.color,
                boxShadow: `0 4px 20px ${alpha(category.color, 0.15)}`,
              },
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    bgcolor: alpha(category.color, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: category.color,
                  }}
                >
                  <category.icon size={18} />
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {category.category}
                </Typography>
              </Box>
              <Stack spacing={1}>
                {category.queries.map((query, idx) => (
                  <Button
                    key={idx}
                    variant="text"
                    size="small"
                    onClick={() => onSelectQuery(query.prompt)}
                    sx={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      textTransform: 'none',
                      color: 'text.secondary',
                      fontSize: '0.8rem',
                      px: 1,
                      '&:hover': {
                        bgcolor: alpha(category.color, 0.08),
                        color: category.color,
                      },
                    }}
                  >
                    {query.text}
                  </Button>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

// Message bubble component
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  const getAgentIcon = (agentName?: string) => {
    switch (agentName) {
      case 'EmailAgent':
        return <Mail size={14} />;
      case 'CalendarAgent':
        return <Calendar size={14} />;
      case 'ContactsAgent':
        return <Users size={14} />;
      default:
        return <Bot size={14} />;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        flexDirection: isUser ? 'row-reverse' : 'row',
        maxWidth: '85%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          bgcolor: isUser ? 'primary.main' : 'transparent',
          background: isUser ? undefined : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        {isUser ? <User size={18} /> : <Sparkles size={18} />}
      </Avatar>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            bgcolor: isUser ? 'primary.main' : 'action.hover',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            borderTopLeftRadius: isUser ? 16 : 4,
            borderTopRightRadius: isUser ? 4 : 16,
            p: 2,
            position: 'relative',
          }}
        >
          {!isUser && message.agentUsed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                }}
              >
                {getAgentIcon(message.agentUsed)}
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {message.agentUsed.replace('Agent', '')}
                </Typography>
              </Box>
              {message.intent && (
                <Chip
                  label={message.intent}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              )}
            </Box>
          )}

          {/* Markdown content for assistant, plain text for user */}
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          ) : (
            <Box
              sx={{
                '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                '& ul, & ol': { m: 0, pl: 2 },
                '& li': { mb: 0.5 },
                '& code': {
                  bgcolor: (theme) => alpha(theme.palette.text.primary, 0.1),
                  px: 0.5,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.85em',
                },
                '& pre': {
                  bgcolor: (theme) => alpha(theme.palette.text.primary, 0.1),
                  p: 1.5,
                  borderRadius: 1,
                  overflow: 'auto',
                  '& code': { bgcolor: 'transparent', p: 0 },
                },
                '& a': { color: 'primary.main' },
                '& strong': { fontWeight: 600 },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </Box>
          )}

          {message.pendingActionIds && message.pendingActionIds.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <Chip
                icon={<Clock size={14} />}
                label={`${message.pendingActionIds.length} action(s) pending approval`}
                size="small"
                color="warning"
                sx={{ fontWeight: 500 }}
              />
            </Box>
          )}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5, px: 1, textAlign: isUser ? 'right' : 'left' }}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Box>
    </Box>
  );
}

function AiAssistantView() {
  const t = useTranslations();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [showPendingActions, setShowPendingActions] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [actionHistory, setActionHistory] = useState<ActionFeedback[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'info' | 'warning' | 'error';
  }>({ open: false, message: '', severity: 'info' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((state) => state.token);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const loadPendingActions = useCallback(async () => {
    try {
      setLoadingActions(true);
      const response = await multiAgentApi.getPendingActions({ status: 'PENDING' });
      setPendingActions(response.data || []);
    } catch (error) {
      console.error('Failed to load pending actions:', error);
    } finally {
      setLoadingActions(false);
    }
  }, []);

  const loadActionHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const response = await multiAgentApi.getFeedback({ limit: 20 });
      setActionHistory(response.data || []);
    } catch (error) {
      console.error('Failed to load action history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadPendingActions();
  }, [loadPendingActions]);

  useEffect(() => {
    if (showHistory && actionHistory.length === 0) {
      loadActionHistory();
    }
  }, [showHistory, actionHistory.length, loadActionHistory]);

  // WebSocket event handlers
  useEffect(() => {
    if (!token || !websocketClient.isConnected()) return;

    const unsubCreated = websocketClient.onAiActionCreated((event: RealtimeAiActionEvent) => {
      loadPendingActions();
      setNotification({
        open: true,
        message: `New action pending: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'info',
      });
    });

    const unsubApproved = websocketClient.onAiActionApproved((event: RealtimeAiActionEvent) => {
      setPendingActions((prev) => prev.filter((a) => a.id !== event.actionId));
      setNotification({
        open: true,
        message: `Action approved: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'success',
      });
    });

    const unsubRejected = websocketClient.onAiActionRejected((event: RealtimeAiActionEvent) => {
      setPendingActions((prev) => prev.filter((a) => a.id !== event.actionId));
      setNotification({
        open: true,
        message: `Action rejected: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'warning',
      });
    });

    const unsubExecuted = websocketClient.onAiActionExecuted((event: RealtimeAiActionEvent) => {
      setPendingActions((prev) => prev.filter((a) => a.id !== event.actionId));
      setNotification({
        open: true,
        message: `Action completed: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'success',
      });
    });

    const unsubFailed = websocketClient.onAiActionFailed((event: RealtimeAiActionEvent) => {
      setPendingActions((prev) => prev.filter((a) => a.id !== event.actionId));
      setNotification({
        open: true,
        message: `Action failed: ${event.error || event.actionType.replace(/_/g, ' ')}`,
        severity: 'error',
      });
    });

    return () => {
      unsubCreated();
      unsubApproved();
      unsubRejected();
      unsubExecuted();
      unsubFailed();
    };
  }, [token, loadPendingActions]);

  const handleSendPrompt = async (customPrompt?: string) => {
    const messageText = customPrompt || prompt.trim();
    if (!messageText || sending) return;

    const userMessage: Message = {
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt('');
    setSending(true);

    try {
      const response = await multiAgentApi.processMessage({
        message: userMessage.content,
        sessionId,
      });

      const data: MultiAgentResponse = response.data;

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.messages.join('\n'),
        timestamp: new Date(),
        agentUsed: data.agentUsed,
        intent: data.intent.intent,
        pendingActionIds: data.pendingActionIds,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.pendingActionIds.length > 0) {
        await loadPendingActions();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleApproveAction = async (actionId: string) => {
    try {
      await multiAgentApi.approveAction(actionId);
      await loadPendingActions();
    } catch (error) {
      console.error('Failed to approve action:', error);
    }
  };

  const handleRejectAction = async (actionId: string) => {
    try {
      await multiAgentApi.rejectAction(actionId, 'User rejected');
      await loadPendingActions();
    } catch (error) {
      console.error('Failed to reject action:', error);
    }
  };

  const getAgentIcon = (agentName?: string) => {
    switch (agentName) {
      case 'EmailAgent':
        return <Mail size={14} />;
      case 'CalendarAgent':
        return <Calendar size={14} />;
      case 'ContactsAgent':
        return <Users size={14} />;
      default:
        return <Bot size={14} />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warning';
      default:
        return 'success';
    }
  };

  const formatActionType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', gap: 2 }}>
      {/* Main Chat Area */}
      <Paper
        sx={{
          flex: 1,
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            background: (theme) =>
              theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)'
                : 'linear-gradient(135deg, rgba(102,126,234,0.05) 0%, rgba(118,75,162,0.05) 100%)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(102, 126, 234, 0.35)',
              }}
            >
              <Sparkles size={22} color="white" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {t.ai?.title || 'AI Assistant'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t.ai?.subtitle || 'Email • Calendar • Contacts'}
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                icon={<Zap size={12} />}
                label="Online"
                size="small"
                color="success"
                sx={{ height: 24 }}
              />
            </Box>
          </Box>
        </Box>

        {/* Messages Area */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {messages.length === 0 ? (
            <EmptyState onSelectQuery={(query) => handleSendPrompt(query)} />
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble key={index} message={message} />
              ))}
              {sending && <ThinkingIndicator />}
            </>
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input Area */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          {/* Quick suggestions when there are messages */}
          {messages.length > 0 && !sending && (
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
              {quickActions.slice(0, 3).map((action, idx) => (
                <Chip
                  key={idx}
                  icon={<action.icon size={12} />}
                  label={action.text}
                  size="small"
                  variant="outlined"
                  onClick={() => handleSendPrompt(action.prompt)}
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
            </Stack>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
            <TextField
              fullWidth
              placeholder={t.ai?.inputPlaceholder || 'Ask me anything about your emails, calendar, or contacts...'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendPrompt();
                }
              }}
              disabled={sending}
              multiline
              maxRows={4}
              inputRef={inputRef}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                },
              }}
            />
            <Button
              variant="contained"
              onClick={() => handleSendPrompt()}
              disabled={sending || !prompt.trim()}
              sx={{
                minWidth: 48,
                width: 48,
                height: 48,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%)',
                },
                '&:disabled': {
                  background: (theme) => theme.palette.action.disabledBackground,
                },
              }}
            >
              {sending ? <CircularProgress size={20} color="inherit" /> : <Send size={20} />}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Sidebar */}
      <Paper
        sx={{
          width: 320,
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Pending Actions Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Badge badgeContent={pendingActions.length} color="warning" max={99}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'warning.main',
                }}
              >
                <Clock size={18} />
              </Box>
            </Badge>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Pending Actions
            </Typography>
          </Box>
          <Box>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={loadPendingActions} disabled={loadingActions}>
                <RefreshCw size={16} className={loadingActions ? 'animate-spin' : ''} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setShowPendingActions(!showPendingActions)}>
              {showPendingActions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={showPendingActions}>
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {loadingActions ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : pendingActions.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: (theme) => alpha(theme.palette.success.main, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                    color: 'success.main',
                  }}
                >
                  <CheckCircle size={24} />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  No pending actions
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {pendingActions.map((action) => (
                  <Card
                    key={action.id}
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <Chip
                          label={formatActionType(action.actionType)}
                          size="small"
                          color={getSeverityColor(action.severity) as 'error' | 'warning' | 'success'}
                          sx={{ fontWeight: 500 }}
                        />
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {getAgentIcon(action.agentName)}
                        <Typography variant="caption" color="text.secondary">
                          {action.agentName} • {Math.round((action.adjustedConfidence || action.confidence) * 100)}% confidence
                        </Typography>
                      </Box>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          mb: 2,
                          p: 1,
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                          maxHeight: 60,
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(action.payload, null, 2).slice(0, 150)}...
                      </Typography>

                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircle size={14} />}
                          onClick={() => handleApproveAction(action.id)}
                          sx={{ flex: 1, textTransform: 'none' }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<XCircle size={14} />}
                          onClick={() => handleRejectAction(action.id)}
                          sx={{ flex: 1, textTransform: 'none' }}
                        >
                          Reject
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        </Collapse>

        {/* Action History */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'info.main',
              }}
            >
              <History size={18} />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              History
            </Typography>
          </Box>
          <Box>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={loadActionHistory} disabled={loadingHistory}>
                <RefreshCw size={16} className={loadingHistory ? 'animate-spin' : ''} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={showHistory}>
          <Box sx={{ maxHeight: 200, overflow: 'auto', p: 2 }}>
            {loadingHistory ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} />
              </Box>
            ) : actionHistory.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No history yet
              </Typography>
            ) : (
              <Stack spacing={1}>
                {actionHistory.map((feedback) => (
                  <Box
                    key={feedback.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: 'action.hover',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                    }}
                  >
                    {feedback.wasApproved ? (
                      feedback.wasSuccessful ? (
                        <CheckCircle size={14} color="#22c55e" style={{ marginTop: 2, flexShrink: 0 }} />
                      ) : (
                        <XCircle size={14} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
                      )
                    ) : (
                      <XCircle size={14} color="#f97316" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                        {formatActionType(feedback.actionType)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
                        {feedback.agentName} • {Math.round(feedback.originalConfidence * 100)}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                        {new Date(feedback.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Collapse>

        {/* Tips */}
        <Box sx={{ p: 2, mt: 'auto', borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <AlertTriangle size={14} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              High severity actions require approval. Low severity actions may auto-execute based on confidence.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Notifications */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setNotification((prev) => ({ ...prev, open: false }))}
          severity={notification.severity}
          variant="filled"
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function AiAssistantPage() {
  return (
    <Layout>
      <AiAssistantView />
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
