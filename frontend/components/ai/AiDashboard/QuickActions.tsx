'use client';

import React from 'react';
import { Box, Typography, Paper, Chip, Stack, alpha, useTheme } from '@mui/material';
import {
  Mail,
  Calendar,
  Users,
  FileText,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Reply,
  PenLine,
  CheckSquare,
  Clock,
  AlertTriangle,
  Bell,
  Minimize2,
  Check,
  Archive,
  Tag,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ViewContext } from '@/hooks/use-voltagent-chat';
import { useEmailChatActions } from '@/hooks/use-email-chat-actions';

/**
 * Prompt suggestion from backend or static fallback.
 */
interface PromptSuggestion {
  label: string;
  prompt: string;
  icon: string;
}

interface QuickActionsProps {
  onSelectQuery: (query: string) => void;
  userName: string;
  viewContext?: ViewContext;
  customPrompts?: PromptSuggestion[];
}

/**
 * Icon mapping for dynamic prompts from backend.
 * Maps icon name string to lucide-react component.
 */
const iconMap: Record<string, React.ElementType> = {
  Mail,
  Calendar,
  Users,
  FileText,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Reply,
  PenLine,
  CheckSquare,
  Clock,
  AlertTriangle,
  Bell,
  Minimize2,
  Check,
  Archive,
  Tag,
};

export function QuickActions({ onSelectQuery, userName, viewContext, customPrompts }: QuickActionsProps) {
  const theme = useTheme();
  const t = useTranslations();

  // Email-specific actions when viewing a thread
  const emailActions = useEmailChatActions(viewContext);

  // Static default prompts (used when no customPrompts provided)
  // All colors use theme.palette.* per CLAUDE.md rules (no hardcoded hex)
  const staticQuickActions = [
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
      color: theme.palette.secondary.main,
    },
    {
      icon: Users,
      label: t.ai?.quickActions?.pendingFollowUps || 'Pending follow-ups',
      prompt: t.dashboard?.widgets?.followUps?.title || 'What follow-ups do I need to do?',
      color: theme.palette.info.main,
    },
    {
      icon: FileText,
      label: t.ai?.quickActions?.writeEmail || 'Write an email',
      prompt: t.ai?.examples?.email?.draftReply || 'Write a professional email',
      color: theme.palette.success.main,
    },
    {
      icon: TrendingUp,
      label: t.ai?.quickActions?.analyzeContacts || 'Analyze contacts',
      prompt: t.ai?.examples?.contacts?.findContact || 'Analyze my most active contacts',
      color: theme.palette.warning.main,
    },
    {
      icon: Sparkles,
      label: t.ai?.quickActions?.aiSuggestions || 'AI suggestions',
      prompt: t.ai?.chat?.howCanIHelp || 'What actions do you suggest today?',
      color: theme.palette.error.main,
    },
  ];

  // Use customPrompts from backend when available, otherwise use static prompts
  const quickActions = customPrompts?.length
    ? customPrompts.map((p) => ({
        icon: iconMap[p.icon] || Sparkles,
        label: p.label,
        prompt: p.prompt,
        color: theme.palette.primary.main,
      }))
    : staticQuickActions;

  return (
    <Box sx={{ py: 4 }}>
      {/* Welcome Message */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: 3,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
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

      {/* Email Context Actions - only when viewing thread */}
      {emailActions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t.ai?.emailActions?.sectionTitle || 'Email Actions'}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {emailActions.map((action, idx) => {
              const ActionIcon = action.icon;
              return (
                <Chip
                  key={idx}
                  icon={<ActionIcon size={14} />}
                  label={action.label}
                  onClick={() => onSelectQuery(action.prompt)}
                  variant="outlined"
                  size="small"
                  sx={{
                    borderColor: alpha(action.color, 0.5),
                    '& .MuiChip-icon': { color: action.color },
                    '&:hover': {
                      bgcolor: alpha(action.color, 0.08),
                      borderColor: action.color,
                    },
                  }}
                />
              );
            })}
          </Stack>
        </Box>
      )}

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
              component={motion.div}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
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
