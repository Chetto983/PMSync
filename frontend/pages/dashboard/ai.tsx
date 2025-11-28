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
  Card,
  CardContent,
  Stack,
  Collapse,
  Snackbar,
  Alert,
  Avatar,
  keyframes,
  alpha,
  useTheme,
} from '@mui/material';
import { pmSyncColors } from '@/theme/appTheme';
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
  //Shield,
  //Star,
  //MessageSquare,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Layout } from '@/components/layout/Layout';
import { multiAgentApi, type MultiAgentResponse, type PendingAction, type ActionFeedback, type KnowledgeHit, type LearningProfileStats, type AgentInfo } from '@/lib/api/multi-agent';
import { websocketClient, type RealtimeAiActionEvent } from '@/lib/websocket-client';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PendingActionsPanel } from '@/components/dashboard/ai/PendingActionsPanel';
import { LearningProgressCard } from '@/components/dashboard/ai/LearningProgressCard';
import { AgentActivityChart, type AgentActivityData } from '@/components/dashboard/ai/AgentActivityChart';

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
  knowledgeHits?: KnowledgeHit[];
  clarifyingQuestions?: string[];
};

// Helper type for translations
type Translations = ReturnType<typeof useTranslations>;

// Helper function to get translated example queries
function getExampleQueries(t: Translations) {
  return [
    {
      category: t.ai?.categories?.email || 'Email',
      icon: Mail,
      color: pmSyncColors.semantic.email,
      queries: [
        { text: t.ai?.examples?.email?.summarize || 'Summarize my unread emails', prompt: 'Summarize my unread emails' },
        { text: t.ai?.examples?.email?.findLastWeek || 'Find emails from last week', prompt: 'Find all emails from last week' },
        { text: t.ai?.examples?.email?.draftReply || 'Draft a reply to the latest email', prompt: 'Help me draft a reply to my latest email' },
      ],
    },
    {
      category: t.ai?.categories?.calendar || 'Calendar',
      icon: Calendar,
      color: pmSyncColors.semantic.calendar,
      queries: [
        { text: t.ai?.examples?.calendar?.scheduleMeeting || 'Schedule a meeting tomorrow', prompt: 'Schedule a meeting tomorrow at 2pm' },
        { text: t.ai?.examples?.calendar?.todayAgenda || "What's on my agenda today?", prompt: "What's on my calendar for today?" },
        { text: t.ai?.examples?.calendar?.findFreeTime || 'Find free time this week', prompt: 'When am I free this week for a 1-hour meeting?' },
      ],
    },
    {
      category: t.ai?.categories?.contacts || 'Contacts',
      icon: Users,
      color: pmSyncColors.semantic.contacts,
      queries: [
        { text: t.ai?.examples?.contacts?.findContact || "Find John's contact info", prompt: 'Find contact info for John' },
        { text: t.ai?.examples?.contacts?.addContact || 'Add a new contact', prompt: 'Add a new contact named Jane Doe with email jane@example.com' },
        { text: t.ai?.examples?.contacts?.updateContact || 'Update contact details', prompt: 'Update the phone number for my contact John' },
      ],
    },
  ];
}

// Helper function to get translated quick actions
function getQuickActions(t: Translations) {
  return [
    { icon: FileText, text: t.ai?.quickActions?.summarizeInbox || 'Summarize inbox', prompt: 'Summarize my inbox' },
    { icon: Bell, text: t.ai?.quickActions?.importantEmails || 'Important emails', prompt: 'Show me important unread emails' },
    { icon: Calendar, text: t.ai?.quickActions?.todaySchedule || "Today's schedule", prompt: "What's on my schedule today?" },
    { icon: Search, text: t.ai?.quickActions?.searchContacts || 'Search contacts', prompt: 'Search my contacts' },
  ];
}

