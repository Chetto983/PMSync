import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Plus, Bell } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PageContainer } from '@/components/common';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const params = statusFilter === 'all' ? undefined : { status: statusFilter };
  const { data, isLoading, isError, error, refetch } = useReminders(params);
  const completeMutation = useCompleteReminder();
  const deleteMutation = useDeleteReminder();

  const reminders = data?.reminders ?? [];

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, deleteMutation]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  const headerActions = (
    <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
      {tr.newReminder}
    </Button>
  );

  return (
    <PageContainer title={tr.title} subtitle={tr.subtitle} actions={headerActions}>

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={s === 'all' ? (t.common.all ?? 'All') : (tr.status[s] || s)}
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
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={120} animation="wave" />)}
        </Box>
      )}

      {/* Error */}
      {isError && (
        <QueryErrorAlert error={error} onRetry={() => { void refetch(); }} />
      )}

      {/* Empty */}
      {!isLoading && !isError && reminders.length === 0 && (
        <EmptyState
          icon={Bell}
          color="#22c55e"
          title={tr.noReminders}
          description={tr.noRemindersDescription}
          actionLabel={tr.newReminder}
          onAction={() => setDialogOpen(true)}
        />
      )}

      {/* Reminders list */}
      {!isLoading && !isError && reminders.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {reminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onComplete={(id) => completeMutation.mutate(id)}
              onDelete={handleDeleteRequest}
            />
          ))}
        </Box>
      )}

      {/* FAB for mobile */}
      <Fab
        color="primary"
        onClick={() => setDialogOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 'calc(24px + env(safe-area-inset-right, 0px))', display: { xs: 'flex', md: 'none' } }}
      >
        <Plus size={24} />
      </Fab>

      <ReminderCreateDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmId !== null} onClose={handleDeleteCancel} maxWidth="xs" fullWidth>
        <DialogTitle>{tr.actions.delete}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {tr.deleteConfirm ?? 'Are you sure you want to delete this reminder? This action cannot be undone.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>{t.common.cancel}</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {t.common.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
