'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Skeleton,
  Collapse,
  alpha,
  Chip,
} from '@mui/material';
import {
  Sun,
  Moon,
  Sunset,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Clock,
  Bell,
  Users,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useBriefing } from '@/hooks/queries';

interface DailyBriefingProps {
  userName?: string;
  onDismiss?: () => void;
}

// Check if dismissed for today (runs once at module load, safe for SSR)
function getInitialDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissedDate = localStorage.getItem('briefing-dismissed');
  return dismissedDate === new Date().toDateString();
}

export function DailyBriefing({ userName, onDismiss }: DailyBriefingProps) {
  const t = useTranslations();
  const { data: briefing, isLoading, refetch, isRefetching } = useBriefing();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(getInitialDismissed);

  const getTimeIcon = () => {
    const hour = new Date().getHours();
    if (hour < 12) return <Sun size={20} />;
    if (hour < 18) return <Sunset size={20} />;
    return <Moon size={20} />;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = userName || 'there';
    if (hour < 12) return `${t.greetings.morning}, ${name}!`;
    if (hour < 18) return `${t.greetings.afternoon}, ${name}!`;
    return `${t.greetings.evening}, ${name}!`;
  };

  const handleDismiss = () => {
    localStorage.setItem('briefing-dismissed', new Date().toDateString());
    setDismissed(true);
    onDismiss?.();
  };

  const handleRefresh = () => {
    refetch();
  };

  // Build summary from data
  const buildSummary = () => {
    if (!briefing) return '';

    const wt = t.dashboard.widgets.briefing;
    const parts: string[] = [];

    if (briefing.urgentEmails > 0) {
      parts.push(`${briefing.urgentEmails} ${briefing.urgentEmails > 1 ? wt.urgentEmailsPlural : wt.urgentEmails}`);
    }
    if (briefing.deadlinesToday > 0) {
      parts.push(`${briefing.deadlinesToday} ${briefing.deadlinesToday > 1 ? wt.deadlinesPlural : wt.deadlines} ${wt.today}`);
    }
    if (briefing.pendingFollowUps > 0) {
      parts.push(`${briefing.pendingFollowUps} ${briefing.pendingFollowUps > 1 ? wt.followUpsPlural : wt.followUps}`);
    }
    if (briefing.staleContacts > 0) {
      parts.push(`${briefing.staleContacts} ${briefing.staleContacts > 1 ? wt.staleContactsPlural : wt.staleContacts}`);
    }

    if (parts.length === 0) return wt.noItems;
    return parts.join(', ');
  };

  if (dismissed) return null;

  const wt = t.dashboard.widgets.briefing;

  return (
    <Box
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        mb: 3,
        background: (theme) =>
          `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha('#7c3aed', 0.08)} 100%)`,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: expanded ? 1 : 0,
          borderColor: 'divider',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          {getTimeIcon()}
        </Box>

        <Box sx={{ flex: 1 }}>
          {isLoading ? (
            <>
              <Skeleton width={200} height={24} />
              <Skeleton width={150} height={16} />
            </>
          ) : (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Sparkles size={16} />
                {wt.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {getGreeting()}
              </Typography>
            </>
          )}
        </Box>

        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleRefresh();
          }}
          disabled={isRefetching}
          sx={{ mr: 0.5 }}
        >
          <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
        </IconButton>

        <IconButton size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </IconButton>

        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          sx={{ ml: 0.5 }}
        >
          <X size={16} />
        </IconButton>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2 }}>
          {isLoading ? (
            <>
              <Skeleton width="100%" height={24} sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} width={80} height={32} sx={{ borderRadius: 2 }} />
                ))}
              </Box>
            </>
          ) : (
            <>
              {/* Summary */}
              <Typography variant="body2" sx={{ mb: 2 }}>
                {briefing?.summary || buildSummary()}
              </Typography>

              {/* Stats Chips */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {briefing && briefing.urgentEmails > 0 && (
                  <Chip
                    icon={<Mail size={14} />}
                    label={`${briefing.urgentEmails} ${wt.urgentEmails}`}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                )}
                {briefing && briefing.deadlinesToday > 0 && (
                  <Chip
                    icon={<Clock size={14} />}
                    label={`${briefing.deadlinesToday} ${briefing.deadlinesToday > 1 ? wt.deadlinesPlural : wt.deadlines}`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                )}
                {briefing && briefing.pendingFollowUps > 0 && (
                  <Chip
                    icon={<Bell size={14} />}
                    label={`${briefing.pendingFollowUps} ${briefing.pendingFollowUps > 1 ? wt.followUpsPlural : wt.followUps}`}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                )}
                {briefing && briefing.staleContacts > 0 && (
                  <Chip
                    icon={<Users size={14} />}
                    label={`${briefing.staleContacts} ${briefing.staleContacts > 1 ? wt.staleContactsPlural : wt.staleContacts}`}
                    size="small"
                    color="default"
                    variant="outlined"
                  />
                )}
                {briefing &&
                  briefing.urgentEmails === 0 &&
                  briefing.deadlinesToday === 0 &&
                  briefing.pendingFollowUps === 0 &&
                  briefing.staleContacts === 0 && (
                  <Chip
                    icon={<AlertTriangle size={14} />}
                    label={wt.noItems}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
              </Box>

              {/* Highlights */}
              {briefing?.highlights && briefing.highlights.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                    {wt.todaysHighlights}
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
                    {briefing.highlights.map((highlight, idx) => (
                      <Typography key={idx} component="li" variant="body2" color="text.secondary">
                        {highlight}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                <Button size="small" variant="outlined" onClick={handleDismiss}>
                  {wt.dismiss}
                </Button>
                <Button size="small" variant="contained">
                  {wt.showDetails}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default DailyBriefing;
