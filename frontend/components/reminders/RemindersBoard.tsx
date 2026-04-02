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
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Plus, Bell, Trash2, Search, X, ChevronDown, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PageContainer } from '@/components/common';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import {
  useUnifiedReminders,
  useResolveUnified,
  useDeleteReminder,
  useBulkDeleteReminders,
  useBulkUpdateReminders,
  useConvertFollowUpToReminder,
} from '@/hooks/queries/use-reminders';
import type { UnifiedReminderItem, UnifiedSource, Reminder } from '@/lib/api/reminders';
import { ReminderCard } from './ReminderCard';
import { ReminderCreateDialog } from './ReminderCreateDialog';
import { ReminderEditDialog } from './ReminderEditDialog';
import { useRouter } from 'next/router';

const SOURCE_FILTERS: Array<UnifiedSource | 'all'> = ['all', 'user', 'ai-followup'];

export function RemindersBoard() {
  const t = useTranslations();
  const tr = t.ai.reminders;
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState<UnifiedSource | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<null | HTMLElement>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const isSearching = debouncedSearch.length >= 2;

  const unifiedParams = sourceFilter === 'all' ? undefined : { source: sourceFilter };
  const { data, isLoading, isError, error, refetch } = useUnifiedReminders(unifiedParams);
  const resolveMutation = useResolveUnified();
  const deleteMutation = useDeleteReminder();
  const bulkDeleteMutation = useBulkDeleteReminders();
  const bulkUpdateMutation = useBulkUpdateReminders();
  const convertMutation = useConvertFollowUpToReminder();

  // Filter by search client-side (unified endpoint doesn't support search)
  const allItems = data?.items ?? [];
  const items = isSearching
    ? allItems.filter((item) => {
        const q = debouncedSearch.toLowerCase();
        return (
          item.titolo.toLowerCase().includes(q) ||
          (item.descrizione?.toLowerCase().includes(q) ?? false) ||
          (item.contatto?.toLowerCase().includes(q) ?? false) ||
          (item.emailSubject?.toLowerCase().includes(q) ?? false)
        );
      })
    : allItems;

  const hasSelection = selectedIds.size > 0;
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const counts = data?.counts;

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
      setSelectedIds(new Set(items.map((r) => r.id)));
    }
  }, [allSelected, items]);

  const handleBulkMarkCompleted = useCallback(() => {
    const ids = Array.from(selectedIds);
    bulkUpdateMutation.mutate({ ids, status: 'completato' }, {
      onSuccess: () => setSelectedIds(new Set()),
    });
    setBulkMenuAnchor(null);
  }, [selectedIds, bulkUpdateMutation]);

  const handleBulkChangePriority = useCallback((priorita: 'alta' | 'media' | 'bassa') => {
    const ids = Array.from(selectedIds);
    bulkUpdateMutation.mutate({ ids, priorita }, {
      onSuccess: () => setSelectedIds(new Set()),
    });
    setBulkMenuAnchor(null);
  }, [selectedIds, bulkUpdateMutation]);

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

  const handleComplete = useCallback((id: string, source: UnifiedReminderItem['source']) => {
    resolveMutation.mutate({ id, source });
  }, [resolveMutation]);

  const handleConvert = useCallback((followUpId: string) => {
    convertMutation.mutate(followUpId);
  }, [convertMutation]);

  /** Map a UnifiedReminderItem to a Reminder for the edit dialog (user items only) */
  const handleEdit = useCallback((item: UnifiedReminderItem) => {
    if (item.source !== 'user') return;
    // Cast to Reminder shape — the edit dialog only uses the fields available
    setEditingReminder({
      id: item.id,
      tenantId: '',
      userId: '',
      titolo: item.titolo,
      descrizione: item.descrizione,
      contatto: item.contatto,
      scadenzaDatetime: item.scadenzaDatetime,
      priorita: item.priorita,
      status: item.status as Reminder['status'],
      azione: (item.azione ?? 'altro') as Reminder['azione'],
      condizioneTipo: (item.condizioneTipo ?? 'sempre') as Reminder['condizioneTipo'],
      monitoraEmail: item.monitoraEmail,
      emailKeywords: [],
      emailRilevata: false,
      telegramInviato: item.telegramInviato,
      isRecurring: item.isRecurring,
      recurrenceRule: item.recurrenceRule,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }, []);

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

      {/* Source filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {SOURCE_FILTERS.map((s) => {
          const label = s === 'all'
            ? `${tr.sourceFilter.all}${counts ? ` (${(counts.user ?? 0) + (counts.aiFollowUp ?? 0)})` : ''}`
            : s === 'user'
              ? `${tr.sourceFilter.user}${counts ? ` (${counts.user ?? 0})` : ''}`
              : `${tr.sourceFilter['ai-followup']}${counts ? ` (${counts.aiFollowUp ?? 0})` : ''}`;

          return (
            <Chip
              key={s}
              label={label}
              onClick={() => { setSourceFilter(s); setSelectedIds(new Set()); }}
              color={sourceFilter === s ? 'primary' : 'default'}
              variant={sourceFilter === s ? 'filled' : 'outlined'}
              size="small"
            />
          );
        })}
      </Box>

      {/* Bulk action bar (only for user reminders) */}
      {!isLoading && !isError && items.length > 0 && sourceFilter !== 'ai-followup' && (
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
                variant="outlined"
                endIcon={<ChevronDown size={14} />}
                onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
                disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
              >
                {tr.bulkActions ?? 'Actions'}
              </Button>
              <Menu
                anchorEl={bulkMenuAnchor}
                open={Boolean(bulkMenuAnchor)}
                onClose={() => setBulkMenuAnchor(null)}
              >
                <MenuItem onClick={handleBulkMarkCompleted}>
                  <ListItemIcon><CheckCircle2 size={16} /></ListItemIcon>
                  <ListItemText>{tr.markCompleted ?? 'Mark completed'}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleBulkChangePriority('alta')}>
                  <ListItemIcon><ArrowUpDown size={16} /></ListItemIcon>
                  <ListItemText>{tr.priorita.alta}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleBulkChangePriority('media')}>
                  <ListItemIcon><ArrowUpDown size={16} /></ListItemIcon>
                  <ListItemText>{tr.priorita.media}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleBulkChangePriority('bassa')}>
                  <ListItemIcon><ArrowUpDown size={16} /></ListItemIcon>
                  <ListItemText>{tr.priorita.bassa}</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => { setBulkMenuAnchor(null); setBulkDeleteConfirmOpen(true); }}
                  sx={{ color: 'error.main' }}
                >
                  <ListItemIcon><Trash2 size={16} color="inherit" /></ListItemIcon>
                  <ListItemText>{tr.deleteSelected ?? 'Delete selected'}</ListItemText>
                </MenuItem>
              </Menu>
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
      {!isLoading && !isError && items.length === 0 && (
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

      {/* Items list */}
      {!isLoading && !isError && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {items.map((item) => (
            <ReminderCard
              key={`${item.source}-${item.id}`}
              item={item}
              selected={selectedIds.has(item.id)}
              onSelect={item.source === 'user' ? handleToggleSelect : undefined}
              onEdit={item.source === 'user' ? handleEdit : undefined}
              onComplete={handleComplete}
              onDelete={handleDeleteRequest}
              onConvert={item.source === 'ai-followup' ? handleConvert : undefined}
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
