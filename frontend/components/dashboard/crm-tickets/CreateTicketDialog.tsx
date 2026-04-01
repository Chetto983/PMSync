import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateTicket } from '@/hooks/queries/use-crm-tickets';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateTicketDialog({ open, onClose }: Props) {
  const t = useTranslations();
  const tt = t.crmTickets;
  const createTicket = useCreateTicket();

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  const handleCreate = () => {
    if (!subject.trim()) return;
    createTicket.mutate(
      {
        subject: subject.trim(),
        description: description.trim() || undefined,
        priority,
      },
      {
        onSuccess: () => {
          setSubject('');
          setDescription('');
          setPriority('medium');
          onClose();
        },
      },
    );
  };

  const priorityLabel = (p: string) =>
    (tt?.priority as Record<string, string> | undefined)?.[p] ?? p;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tt?.actions?.create ?? 'Create Ticket'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={12}>
            <TextField
              label={tt?.form?.subject ?? 'Subject'}
              size="small"
              fullWidth
              autoFocus
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label={tt?.form?.description ?? 'Description'}
              size="small"
              fullWidth
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label={tt?.form?.priority ?? 'Priority'}
              size="small"
              fullWidth
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {['low', 'medium', 'high', 'urgent'].map((p) => (
                <MenuItem key={p} value={p}>{priorityLabel(p)}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.common?.cancel ?? 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!subject.trim() || createTicket.isPending}
        >
          {tt?.actions?.create ?? 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
