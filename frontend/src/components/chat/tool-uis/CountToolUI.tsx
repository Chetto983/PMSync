import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Mail, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { CountResult } from '../types';

export function CountRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { folder?: string; unreadOnly?: boolean },
  CountResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 'fit-content', borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
        <Mail size={16} style={{ opacity: 0.6 }} />
        <Typography variant="body2" color="text.secondary">
          Counting emails{args.folder ? ` in ${args.folder}` : ''}...
        </Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
        <AlertCircle size={16} />
        <Typography variant="body2" color="error.main">
          Failed to count emails: {'reason' in status ? status.reason : 'unknown'}
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
  const data = result.data;
  if (!data) return null;
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Email Count{data.folder ? ` - ${data.folder}` : ''}
        </Typography>
        {data.period && (
          <Typography variant="caption" color="text.secondary">{data.period}</Typography>
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, textAlign: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{data.total}</Typography>
          <Typography variant="caption" color="text.secondary">{tu?.total || 'Total'}</Typography>
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>{data.unread}</Typography>
          <Typography variant="caption" color="text.secondary">{tu?.unread || 'Unread'}</Typography>
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>{data.read}</Typography>
          <Typography variant="caption" color="text.secondary">{tu?.read || 'Read'}</Typography>
        </Box>
      </Box>
      {result.summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
          {result.summary}
        </Typography>
      )}
    </Paper>
  );
}
