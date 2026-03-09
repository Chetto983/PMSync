import { makeAssistantToolUI } from '@assistant-ui/react';
import { Clock, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { FollowUpResult, FollowUpItem } from '../types';

function statusSx(s: string): { bgcolor: string; color: string } {
  switch (s) {
    case 'pending':
      return { bgcolor: 'warning.light', color: 'warning.dark' };
    case 'overdue':
      return { bgcolor: 'error.light', color: 'error.dark' };
    case 'completed':
      return { bgcolor: 'success.light', color: 'success.dark' };
    default:
      return { bgcolor: 'action.hover', color: 'text.secondary' };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function FollowUpRow({ item, isFirst }: { item: FollowUpItem; isFirst: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 1,
        px: 1,
        borderRadius: 1,
        borderTop: isFirst ? 0 : 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s ease',
      }}
    >
      <Clock size={14} style={{ marginTop: 2, flexShrink: 0, color: 'inherit', opacity: 0.5 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Box
            component="span"
            sx={{
              px: 0.75,
              py: 0.25,
              fontSize: '0.625rem',
              fontWeight: 600,
              borderRadius: '9999px',
              ...statusSx(item.status),
            }}
          >
            {item.status}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {formatDate(item.dueDate)}
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{ mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {item.email.subject ?? '(no subject)'}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
        >
          From: {item.email.from}
        </Typography>
        {item.reason && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, fontStyle: 'italic', display: 'block' }}>
            {item.reason}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export const FollowUpToolUI = makeAssistantToolUI<
  { status?: string; limit?: number },
  FollowUpResult
>({
  toolName: 'list_follow_ups',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: 'fit-content',
            borderRadius: '10px',
            border: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
            p: 1.5,
          }}
        >
          <Clock size={16} />
          <Typography variant="body2" color="text.secondary">
            Loading follow-ups...
          </Typography>
        </Box>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            borderRadius: '10px',
            border: 1,
            borderColor: 'error.light',
            bgcolor: 'error.light',
          }}
        >
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">
            Failed to load follow-ups: {'reason' in status ? (status as { reason?: string }).reason : 'unknown'}
          </Typography>
        </Box>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            borderRadius: '10px',
            border: 1,
            borderColor: 'error.light',
            bgcolor: 'error.light',
          }}
        >
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">
            {result.error}
          </Typography>
        </Box>
      );
    }
    const items = result.followUps ?? [];
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Follow-ups
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {result.count} item{result.count !== 1 ? 's' : ''}
          </Typography>
        </Box>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            {result.message ?? 'No follow-ups found.'}
          </Typography>
        ) : (
          <Box>
            {items.map((item, idx) => (
              <FollowUpRow key={item.followUpId} item={item} isFirst={idx === 0} />
            ))}
          </Box>
        )}
      </Paper>
    );
  },
});