// Thinking indicator component with shimmer effect
function ThinkingIndicator() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, maxWidth: '80%' }}>
      <Avatar
        sx={{
          width: 36,
          height: 36,
          background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
  const quickActions = getQuickActions(t);
  const exampleQueries = getExampleQueries(t);

  return (
    <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
      {/* Hero Section */}
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: 3,
          background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 3,
          boxShadow: (theme) => `0 10px 40px ${alpha(theme.palette.primary.main, 0.3)}`,
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
function MessageBubble({
  message,
  agentInfoMap,
  onQuestionClick,
}: {
  message: Message;
  agentInfoMap?: Record<string, AgentInfo>;
  onQuestionClick?: (question: string) => void;
}) {
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
          background: isUser ? undefined : (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
              <Tooltip
                title={
                  agentInfoMap && agentInfoMap[message.agentUsed]
                    ? `${agentInfoMap[message.agentUsed].description} • Intents: ${agentInfoMap[message.agentUsed].supportedIntents.join(', ')}`
                    : undefined
                }
              >
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
              </Tooltip>
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

          {message.knowledgeHits && message.knowledgeHits.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider', display: 'grid', gap: 1 }}>
              {message.knowledgeHits.map((hit) => (
                <Paper
                  key={hit.id}
                  variant="outlined"
                  sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'background.default' }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {hit.subject || 'Fonte'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ my: 0.5 }}>
                    {hit.snippet}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                    {hit.source && (
                      <Chip label={hit.source} size="small" variant="outlined" />
                    )}
                    {typeof hit.score === 'number' && (
                      <Chip label={`score ${Math.round(hit.score * 100)}%`} size="small" variant="outlined" />
                    )}
                  </Stack>
                </Paper>
              ))}
            </Box>
          )}

          {/* Clarifying Questions - clickable suggestions from AI */}
          {message.clarifyingQuestions && message.clarifyingQuestions.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Suggested follow-up questions:
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {message.clarifyingQuestions.map((question, idx) => (
                  <Chip
                    key={idx}
                    label={question}
                    size="small"
                    variant="outlined"
                    onClick={() => onQuestionClick?.(question)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        borderColor: 'primary.main',
                      },
                    }}
                  />
                ))}
              </Stack>
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
  const currentLocale = (t as any)?.locale || 'en';
  const theme = useTheme();
  const quickActions = getQuickActions(t);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [showPendingActions, setShowPendingActions] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [actionHistory, setActionHistory] = useState<ActionFeedback[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [_sessionId, setSessionId] = useState<string | undefined>(undefined); // State for potential UI display
  const sessionIdRef = useRef<string | undefined>(undefined); // Ref to avoid race condition
  const [learningProfiles, setLearningProfiles] = useState<LearningProfileStats[]>([]);
  const [learningSummary, setLearningSummary] = useState<{ totalAttempts: number; overallApprovalRate: number; overallSuccessRate: number } | undefined>();
  const [loadingLearning, setLoadingLearning] = useState(false);
  const [agentActivity, setAgentActivity] = useState<AgentActivityData[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'info' | 'warning' | 'error';
  }>({ open: false, message: '', severity: 'info' });
  const [agentInfoMap, setAgentInfoMap] = useState<Record<string, AgentInfo>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Limit messages to prevent memory leak
  const MAX_MESSAGES = 100;
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
      // API returns { actions: [], total, limit, offset }
      setPendingActions(response.data?.actions || []);
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
      // Handle both array and object response formats
      const feedbackData = response.data;
      if (Array.isArray(feedbackData)) {
        setActionHistory(feedbackData);
      } else if (feedbackData && Array.isArray((feedbackData as any).feedback)) {
        setActionHistory((feedbackData as any).feedback);
      } else {
        setActionHistory([]);
      }
    } catch (error) {
      console.error('Failed to load action history:', error);
      setActionHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadLearningStats = useCallback(async () => {
    try {
      setLoadingLearning(true);
      setLoadingActivity(true);
      const response = await multiAgentApi.getLearningStats();
      const data = response.data;
      // API returns { success, stats: LearningProfileStats[] }
      const stats = data.stats || [];
      setLearningProfiles(stats);

      // Calculate summary from stats (backend returns rates as decimals 0-1)
      if (stats.length > 0) {
        const total = stats.reduce((sum, s) => sum + s.totalAttempts, 0);
        // Weighted average of approval rates
        const weightedApprovalRate = total > 0
          ? stats.reduce((sum, s) => sum + s.approvalRate * s.totalAttempts, 0) / total
          : 0;
        // Weighted average of success rates
        const weightedSuccessRate = total > 0
          ? stats.reduce((sum, s) => sum + s.successRate * s.totalAttempts, 0) / total
          : 0;

        setLearningSummary({
          totalAttempts: total,
          overallApprovalRate: weightedApprovalRate * 100, // Convert to percentage
          overallSuccessRate: weightedSuccessRate * 100, // Convert to percentage
        });
      }

      // Build agent activity data from LearningProfileStats
      if (stats.length > 0) {
        const agentMap: Record<string, { attempts: number; approvalRateSum: number; types: Set<string> }> = {};
        stats.forEach((s) => {
          if (!agentMap[s.agentName]) {
            agentMap[s.agentName] = { attempts: 0, approvalRateSum: 0, types: new Set() };
          }
          agentMap[s.agentName].attempts += s.totalAttempts;
          agentMap[s.agentName].approvalRateSum += s.approvalRate * s.totalAttempts;
          agentMap[s.agentName].types.add(s.actionType);
        });

        setAgentActivity(
          Object.entries(agentMap).map(([agentName, data]) => ({
            agentName,
            totalAttempts: data.attempts,
            approvalRate: data.attempts > 0 ? (data.approvalRateSum / data.attempts) * 100 : 0,
            actionTypes: Array.from(data.types),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load learning stats:', error);
    } finally {
      setLoadingLearning(false);
      setLoadingActivity(false);
    }
  }, []);

  useEffect(() => {
    loadPendingActions();
    loadLearningStats();
  }, [loadPendingActions, loadLearningStats]);

  // Load agent metadata for tooltips/explanations
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await multiAgentApi.getAgents();
        const map = (res.data?.agents || []).reduce<Record<string, AgentInfo>>((acc, agent) => {
          acc[agent.name] = agent;
          return acc;
        }, {});
        setAgentInfoMap(map);
      } catch (error) {
        console.error('Failed to load agent metadata:', error);
      }
    };
    fetchAgents();
  }, []);

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
      loadPendingActions();
      setNotification({
        open: true,
        message: `Action approved: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'success',
      });
    });

    const unsubRejected = websocketClient.onAiActionRejected((event: RealtimeAiActionEvent) => {
      loadPendingActions();
      setNotification({
        open: true,
        message: `Action rejected: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'warning',
      });
    });

    const unsubExecuted = websocketClient.onAiActionExecuted((event: RealtimeAiActionEvent) => {
      loadPendingActions();
      setNotification({
        open: true,
        message: `Action completed: ${event.actionType.replace(/_/g, ' ')}`,
        severity: 'success',
      });
    });

    const unsubFailed = websocketClient.onAiActionFailed((event: RealtimeAiActionEvent) => {
      loadPendingActions();
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

    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      // Limit messages to prevent memory leak
      return newMessages.length > MAX_MESSAGES ? newMessages.slice(-MAX_MESSAGES) : newMessages;
    });
    setPrompt('');
    setSending(true);

    try {
      const response = await multiAgentApi.processMessage({
        message: userMessage.content,
        sessionId: sessionIdRef.current, // Use ref to avoid race condition
        locale: currentLocale,
      });

      const data: MultiAgentResponse & { sessionId?: string } = response?.data;

      // Defensive checks for response data
      if (!data) {
        throw new Error('Empty response from server');
      }

      // Store session ID from backend for subsequent requests (use ref immediately)
      if (data.sessionId && !sessionIdRef.current) {
        sessionIdRef.current = data.sessionId; // Immediate update for next request
        setSessionId(data.sessionId); // State update for UI if needed
      }

      const pendingIds = data.pendingActionIds || [];
      const contentFromBackend =
        Array.isArray(data.messages) && data.messages.length > 0
          ? data.messages.join('\n')
          : typeof data.messages === 'string'
            ? data.messages
            : '';

      const fallbackPending =
        pendingIds.length > 0
          ? `I've queued ${pendingIds.length} action(s) that may need your approval. Check the Pending Actions panel.`
          : 'No response available.';

      const assistantMessage: Message = {
        role: 'assistant',
        content: contentFromBackend || fallbackPending,
        timestamp: new Date(),
        agentUsed: data.agentUsed,
        intent: data.intent?.intent,
        pendingActionIds: pendingIds,
        knowledgeHits: data.knowledgeHits || [],
        clarifyingQuestions: data.clarifyingQuestions || [],
      };

      setMessages((prev) => {
        const newMessages = [...prev, assistantMessage];
        return newMessages.length > MAX_MESSAGES ? newMessages.slice(-MAX_MESSAGES) : newMessages;
      });

      if (data.pendingActionIds && data.pendingActionIds.length > 0) {
        await loadPendingActions();
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      if (error?.response?.status === 403) {
        setNotification({
          open: true,
          message: 'Session non valida o non autorizzata. Riprova più tardi.',
          severity: 'error',
        });
      } else if (error?.response?.status === 429) {
        setNotification({
          open: true,
          message: 'Rate limit raggiunto. Attendi qualche secondo e riprova.',
          severity: 'warning',
        });
      } else if (error?.response?.status === 400) {
        setNotification({
          open: true,
          message: "Richiesta non valida (controlla l'agente forzato o i parametri).",
          severity: 'error',
        });
      } else {
        setNotification({
          open: true,
          message: 'Errore durante l’elaborazione. Riprova.',
          severity: 'error',
        });
      }
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const newMessages = [...prev, errorMessage];
        return newMessages.length > MAX_MESSAGES ? newMessages.slice(-MAX_MESSAGES) : newMessages;
      });
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
                background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
                <MessageBubble
                  key={index}
                  message={message}
                  agentInfoMap={agentInfoMap}
                  onQuestionClick={(question) => {
                    setPrompt(question);
                    inputRef.current?.focus();
                  }}
                />
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
                background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                '&:hover': {
                  background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${alpha(theme.palette.primary.dark, 0.8)} 100%)`,
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
      <Box
        sx={{
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflow: 'auto',
        }}
      >
        {pendingActions.length > 0 && (
          <Alert
            severity="info"
            sx={{ borderRadius: 1.5 }}
            action={
              <Button size="small" onClick={() => setShowPendingActions(true)}>
                View
              </Button>
            }
          >
            {'Pending actions require your review.'}
          </Alert>
        )}

        {/* Pending Actions Panel */}
        <PendingActionsPanel
          actions={pendingActions}
          loading={loadingActions}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          onRefresh={loadPendingActions}
          agentInfoMap={agentInfoMap}
          defaultExpanded={showPendingActions}
          onError={(error, _actionId, type) => {
            setNotification({
              open: true,
              message: `Failed to ${type} action: ${error.message}`,
              severity: 'error',
            });
          }}
        />

        {/* Learning Progress Card */}
        <LearningProgressCard
          profiles={learningProfiles}
          summary={learningSummary}
          loading={loadingLearning}
          onRefresh={loadLearningStats}
          defaultExpanded={false}
        />

        {/* Agent Activity Chart */}
        <AgentActivityChart
          data={agentActivity}
          loading={loadingActivity}
          onRefresh={loadLearningStats}
          defaultExpanded={false}
        />

        {/* Action History */}
        <Paper
          sx={{
            borderRadius: 1.5,
            border: 1,
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <Box
            onClick={() => setShowHistory(!showHistory)}
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              borderBottom: showHistory ? 1 : 0,
              borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
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
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); loadActionHistory(); }} disabled={loadingHistory}>
                  <RefreshCw size={16} className={loadingHistory ? 'animate-spin' : ''} />
                </IconButton>
              </Tooltip>
              <IconButton size="small">
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
              ) : !Array.isArray(actionHistory) || actionHistory.length === 0 ? (
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
                          <CheckCircle size={14} color={theme.palette.success.main} style={{ marginTop: 2, flexShrink: 0 }} />
                        ) : (
                          <XCircle size={14} color={theme.palette.error.main} style={{ marginTop: 2, flexShrink: 0 }} />
                        )
                      ) : (
                        <XCircle size={14} color={theme.palette.warning.main} style={{ marginTop: 2, flexShrink: 0 }} />
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
        </Paper>

        {/* Tips */}
        <Paper
          sx={{
            p: 2,
            borderRadius: 1.5,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <AlertTriangle size={14} color={theme.palette.warning.main} style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              High severity actions require approval. Low severity actions may auto-execute based on confidence.
            </Typography>
          </Box>
        </Paper>
      </Box>

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
