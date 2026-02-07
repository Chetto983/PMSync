'use client';

/**
 * Email Chat Actions Hook
 *
 * Returns context-aware email quick actions based on ViewContext.
 * Used by QuickActions to show email-specific chips when viewing a thread.
 *
 * @module 06-01: Context-aware email quick actions
 */

import type { ElementType } from 'react';
import { useTheme } from '@mui/material';
import { Reply, FileText, Archive, Tag } from 'lucide-react';

import { useTranslations } from '@/lib/hooks/use-translations';
import type { ViewContext } from '@/hooks/use-voltagent-chat';

/**
 * Email-specific quick action configuration
 */
export interface EmailChatAction {
  icon: ElementType;
  label: string;
  prompt: string;
  color: string;
}

/**
 * Returns email-specific quick actions when user is viewing a thread.
 *
 * @param viewContext - Current view context from useVoltAgentChat
 * @returns Array of email actions (empty if not in thread view)
 */
export function useEmailChatActions(viewContext: ViewContext | undefined): EmailChatAction[] {
  const t = useTranslations();
  const theme = useTheme();

  // Only return actions when viewing an email thread
  if (viewContext?.currentView !== 'thread' || !viewContext?.selectedEmailId) {
    return [];
  }

  return [
    {
      icon: Reply,
      label: t.ai?.emailActions?.reply || 'Draft reply',
      prompt: 'Draft a professional reply to this email',
      color: theme.palette.primary.main,
    },
    {
      icon: FileText,
      label: t.ai?.emailActions?.summarize || 'Summarize thread',
      prompt: 'Summarize this email thread concisely',
      color: theme.palette.secondary.main,
    },
    {
      icon: Archive,
      label: t.ai?.emailActions?.archive || 'Archive email',
      prompt: 'Archive this email',
      color: theme.palette.success.main,
    },
    {
      icon: Tag,
      label: t.ai?.emailActions?.addLabel || 'Add label',
      prompt: 'Suggest appropriate labels for this email',
      color: theme.palette.warning.main,
    },
  ];
}

export default useEmailChatActions;
