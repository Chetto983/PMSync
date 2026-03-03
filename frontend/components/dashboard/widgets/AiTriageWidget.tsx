/**
 * AiTriageWidget - Shows AI-triaged emails sorted by priority
 *
 * Displays emails that have been automatically analyzed by AI for priority
 * and labeling. Shows priority level (1-5 scale) and AI-suggested labels.
 */

'use client';

import { useTriagedEmails } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Box,
  Chip,
  Button,
} from '@mui/material';
import { Zap, Inbox, AlertTriangle, AlertCircle, MinusCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Priority to color mapping (1 = highest, 5 = lowest)
const PRIORITY_CONFIG: Record<number, { color: 'error' | 'warning' | 'info' | 'success' | 'default'; icon: React.ReactNode; label: string }> = {
  1: { color: 'error', icon: <AlertTriangle size={14} />, label: 'Critical' },
  2: { color: 'warning', icon: <AlertCircle size={14} />, label: 'High' },
  3: { color: 'info', icon: <MinusCircle size={14} />, label: 'Medium' },
  4: { color: 'success', icon: <CheckCircle2 size={14} />, label: 'Low' },
  5: { color: 'default', icon: <CheckCircle2 size={14} />, label: 'Minimal' },
};

export function AiTriageWidget() {
  const t = useTranslations();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useTriagedEmails({ limit: 5 });

  const handleViewAll = () => {
    router.push('/dashboard/email?filter=triaged');
  };

  const handleEmailClick = (emailId: string) => {
    router.push(`/dashboard/email?id=${emailId}`);
  };

  const getPriorityConfig = (priority: number) => {
    return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[3];
  };

  const getFromDisplay = (from: string | { name?: string; email?: string }): string => {
    if (typeof from === 'string') return from;
    return from?.name || from?.email || 'Unknown';
  };

  return (
    <BaseWidget
      id="ai-triage"
      title={t.dashboard.widgets.aiTriage?.title || 'AI Triage'}
      loading={isLoading}
      error={error?.message}
      rawError={error}
      onRefresh={() => refetch()}
      icon={<Zap size={18} />}
      badge={data?.total || undefined}
      actions={
        data && data.emails.length > 0 ? (
          <Button size="small" onClick={handleViewAll}>
            {t.dashboard.widgets.aiTriage?.viewAll || 'View All'}
          </Button>
        ) : undefined
      }
    >
      {data && data.emails.length > 0 ? (
        <List dense disablePadding>
          {data.emails.map((email) => {
            const priorityConfig = getPriorityConfig(email.aiPriority);
            return (
              <ListItem
                key={email.id}
                disablePadding
                sx={{
                  mb: 1,
                  cursor: 'pointer',
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                  px: 1,
                  py: 0.5,
                }}
                onClick={() => handleEmailClick(email.id)}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Chip
                    size="small"
                    label={email.aiPriority}
                    color={priorityConfig.color}
                    sx={{ width: 24, height: 24, fontSize: '0.7rem', fontWeight: 600 }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          fontWeight: email.isRead ? 400 : 600,
                          flex: 1,
                        }}
                      >
                        {email.subject}
                      </Typography>
                      {email.aiLabels && email.aiLabels.length > 0 && (
                        <Chip
                          label={email.aiLabels[0]}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.6rem' }}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" noWrap color="text.secondary" sx={{ flex: 1 }}>
                        {getFromDisplay(email.from)}
                      </Typography>
                      {email.aiPriorityReason && (
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          noWrap
                          sx={{ maxWidth: 120 }}
                          title={email.aiPriorityReason}
                        >
                          {email.aiPriorityReason.length > 20
                            ? email.aiPriorityReason.slice(0, 20) + '...'
                            : email.aiPriorityReason}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 3,
            color: 'text.secondary',
          }}
        >
          <Inbox size={32} strokeWidth={1.5} />
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
            {t.dashboard.widgets.aiTriage?.empty || 'No triaged emails'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center' }}>
            {t.dashboard.widgets.aiTriage?.emptyDescription || 'Enable Auto-Triage in AI Settings to automatically prioritize incoming emails'}
          </Typography>
        </Box>
      )}
    </BaseWidget>
  );
}
