import React from 'react';
import {
  Box,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Chip,
  CircularProgress,
  Button,
  useTheme,
} from '@mui/material';
import { AlertTriangle, Sparkles, XCircle, Check } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { PendingAction } from '@/lib/api/ai';

export interface AiActionsBellProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  pendingAiActions: number;
  pendingActionsList: PendingAction[];
  actionsLoading: boolean;
  approvingId: string | null;
  rejectingId: string | null;
  onApprove: (executionId: string) => void;
  onReject: (executionId: string) => void;
  onViewAll: () => void;
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'HIGH':
      return 'error';
    case 'MEDIUM':
      return 'warning';
    default:
      return 'info';
  }
}

export function AiActionsBell({
  anchorEl,
  onClose,
  pendingAiActions,
  pendingActionsList,
  actionsLoading,
  approvingId,
  rejectingId,
  onApprove,
  onReject,
  onViewAll,
}: AiActionsBellProps) {
  const theme = useTheme();
  const t = useTranslations();

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 380,
          maxHeight: 480,
          borderRadius: 2,
          boxShadow: 3,
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle size={18} color={theme.palette.warning.main} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t.ai?.needsReview || 'Needs Review'}
          </Typography>
        </Box>
        {pendingAiActions > 0 && (
          <Chip
            size="small"
            label={`${pendingAiActions} ${t.ai?.pending || 'pending'}`}
            color="warning"
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
      </Box>
      <Divider />

      {/* Content */}
      {actionsLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {!actionsLoading && pendingActionsList.length === 0 && (
        <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
          <Sparkles size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary">
            {t.ai?.noPendingActions || 'No pending actions'}
          </Typography>
        </Box>
      )}
      {!actionsLoading && pendingActionsList.slice(0, 5).map((action) => (
        <Box
          key={action.executionId}
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            '&:last-of-type': { borderBottom: 0 },
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
            <Chip
              size="small"
              label={action.severity}
              color={getSeverityColor(action.severity) as 'error' | 'warning' | 'info'}
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {action.actionType.replace(/_/g, ' ')}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.4 }}>
            {action.summary.length > 100 ? action.summary.slice(0, 100) + '...' : action.summary}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<XCircle size={14} />}
              onClick={() => onReject(action.executionId)}
              disabled={rejectingId === action.executionId || approvingId === action.executionId}
              sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
            >
              {rejectingId === action.executionId ? <CircularProgress size={12} /> : (t.ai?.reject || 'Reject')}
            </Button>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<Check size={14} />}
              onClick={() => onApprove(action.executionId)}
              disabled={approvingId === action.executionId || rejectingId === action.executionId}
              sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
            >
              {approvingId === action.executionId ? <CircularProgress size={12} color="inherit" /> : (t.ai?.approve || 'Approve')}
            </Button>
          </Box>
        </Box>
      ))}

      {/* Footer - View All */}
      {pendingActionsList.length > 0 && (
        <>
          <Divider />
          <MenuItem
            onClick={() => {
              onViewAll();
              onClose();
            }}
            sx={{
              justifyContent: 'center',
              py: 1.5,
              color: 'primary.main',
              fontWeight: 600,
            }}
          >
            {t.ai?.viewAllActions || 'View All in AI Assistant'}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
