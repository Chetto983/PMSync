import { makeAssistantToolUI } from '@assistant-ui/react';
import { List, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { EmailIndexResult } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const EmailListToolUI = makeAssistantToolUI<
  { folder?: string; limit?: number },
  EmailIndexResult
>({
  toolName: 'list_email_index',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 'fit-content', borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
          <List size={16} style={{ color: 'inherit', opacity: 0.6 }} />
          <Typography variant="body2" color="text.secondary">Loading email index...</Typography>
        </Box>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">
            Failed to load index: {'reason' in status ? status.reason : 'unknown'}
          </Typography>
        </Box>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      );
    }
    const items = result.index ?? [];
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Email Index{args.folder ? ` - ${args.folder}` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {result.count} email{result.count !== 1 ? 's' : ''}
          </Typography>
        </Box>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No emails in index.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <Box component="thead">
                <Box component="tr" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <Box component="th" sx={{ py: 0.5, pr: 1, textAlign: 'left', width: 32, color: 'text.secondary', fontWeight: 500 }}>#</Box>
                  <Box component="th" sx={{ py: 0.5, pr: 1, textAlign: 'left', color: 'text.secondary', fontWeight: 500 }}>From</Box>
                  <Box component="th" sx={{ py: 0.5, pr: 1, textAlign: 'left', color: 'text.secondary', fontWeight: 500 }}>Subject</Box>
                  <Box component="th" sx={{ py: 0.5, textAlign: 'right', color: 'text.secondary', fontWeight: 500 }}>Date</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {items.map((item) => (
                  <Box
                    component="tr"
                    key={item.id}
                    sx={{
                      borderBottom: 1,
                      borderColor: 'divider',
                      fontWeight: item.unread ? 600 : 400,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box component="td" sx={{ py: 0.5, pr: 1, color: 'text.secondary' }}>{item.idx}</Box>
                    <Box component="td" sx={{ py: 0.5, pr: 1, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.from}</Box>
                    <Box component="td" sx={{ py: 0.5, pr: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</Box>
                    <Box component="td" sx={{ py: 0.5, textAlign: 'right', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {formatDate(item.date)}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
        {result.hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, pt: 1, borderTop: 1, borderColor: 'divider', fontStyle: 'italic' }}>
            {result.hint}
          </Typography>
        )}
      </Paper>
    );
  },
});
