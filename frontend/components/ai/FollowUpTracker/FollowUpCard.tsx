'use client';

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  alpha,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Check,
  Clock,
  Mail,
  MoreVertical,
  AlertTriangle,
  Calendar,
  Bell,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailFollowUp, EmailFollowUpStatus } from '@/hooks/queries';

interface FollowUpCardProps {
  followUp: EmailFollowUp;
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  isResolving?: boolean;
}

const STATUS_COLORS: Record<EmailFollowUpStatus, 'warning' | 'info' | 'success' | 'error'> = {
  PENDING: 'warning',
  REMINDED: 'info',
  RESOLVED: 'success',
  EXPIRED: 'error',
};

export function FollowUpCard({
  followUp,
  onResolve,
  onSnooze,
  onViewEmail,
  isResolving,
}: FollowUpCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleResolve = () => {
    handleMenuClose();
    if (onResolve) {
      onResolve(followUp.id);
    }
  };

  const handleSnooze = () => {
    handleMenuClose();
    if (onSnooze) {
      onSnooze(followUp.id);
    }
  };

  const handleViewEmail = () => {
    handleMenuClose();
    if (onViewEmail && followUp.emailId) {
      onViewEmail(followUp.emailId);
    }
  };

  // Calculate if overdue or due today
  const now = new Date();
  const dueDate = followUp.dueDate ? new Date(followUp.dueDate) : null;
  const isOverdue = dueDate && dueDate < now && followUp.status === 'PENDING';
  const isDueToday = dueDate &&
    dueDate.toDateString() === now.toDateString() &&
    followUp.status === 'PENDING';

  // Format date
  const formattedDate = dueDate
    ? dueDate.toLocaleDateString(t.locale, {
        month: 'short',
        day: 'numeric',
        year: dueDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      })
    : null;

  const statusColor = STATUS_COLORS[followUp.status] || 'warning';
  const statusLabel = t.ai.followUpTracker.status[followUp.status] || followUp.status;

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: isOverdue
          ? alpha(theme.palette.error.main, 0.3)
          : alpha(theme.palette.divider, 0.1),
        borderRadius: 3,
        transition: 'all 0.2s ease',
        bgcolor: isOverdue
          ? alpha(theme.palette.error.main, 0.02)
          : 'background.paper',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.3),
          boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.06)}`,
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={statusLabel}
              color={statusColor}
              sx={{
                fontWeight: 500,
                fontSize: '0.7rem',
                height: 24,
              }}
            />
            {isOverdue && (
              <Chip
                size="small"
                icon={<AlertTriangle size={12} />}
                label={t.ai.followUpTracker.overdueWarning}
                color="error"
                variant="outlined"
                sx={{ height: 24, fontSize: '0.7rem' }}
              />
            )}
            {isDueToday && !isOverdue && (
              <Chip
                size="small"
                icon={<Clock size={12} />}
                label={t.ai.followUpTracker.dueTodayWarning}
                color="warning"
                variant="outlined"
                sx={{ height: 24, fontSize: '0.7rem' }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {followUp.status === 'PENDING' && (
              <Tooltip title={t.ai.followUpTracker.actions.resolve}>
                <IconButton
                  size="small"
                  onClick={handleResolve}
                  disabled={isResolving}
                  sx={{
                    opacity: 0.6,
                    '&:hover': { opacity: 1, color: 'success.main' },
                  }}
                >
                  <Check size={16} />
                </IconButton>
              </Tooltip>
            )}
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
            >
              <MoreVertical size={16} />
            </IconButton>
          </Box>
        </Box>

        {/* Email Subject */}
        {followUp.email?.subject && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: 'text.primary',
              mb: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {followUp.email.subject}
          </Typography>
        )}

        {/* From */}
        {followUp.email?.from && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1 }}
          >
            {followUp.email.from}
          </Typography>
        )}

        {/* Reason */}
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.5,
            mb: 1,
          }}
        >
          {followUp.reason || t.ai.followUpTracker.noReason}
        </Typography>

        {/* Footer */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {formattedDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Calendar size={12} color={theme.palette.text.secondary} />
              <Typography variant="caption" color="text.secondary">
                {t.ai.followUpTracker.dueDate}: {formattedDate}
              </Typography>
            </Box>
          )}
          {(followUp.reminderCount ?? 0) > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Bell size={12} color={theme.palette.text.secondary} />
              <Typography variant="caption" color="text.secondary">
                {followUp.reminderCount} {t.ai.followUpTracker.reminderCount.toLowerCase()}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Actions Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          {followUp.status === 'PENDING' && (
            <MenuItem onClick={handleResolve}>
              <ListItemIcon>
                <Check size={16} />
              </ListItemIcon>
              <ListItemText>{t.ai.followUpTracker.actions.resolve}</ListItemText>
            </MenuItem>
          )}
          {followUp.status === 'PENDING' && (
            <MenuItem onClick={handleSnooze}>
              <ListItemIcon>
                <Clock size={16} />
              </ListItemIcon>
              <ListItemText>{t.ai.followUpTracker.actions.snooze}</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={handleViewEmail}>
            <ListItemIcon>
              <Mail size={16} />
            </ListItemIcon>
            <ListItemText>{t.ai.followUpTracker.actions.view}</ListItemText>
          </MenuItem>
        </Menu>
      </CardContent>
    </Card>
  );
}

export default FollowUpCard;
