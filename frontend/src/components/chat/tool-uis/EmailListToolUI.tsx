import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailIndexResult } from '../types';
import { SenderAvatar } from './shared/SenderAvatar';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function LoadingSkeleton() {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Skeleton width="25%" height={14} sx={{ mb: 1 }} />
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.75, borderTop: i > 0 ? 1 : 0, borderColor: 'divider' }}>
          <Skeleton variant="circular" width={24} height={24} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={14} />
            <Skeleton width="75%" height={12} sx={{ mt: 0.25 }} />
          </Box>
          <Skeleton width={40} height={12} />
        </Box>
      ))}
    </Paper>
  );
}

export function EmailListRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { folder?: string; limit?: number },
  EmailIndexResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;

  if (status.type === 'running') return <LoadingSkeleton />;

  if (status.type === 'incomplete') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={16} color="var(--mui-palette-error-main)" />
          <Typography variant="body2" color="error.main">
            Failed to load index: {'reason' in status ? status.reason : 'unknown'}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (!result) return null;

  if (result.error) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={16} color="var(--mui-palette-error-main)" />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      </Paper>
    );
  }

  const items = result.index ?? [];
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', overflow: 'hidden', boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, pt: 1.25, pb: 0.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Email Index{args.folder ? ` — ${args.folder}` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {result.count} email{result.count !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1.5, textAlign: 'center' }}>
          {tu?.noEmailsInIndex || 'No emails in index.'}
        </Typography>
      ) : (
        <Box sx={{ px: 0.5 }}>
          {items.map((item, idx) => (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.75,
                px: 1,
                borderTop: idx > 0 ? 1 : 0,
                borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                transition: 'background-color 0.15s ease',
              }}
            >
              <SenderAvatar name={item.from} size={24} fontSize="0.6rem" />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ width: 20, textAlign: 'right', flexShrink: 0, fontSize: '0.7rem' }}
              >
                {item.idx}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: item.unread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                >
                  {item.from}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.74rem' }}
                >
                  {item.subject}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.72rem' }}>
                {formatDate(item.date)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {result.hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', fontStyle: 'italic' }}>
          {result.hint}
        </Typography>
      )}
    </Paper>
  );
}
