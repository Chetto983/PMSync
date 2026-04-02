import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Bell, AlertCircle, CheckCircle2, Trash2, Clock, Pencil } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useTranslations } from '@/lib/hooks/use-translations';

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

export function CreateReminderRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  { inputUtente: string },
  CreateReminderResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
        <Bell size={16} />
        <Typography variant="body2" color="text.secondary">{tu?.creatingReminder || 'Creating reminder...'}</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '10px', border: 1, borderColor: 'error.light', bgcolor: 'error.light' }}>
        <AlertCircle size={16} />
        <Typography variant="body2" color="error.main">{tu?.reminderFailed || 'Failed to create reminder'}</Typography>
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
}

export function ListRemindersRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  { status?: string; limit?: number },
  ListRemindersResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
        <Bell size={16} />
        <Typography variant="body2" color="text.secondary">{tu?.loadingReminders || 'Loading reminders...'}</Typography>
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
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{tu?.noRemindersFound || 'No reminders found.'}</Typography>
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
}

interface CompleteReminderResult {
  success: boolean;
  reminderId?: string;
  titolo?: string;
  status?: string;
  completatoAt?: string | null;
  error?: string;
}

export function CompleteReminderRenderer({
  result,
  status,
}: ToolCallMessagePartProps<{ reminderId: string }, CompleteReminderResult>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
        <CheckCircle2 size={16} />
        <Typography variant="body2" color="text.secondary">{tu?.completingReminder || 'Completing reminder...'}</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') return null;
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CheckCircle2 size={16} color="green" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {result.titolo} — {tu?.reminderCompleted || 'completed'}
        </Typography>
      </Box>
    </Paper>
  );
}

interface UpdateReminderResult {
  success: boolean;
  reminderId?: string;
  titolo?: string;
  scadenzaDatetime?: string | null;
  priorita?: string;
  status?: string;
  error?: string;
}

export function UpdateReminderRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  { reminderId: string; titolo?: string; scadenzaDatetime?: string; priorita?: string },
  UpdateReminderResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
        <Pencil size={16} />
        <Typography variant="body2" color="text.secondary">{tu?.updatingReminder || 'Updating reminder...'}</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') return null;
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Pencil size={16} color="blue" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{result.titolo} — {tu?.reminderUpdated || 'updated'}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
        {result.scadenzaDatetime && (
          <Typography variant="caption" color="text.secondary">{formatDate(result.scadenzaDatetime)}</Typography>
        )}
        {result.priorita && (
          <Chip label={result.priorita} size="small" color={prioritaColor(result.priorita)} sx={{ height: 18, fontSize: '0.6rem' }} />
        )}
      </Box>
    </Paper>
  );
}

interface DeleteReminderResult {
  success: boolean;
  reminderId?: string;
  deleted?: boolean;
  error?: string;
}

export function DeleteReminderRenderer({
  result,
  status,
}: ToolCallMessagePartProps<{ reminderId: string }, DeleteReminderResult>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
        <Trash2 size={16} />
        <Typography variant="body2" color="text.secondary">{tu?.deletingReminder || 'Deleting reminder...'}</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') return null;
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Trash2 size={16} color="red" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{tu?.reminderDeleted || 'Reminder deleted'}</Typography>
      </Box>
    </Paper>
  );
}

interface SnoozeReminderResult {
  success: boolean;
  reminderId?: string;
  titolo?: string;
  newScadenzaDatetime?: string | null;
  snoozedByDays?: number;
  error?: string;
}

export function SnoozeReminderRenderer({
  result,
  status,
}: ToolCallMessagePartProps<{ reminderId: string; days: number }, SnoozeReminderResult>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5, width: 'fit-content' }}>
        <Clock size={16} />
        <Typography variant="body2" color="text.secondary">{tu?.snoozingReminder || 'Snoozing reminder...'}</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') return null;
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Clock size={16} color="orange" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {result.titolo} — {tu?.reminderSnoozed || 'snoozed'} +{result.snoozedByDays}d
        </Typography>
      </Box>
      {result.newScadenzaDatetime && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {formatDate(result.newScadenzaDatetime)}
        </Typography>
      )}
    </Paper>
  );
}
