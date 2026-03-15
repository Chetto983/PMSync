import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Alert,
  Button,
  Fab,
} from '@mui/material';
import { Plus } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useReminders, useCompleteReminder, useDeleteReminder } from '@/hooks/queries/use-reminders';
import type { ReminderStatus } from '@/lib/api/reminders';
import { ReminderCard } from './ReminderCard';
import { ReminderCreateDialog } from './ReminderCreateDialog';

const STATUS_FILTERS: Array<ReminderStatus | 'all'> = ['all', 'attivo', 'completato', 'annullato'];

export function RemindersBoard() {
  const t = useTranslations();
  const tr = t.ai.reminders;
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = statusFilter === 'all' ? undefined : { status: statusFilter };
  const { data, isLoading, isError, refetch } = useReminders(params);
  const completeMutation = useCompleteReminder();
  const deleteMutation = useDeleteReminder();

  const reminders = data?.reminders ?? [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>{tr.title}</Typography>
          <Typography variant="body2" color="text.secondary">{tr.subtitle}</Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
          {tr.newReminder}
        </Button>
      </Box>

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={s === 'all' ? 'All' : (tr.status[s] || s)}
            onClick={() => setStatusFilter(s)}
            color={statusFilter === s ? 'primary' : 'default'}
            variant={statusFilter === s ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={120} />)}
        </Box>
      )}

      {/* Error */}
      {isError && (
        <Alert severity="error" action={<Button onClick={() => refetch()}>{tr.retry}</Button>}>
          {tr.error}
        </Alert>
      )}

      {/* Empty */}
      {!isLoading && !isError && reminders.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary">{tr.noReminders}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{tr.noRemindersDescription}</Typography>
        </Box>
      )}

      {/* Reminders list */}
      {!isLoading && !isError && reminders.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {reminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onComplete={(id) => completeMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </Box>
      )}

      {/* FAB for mobile */}
      <Fab
        color="primary"
        onClick={() => setDialogOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, display: { xs: 'flex', md: 'none' } }}
      >
        <Plus size={24} />
      </Fab>

      <ReminderCreateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </Box>
  );
}
