import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  Checkbox,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Typography,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Plus, Bell, Trash2, Search, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PageContainer } from '@/components/common';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { useReminders, useSearchReminders, useCompleteReminder, useDeleteReminder, useBulkDeleteReminders } from '@/hooks/queries/use-reminders';
import type { Reminder, ReminderStatus } from '@/lib/api/reminders';
import { ReminderCard } from './ReminderCard';
import { ReminderCreateDialog } from './ReminderCreateDialog';
import { ReminderEditDialog } from './ReminderEditDialog';
import { useRouter } from 'next/router';

const STATUS_FILTERS: Array<ReminderStatus | 'all'> = ['all', 'attivo', 'completato', 'annullato'];

export function RemindersBoard() {
  const t = useTranslations();
  const tr = t.ai.reminders;
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const isSearching = debouncedSearch.length >= 2;

  const params = statusFilter === 'all' ? undefined : { status: statusFilter };
  const listQuery = useReminders(params);
  const searchQuery = useSearchReminders(debouncedSearch);
  const activeQuery = isSearching ? searchQuery : listQuery;
  const { data, isLoading, isError, error, refetch } = activeQuery;
  const completeMutation = useCompleteReminder();
  const deleteMutation = useDeleteReminder();
  const bulkDeleteMutation = useBulkDeleteReminders();

  const reminders = data?.reminders ?? [];
  const hasSelection = selectedIds.size > 0;
  const allSelected = reminders.length > 0 && selectedIds.size === reminders.length;

  useEffect(() => {
    if (!router.isReady || router.query.action !== 'create') return;

    setDialogOpen(true);
    const { action, ...nextQuery } = router.query;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [router.isReady, router.pathname, router.query]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reminders.map((r) => r.id)));
    }
  }, [allSelected, reminders]);

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteConfirmId);
        return next;
      });
    }
  }, [deleteConfirmId, deleteMutation]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  const handleBulkDeleteConfirm = useCallback(() => {
    const ids = Array.from(selectedIds);
    bulkDeleteMutation.mutate(ids, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setBulkDeleteConfirmOpen(false);
      },
    });
  }, [selectedIds, bulkDeleteMutation]);

  const headerActions = (
    <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
      {tr.newReminder}
    </Button>
  );

  return (
    <PageContainer title={tr.title} subtitle={tr.subtitle} actions={headerActions}>

      {/* Search bar */}
      <TextField
        size="small"
        fullWidth
        placeholder={tr.searchPlaceholder}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        sx={{ mb: 1.5 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} />
              </InputAdornment>
            ),
            endAdornment: searchInput ? (
              <InputAdornment position="end">
                <Box
                  component="button"
                  onClick={() => setSearchInput('')}
                  sx={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', p: 0.5 }}
                >
                  <X size={16} />
                </Box>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={s === 'all' ? (t.common.all ?? 'All') : (tr.status[s] || s)}
            onClick={() => { setStatusFilter(s); setSelectedIds(new Set()); }}
            color={statusFilter === s ? 'primary' : 'default'}
            variant={statusFilter === s ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>

      {/* Bulk action bar */}
      {!isLoading && !isError && reminders.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Checkbox
            checked={allSelected}
            indeterminate={hasSelection && !allSelected}
            onChange={handleSelectAll}
            size="small"
          />
          {hasSelection ? (
            <>
              <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                {(tr.selected ?? '{count} selected').replace('{count}', String(selectedIds.size))}
              </Typography>
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<Trash2 size={16} />}
                onClick={() => setBulkDeleteConfirmOpen(true)}
                disabled={bulkDeleteMutation.isPending}
              >
                {tr.deleteSelected ?? 'Delete selected'}
              </Button>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {tr.selectAll ?? 'Select all'}
            </Typography>
          )}
        </Box>
      )}

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
        isSearching ? (
          <EmptyState
            icon={Search}
            color="#9e9e9e"
            title={(tr.noSearchResults ?? 'No reminders found for "{query}"').replace('{query}', debouncedSearch)}
            description=""
          />
        ) : (
          <EmptyState
            icon={Bell}
            color="#22c55e"
            title={tr.noReminders}
            description={tr.noRemindersDescription}
            actionLabel={tr.newReminder}
            onAction={() => setDialogOpen(true)}
          />
        )
      )}

      {/* Reminders list */}
      {!isLoading && !isError && reminders.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {reminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              selected={selectedIds.has(r.id)}
              onSelect={handleToggleSelect}
              onEdit={setEditingReminder}
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
      <ReminderEditDialog open={editingReminder !== null} reminder={editingReminder} onClose={() => setEditingReminder(null)} />

      {/* Single delete confirmation dialog */}
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

      {/* Bulk delete confirmation dialog */}
      <Dialog open={bulkDeleteConfirmOpen} onClose={() => setBulkDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{tr.deleteSelected ?? 'Delete selected'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(tr.bulkDeleteConfirm ?? 'Are you sure you want to delete {count} reminder(s)?').replace('{count}', String(selectedIds.size))}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteConfirmOpen(false)}>{t.common.cancel}</Button>
          <Button
            onClick={handleBulkDeleteConfirm}
            color="error"
            variant="contained"
            disabled={bulkDeleteMutation.isPending}
          >
            {t.common.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
