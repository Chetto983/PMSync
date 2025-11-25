import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Divider,
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
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { multiAgentApi, type MultiAgentResponse, type PendingAction } from '@/lib/api/multi-agent';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agentUsed?: string;
  intent?: string;
  pendingActionIds?: string[];
};

function AiAssistantView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [showPendingActions, setShowPendingActions] = useState(true);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  useEffect(() => {
    loadPendingActions();
  }, [loadPendingActions]);

  const handleSendPrompt = async () => {
    if (!prompt.trim() || sending) return;

    const userMessage: Message = {
      role: 'user',
      content: prompt.trim(),
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

      // Refresh pending actions if any were created
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
        return <Mail size={16} />;
      case 'CalendarAgent':
        return <Calendar size={16} />;
      case 'ContactsAgent':
        return <Users size={16} />;
      default:
        return <Bot size={16} />;
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
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={24} color="white" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                AI Assistant
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Multi-agent system • Email, Calendar, Contacts
              </Typography>
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
          {messages.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Sparkles size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
              <Typography variant="h6" gutterBottom>
                How can I help you today?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Ask me to help with emails, calendar events, or contacts.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" gap={1}>
                <Chip
                  label="Summarize my unread emails"
                  onClick={() => setPrompt('Summarize my unread emails')}
                  variant="outlined"
                />
                <Chip
                  label="Schedule a meeting tomorrow"
                  onClick={() => setPrompt('Schedule a meeting tomorrow at 2pm')}
                  variant="outlined"
                />
                <Chip
                  label="Find contact info for John"
                  onClick={() => setPrompt('Find contact info for John')}
                  variant="outlined"
                />
              </Stack>
            </Box>
          )}

          {messages.map((message, index) => (
            <Box
              key={index}
              sx={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
              }}
            >
              <Box
                sx={{
                  backgroundColor:
                    message.role === 'user' ? 'primary.main' : 'action.hover',
                  color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  borderRadius: 2,
                  p: 2,
                }}
              >
                {message.role === 'assistant' && message.agentUsed && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {getAgentIcon(message.agentUsed)}
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {message.agentUsed}
                    </Typography>
                    {message.intent && (
                      <Chip label={message.intent} size="small" variant="outlined" />
                    )}
                  </Box>
                )}
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {message.content}
                </Typography>
                {message.pendingActionIds && message.pendingActionIds.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Chip
                      icon={<Clock size={14} />}
                      label={`${message.pendingActionIds.length} action(s) pending approval`}
                      size="small"
                      color="warning"
                    />
                  </Box>
                )}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, px: 1 }}
              >
                {message.timestamp.toLocaleTimeString()}
              </Typography>
            </Box>
          ))}

          {sending && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Thinking...
              </Typography>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Box>

        {/* Input Area */}
        <Divider />
        <Box sx={{ p: 3, display: 'flex', gap: 2 }}>
          <TextField
            fullWidth
            placeholder="Ask me anything about your emails, calendar, or contacts..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendPrompt()}
            disabled={sending}
            multiline
            maxRows={4}
          />
          <Button
            variant="contained"
            endIcon={<Send size={18} />}
            onClick={handleSendPrompt}
            disabled={sending || !prompt.trim()}
            sx={{ minWidth: 100 }}
          >
            Send
          </Button>
        </Box>
      </Paper>

      {/* Pending Actions Sidebar */}
      <Paper
        sx={{
          width: 320,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Badge badgeContent={pendingActions.length} color="warning">
              <Clock size={20} />
            </Badge>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
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
                <CheckCircle size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                <Typography variant="body2" color="text.secondary">
                  No pending actions
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {pendingActions.map((action) => (
                  <Card key={action.id} variant="outlined">
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Chip
                          label={formatActionType(action.actionType)}
                          size="small"
                          color={getSeverityColor(action.severity) as any}
                        />
                        <Chip
                          label={action.agentName}
                          size="small"
                          variant="outlined"
                          icon={getAgentIcon(action.agentName)}
                        />
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Confidence: {Math.round((action.adjustedConfidence || action.confidence) * 100)}%
                      </Typography>

                      <Typography variant="body2" sx={{ mb: 2, fontSize: '0.8rem' }}>
                        {JSON.stringify(action.payload, null, 2).slice(0, 100)}...
                      </Typography>

                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircle size={14} />}
                          onClick={() => handleApproveAction(action.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<XCircle size={14} />}
                          onClick={() => handleRejectAction(action.id)}
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

        {/* Quick Tips */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            <AlertTriangle size={12} style={{ marginRight: 4 }} />
            High severity actions require manual approval. Low severity actions may auto-execute.
          </Typography>
        </Box>
      </Paper>
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

// Force SSR to avoid build-time errors with useRouter
export async function getServerSideProps() {
  return { props: {} };
}
