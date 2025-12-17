'use client';

/**
 * AI Dashboard - Modern 2025 Design
 * Clean, widget-based layout following main dashboard pattern
 */

import React, { Suspense, lazy, useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Chip,
  Stack,
  Skeleton,
  alpha,
  useTheme,
} from '@mui/material';
import { Sparkles, Send, Zap } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAuth } from '@/lib/hooks/use-auth';

// Lazy loaded widgets
const ChatMessages = lazy(() => import('./ChatMessages'));
const QuickActions = lazy(() => import('./QuickActions'));
const PendingActionsWidget = lazy(() => import('./PendingActionsWidget'));
const LearningWidget = lazy(() => import('./LearningWidget'));
const AiMemoryWidget = lazy(() => import('./AiMemoryWidget'));

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';

  const handleSendMessage = useCallback(async (customPrompt?: string) => {
    const text = customPrompt || prompt.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setPrompt('');
    setSending(true);

    try {
      // Dynamic import to avoid circular deps
      const { multiAgentApi } = await import('@/lib/api/ai');
      const response = await multiAgentApi.processMessage({
        message: text,
        locale: t.locale,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.messages?.join('\n') || response.text || t.ai?.chat?.error || 'No response',
        timestamp: new Date(),
        agentUsed: response.agentUsed,
        intent: response.intent?.intent,
        pendingActionIds: response.pendingActionIds || [],
      };

      setMessages(prev => [...prev, assistantMessage]);
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
  }, [prompt, sending, t]);

  return (
    <Box
      sx={{
        maxWidth: 1800,
        mx: 'auto',
        px: { xs: 2, sm: 3, md: 4 },
        pb: 4,
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <Box sx={{ pt: { xs: 2, md: 3 }, pb: { xs: 3, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}`,
            }}
          >
            <Sparkles size={28} color="white" />
          </Box>
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.5rem', md: '2rem' },
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.ai?.title || 'Assistente AI'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t.ai?.subtitle || 'Email • Calendario • Contatti'}
            </Typography>
          </Box>
          <Chip
            icon={<Zap size={14} />}
            label={t.ai?.online || 'Online'}
            size="small"
            color="success"
            sx={{ ml: 'auto', fontWeight: 600 }}
          />
        </Box>
      </Box>

      {/* Main Grid */}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' },
        }}
      >
        {/* Chat Area */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            border: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.08),
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: { xs: 500, md: 600 },
          }}
        >
          {/* Chat Messages */}
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
            {messages.length === 0 ? (
              <Suspense fallback={<WidgetSkeleton height={300} />}>
                <QuickActions onSelectQuery={handleSendMessage} userName={userName} />
              </Suspense>
            ) : (
              <Suspense fallback={<WidgetSkeleton height={300} />}>
                <ChatMessages messages={messages} sending={sending} />
              </Suspense>
            )}
          </Box>

          {/* Input Area */}
          <Box
            sx={{
              p: 2,
              borderTop: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.08),
              bgcolor: alpha(theme.palette.background.default, 0.5),
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
                    sx={{ fontSize: '0.75rem', cursor: 'pointer' }}
                  />
                ))}
              </Stack>
            )}

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                fullWidth
                placeholder={t.ai?.inputPlaceholder || 'Chiedimi qualsiasi cosa...'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={sending}
                multiline
                maxRows={4}
                inputRef={inputRef}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                  },
                }}
              />
              <Button
                variant="contained"
                onClick={() => handleSendMessage()}
                disabled={sending || !prompt.trim()}
                sx={{
                  minWidth: 52,
                  height: 52,
                  borderRadius: 3,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, #6d28d9 100%)`,
                  },
                }}
              >
                {sending ? <CircularProgress size={22} color="inherit" /> : <Send size={22} />}
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Sidebar Widgets */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Suspense fallback={<WidgetSkeleton height={250} />}>
            <PendingActionsWidget />
          </Suspense>

          <Suspense fallback={<WidgetSkeleton height={200} />}>
            <LearningWidget />
          </Suspense>

          <Suspense fallback={<WidgetSkeleton height={260} />}>
            <AiMemoryWidget />
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}

export default AiDashboard;
