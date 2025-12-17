'use client';

import React from 'react';
import { Box, Typography, Paper, alpha, useTheme } from '@mui/material';
import { Mail, Calendar, Users, FileText, Sparkles, TrendingUp } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface QuickActionsProps {
  onSelectQuery: (query: string) => void;
  userName: string;
}

export function QuickActions({ onSelectQuery, userName }: QuickActionsProps) {
  const theme = useTheme();
  const t = useTranslations();

  const quickActions = [
    {
      icon: Mail,
      label: t.ai?.quickActions?.summarizeInbox || 'Summarize inbox',
      prompt: t.ai?.examples?.email?.summarize || 'Summarize my unread emails',
      color: theme.palette.primary.main,
    },
    {
      icon: Calendar,
      label: t.ai?.quickActions?.todaySchedule || "Today's schedule",
      prompt: t.ai?.examples?.calendar?.todayAgenda || "What's on my agenda today?",
      color: '#7c3aed',
    },
    {
      icon: Users,
      label: t.ai?.quickActions?.pendingFollowUps || 'Pending follow-ups',
      prompt: t.dashboard?.widgets?.followUps?.title || 'What follow-ups do I need to do?',
      color: '#0ea5e9',
    },
    {
      icon: FileText,
      label: t.ai?.quickActions?.writeEmail || 'Write an email',
      prompt: t.ai?.examples?.email?.draftReply || 'Write a professional email',
      color: '#10b981',
    },
    {
      icon: TrendingUp,
      label: t.ai?.quickActions?.analyzeContacts || 'Analyze contacts',
      prompt: t.ai?.examples?.contacts?.findContact || 'Analyze my most active contacts',
      color: '#f59e0b',
    },
    {
      icon: Sparkles,
      label: t.ai?.quickActions?.aiSuggestions || 'AI suggestions',
      prompt: t.ai?.chat?.howCanIHelp || 'What actions do you suggest today?',
      color: '#ec4899',
    },
  ];

  return (
    <Box sx={{ py: 4 }}>
      {/* Welcome Message */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: 3,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
            boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}`,
          }}
        >
          <Sparkles size={32} color="white" />
        </Box>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            mb: 1,
            background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {(t.ai?.dashboard?.greeting || 'Hi {userName}!').replace('{userName}', userName)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t.ai?.dashboard?.greetingQuestion || 'How can I help you today?'}
        </Typography>
      </Box>

      {/* Quick Action Grid */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        }}
      >
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <Paper
              key={index}
              elevation={0}
              onClick={() => onSelectQuery(action.prompt)}
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.08),
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: alpha(action.color, 0.3),
                  bgcolor: alpha(action.color, 0.04),
                  transform: 'translateY(-2px)',
                  boxShadow: `0 8px 24px ${alpha(action.color, 0.15)}`,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: alpha(action.color, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: action.color,
                  }}
                >
                  <Icon size={20} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {action.label}
                </Typography>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}

export default QuickActions;
