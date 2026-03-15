import { makeAssistantToolUI } from '@assistant-ui/react';
import { Bell, AlertCircle, CheckCircle2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

interface CreateReminderResult {
  success: boolean;
  reminderId?: string;
  titolo?: string;
  scadenzaDatetime?: string;
  condizioneTipo?: string;
  messaggioTelegram?: string;
  rispostaChat?: string;
  error?: string;
}

interface ListRemindersResult {
  count: number;
  reminders: Array<{
    id: string;
    titolo: string;
    status: string;
    priorita: string;
    scadenzaDatetime?: string | null;
    condizioneTipo?: string;
    contatto?: string | null;
  }>;
  error?: string;
}

function prioritaColor(p: string): 'error' | 'warning' | 'success' | 'default' {
  switch (p) {
    case 'alta': return 'error';
    case 'media': return 'warning';
    case 'bassa': return 'success';
    default: return 'default';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const CreateReminderToolUI = makeAssistantToolUI<
  { inputUtente: string },
  CreateReminderResult
>({
  toolName: 'create_reminder',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
          <Bell size={16} />
          <Typography variant="body2" color="text.secondary">Creating reminder...</Typography>
        </Box>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '10px', border: 1, borderColor: 'error.light', bgcolor: 'error.light' }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">Failed to create reminder</Typography>
        </Box>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '10px', border: 1, borderColor: 'error.light', bgcolor: 'error.light' }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      );
    }
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CheckCircle2 size={16} color="green" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.titolo}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
          {result.scadenzaDatetime && (
            <Typography variant="caption" color="text.secondary">{formatDate(result.scadenzaDatetime)}</Typography>
          )}
          {result.condizioneTipo && result.condizioneTipo !== 'sempre' && (
            <Chip label={result.condizioneTipo.replace(/_/g, ' ')} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
          )}
        </Box>
        {result.messaggioTelegram && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
            Telegram: {result.messaggioTelegram}
          </Typography>
        )}
      </Paper>
    );
  },
});

export const ListRemindersToolUI = makeAssistantToolUI<
  { status?: string; limit?: number },
  ListRemindersResult
>({
  toolName: 'list_reminders',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
          <Bell size={16} />
          <Typography variant="body2" color="text.secondary">Loading reminders...</Typography>
        </Box>
      );
    }
    if (status.type === 'incomplete' || !result) return null;
    if (result.error) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '10px', border: 1, borderColor: 'error.light', bgcolor: 'error.light' }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      );
    }
    const items = result.reminders ?? [];
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Reminders
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {result.count} item{result.count !== 1 ? 's' : ''}
          </Typography>
        </Box>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No reminders found.</Typography>
        ) : (
          <Box>
            {items.map((item, idx) => (
              <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderTop: idx > 0 ? 1 : 0, borderColor: 'divider' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>{item.titolo}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                    <Chip label={item.priorita} size="small" color={prioritaColor(item.priorita)} sx={{ height: 18, fontSize: '0.6rem' }} />
                    {item.contatto && <Typography variant="caption" color="text.secondary">{item.contatto}</Typography>}
                    {item.scadenzaDatetime && <Typography variant="caption" color="text.secondary">{formatDate(item.scadenzaDatetime)}</Typography>}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    );
  },
});
