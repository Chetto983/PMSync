import React, { useState, useEffect } from 'react';
import {
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  MenuItem,
  Box,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUpdateReminder } from '@/hooks/queries/use-reminders';
import type { Reminder, UpdateReminderDto } from '@/lib/api/reminders';

interface ReminderEditDialogProps {
  open: boolean;
  reminder: Reminder | null;
  onClose: () => void;
}

const PRIORITA_OPTIONS = ['alta', 'media', 'bassa'] as const;
const AZIONE_OPTIONS = ['chiama', 'scrivi_mail', 'verifica', 'conferma', 'controlla', 'altro'] as const;
const STATUS_OPTIONS = ['attivo', 'completato', 'annullato', 'sospeso'] as const;

function toLocalDateTimeString(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReminderEditDialog({ open, reminder, onClose }: ReminderEditDialogProps) {
  const t = useTranslations();
  const tr = t.ai.reminders;
  const ed = tr.editDialog;
  const updateMutation = useUpdateReminder();

  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [contatto, setContatto] = useState('');
  const [scadenzaDatetime, setScadenzaDatetime] = useState('');
  const [priorita, setPriorita] = useState('media');
  const [azione, setAzione] = useState('altro');
  const [status, setStatus] = useState('attivo');
  const [messaggioTelegram, setMessaggioTelegram] = useState('');

  useEffect(() => {
    if (reminder && open) {
      setTitolo(reminder.titolo);
      setDescrizione(reminder.descrizione ?? '');
      setContatto(reminder.contatto ?? '');
      setScadenzaDatetime(toLocalDateTimeString(reminder.scadenzaDatetime));
      setPriorita(reminder.priorita);
      setAzione(reminder.azione);
      setStatus(reminder.status);
      setMessaggioTelegram(reminder.messaggioTelegram ?? '');
    }
  }, [reminder, open]);

  const handleSave = () => {
    if (!reminder) return;
    const dto: UpdateReminderDto = {
      titolo,
      descrizione: descrizione || undefined,
      contatto: contatto || undefined,
      scadenzaDatetime: scadenzaDatetime ? new Date(scadenzaDatetime).toISOString() : undefined,
      priorita: priorita as UpdateReminderDto['priorita'],
      azione: azione as UpdateReminderDto['azione'],
      status: status as UpdateReminderDto['status'],
      messaggioTelegram: messaggioTelegram || undefined,
    };
    updateMutation.mutate(
      { id: reminder.id, dto },
      { onSuccess: () => onClose() },
    );
  };

  const handleClose = () => {
    if (!updateMutation.isPending) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{ed.title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={ed.titleField}
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            fullWidth
            required
            disabled={updateMutation.isPending}
          />
          <TextField
            label={ed.descriptionField}
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            disabled={updateMutation.isPending}
          />
          <TextField
            label={ed.contactField}
            value={contatto}
            onChange={(e) => setContatto(e.target.value)}
            fullWidth
            disabled={updateMutation.isPending}
          />
          <TextField
            label={ed.deadlineField}
            type="datetime-local"
            value={scadenzaDatetime}
            onChange={(e) => setScadenzaDatetime(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            disabled={updateMutation.isPending}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={ed.priorityField}
              select
              value={priorita}
              onChange={(e) => setPriorita(e.target.value)}
              fullWidth
              disabled={updateMutation.isPending}
            >
              {PRIORITA_OPTIONS.map((p) => (
                <MenuItem key={p} value={p}>{tr.priorita[p]}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={ed.actionField}
              select
              value={azione}
              onChange={(e) => setAzione(e.target.value)}
              fullWidth
              disabled={updateMutation.isPending}
            >
              {AZIONE_OPTIONS.map((a) => (
                <MenuItem key={a} value={a}>{tr.azione[a]}</MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            label={ed.statusField}
            select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            fullWidth
            disabled={updateMutation.isPending}
          >
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>{tr.status[s]}</MenuItem>
            ))}
          </TextField>
          <TextField
            label={ed.telegramMessageField}
            value={messaggioTelegram}
            onChange={(e) => setMessaggioTelegram(e.target.value)}
            fullWidth
            disabled={updateMutation.isPending}
            helperText="Max 120 chars"
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
        </Box>
        {updateMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {updateMutation.error?.message || t.common?.genericError || 'An error occurred'}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={updateMutation.isPending}>
          {ed.cancel}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!titolo.trim() || updateMutation.isPending}
          startIcon={updateMutation.isPending ? <CircularProgress size={16} /> : undefined}
        >
          {ed.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
