'use client';

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Skeleton,
  Button,
  alpha,
  LinearProgress,
} from '@mui/material';
import { Users, AlertTriangle, Mail, ArrowRight, TrendingDown, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useStaleContacts, type StaleContact } from '@/hooks/queries';

interface CrmAlertsWidgetProps {
  limit?: number;
  showHeader?: boolean;
}

export function CrmAlertsWidget({ limit = 5, showHeader = true }: CrmAlertsWidgetProps) {
  const router = useRouter();
  const t = useTranslations();
  const { data, isLoading } = useStaleContacts({ limit });

  const wt = t.dashboard.widgets.crm;

  const formatLastContact = (lastInteraction: string) => {
    const date = new Date(lastInteraction);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 30) return wt.daysAgo.replace('{days}', String(days));
    if (days < 60) return wt.monthAgo;
    if (days < 365) return wt.monthsAgo.replace('{months}', String(Math.floor(days / 30)));
    const years = Math.floor(days / 365);
    return years === 1 ? wt.yearAgo : wt.yearsAgo.replace('{years}', String(years));
  };

  const getScoreColor = (score: number): 'success' | 'warning' | 'error' => {
    if (score >= 70) return 'success';
    if (score >= 40) return 'warning';
    return 'error';
  };

  const handleClick = (contact: StaleContact) => {
    router.push(`/dashboard/contacts?id=${contact.id}`);
  };

  const handleReconnect = (e: React.MouseEvent, contact: StaleContact) => {
    e.stopPropagation();
    router.push(`/dashboard/email?compose=true&to=${encodeURIComponent(contact.email)}`);
  };

  const contacts = data?.contacts || [];
  const totalStale = data?.total || 0;
  const averageScore = data?.averageScore || 0;

  return (
    <Box
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {showHeader && (
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'error.main',
            }}
          >
            <Users size={18} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {wt.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalStale > 0
                ? `${totalStale > 1
                    ? wt.subtitlePlural.replace('{count}', String(totalStale))
                    : wt.subtitle.replace('{count}', String(totalStale))} • ${wt.avgScore.replace('{score}', String(averageScore))}`
                : wt.allActive}
            </Typography>
          </Box>
          {totalStale > 0 && (
            <Chip
              icon={<TrendingDown size={12} />}
              label={totalStale}
              size="small"
              color="warning"
            />
          )}
        </Box>
      )}

      {isLoading ? (
        <Box sx={{ p: 2 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="60%" height={20} />
                <Skeleton width="40%" height={16} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : contacts.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle2 size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {wt.allActive}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {wt.greatJob}
          </Typography>
        </Box>
      ) : (
        <List sx={{ p: 0 }}>
          {contacts.map((contact) => (
            <ListItemButton
              key={contact.id}
              onClick={() => handleClick(contact)}
              sx={{
                py: 1.5,
                px: 2,
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-child': { borderBottom: 0 },
              }}
            >
              <ListItemAvatar sx={{ minWidth: 44 }}>
                <Avatar sx={{ width: 36, height: 36, fontSize: '0.875rem' }}>
                  {contact.name?.[0]?.toUpperCase() || 'U'}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                      {contact.name}
                    </Typography>
                    {contact.daysSinceContact > 60 && (
                      <AlertTriangle size={14} color="orange" />
                    )}
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {contact.company || contact.email}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <LinearProgress
                        variant="determinate"
                        value={contact.relationshipScore}
                        color={getScoreColor(contact.relationshipScore)}
                        sx={{ flex: 1, height: 4, borderRadius: 2 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {contact.relationshipScore}%
                      </Typography>
                    </Box>
                  </Box>
                }
              />
              <Box sx={{ ml: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {formatLastContact(contact.lastInteraction)}
                </Typography>
                <Chip
                  icon={<Mail size={10} />}
                  label={wt.reconnect}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={(e) => handleReconnect(e, contact)}
                  sx={{ fontSize: '0.6rem', height: 20 }}
                />
              </Box>
            </ListItemButton>
          ))}
        </List>
      )}

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          size="small"
          endIcon={<ArrowRight size={14} />}
          onClick={() => router.push('/dashboard/contacts?filter=stale')}
        >
          {wt.viewAll}
        </Button>
      </Box>
    </Box>
  );
}

export default CrmAlertsWidget;
