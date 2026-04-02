import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Skeleton,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  MenuItem,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { Plus, Trash2, List, Kanban, CheckSquare } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateInTz } from '@/lib/utils/format-date-tz';
import { useTasks, useCompleteTask, useDeleteTask, useSmartViews } from '@/hooks/queries/use-tasks';
import { useGlobalToast } from '@/lib/context/toast-context';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { CreateTaskDialog } from './CreateTaskDialog';
import { TasksKanbanBoard } from './TasksKanbanBoard';
import { SavedViewsBar } from './SavedViewsBar';
import { SavedViewDialog } from './SavedViewDialog';
import type {
  UnifiedTask,
  ListTasksQuery,
  TaskSmartView,
  TaskSourceType,
  UnifiedTaskStatus,
  UnifiedTaskPriority,
} from '@/lib/api/tasks';

type ViewMode = 'list' | 'kanban';

const SOURCE_TYPE_OPTIONS: TaskSourceType[] = ['follow_up', 'reminder', 'deal_action', 'ticket', 'manual'];
const STATUS_OPTIONS: UnifiedTaskStatus[] = ['pending', 'in_progress', 'completed', 'dismissed', 'expired'];
const PRIORITY_OPTIONS: UnifiedTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

function statusChipColor(status: UnifiedTaskStatus): 'warning' | 'info' | 'success' | 'default' {
  if (status === 'pending') return 'warning';
  if (status === 'in_progress') return 'info';
  if (status === 'completed') return 'success';
  return 'default';
}

function priorityChipColor(priority: UnifiedTaskPriority): 'error' | 'warning' | 'default' {
  if (priority === 'urgent') return 'error';
  if (priority === 'high') return 'warning';
  return 'default';
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

export function TasksList() {
  const t = useTranslations();
  const tc = t.common;
  const toast = useGlobalToast();
  const router = useRouter();
  const timezone = useUserTimezone();
  const { locale } = useLocale();

  const formatDate = useCallback(
    (dateStr: string | null): string => {
      if (!dateStr) return '\u2014';
      return formatDateInTz(dateStr, timezone, locale);
    },
    [timezone, locale],
  );

  // URL-synced state
  const q = router.query;
  const [viewMode, setViewMode] = useState<ViewMode>(() => (q.viewMode === 'kanban' ? 'kanban' : 'list'));
  const [filterSourceType, setFilterSourceType] = useState(() => (typeof q.type === 'string' ? q.type : ''));
  const [filterStatus, setFilterStatus] = useState(() => (typeof q.status === 'string' ? q.status : ''));
  const [filterPriority, setFilterPriority] = useState(() => (typeof q.priority === 'string' ? q.priority : ''));
  const [filterDueBefore, setFilterDueBefore] = useState(() => (typeof q.dueBefore === 'string' ? q.dueBefore : ''));
  const [filterDueAfter, setFilterDueAfter] = useState(() => (typeof q.dueAfter === 'string' ? q.dueAfter : ''));
  const [filterContactId, setFilterContactId] = useState(() => (typeof q.contactId === 'string' ? q.contactId : ''));
  const [page, setPage] = useState(() => {
    const p = parseInt(typeof q.page === 'string' ? q.page : '', 10);
    return isNaN(p) ? 0 : p;
  });
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(
    () => (typeof q.view === 'string' ? q.view : null),
  );
  const [deleteTarget, setDeleteTarget] = useState<UnifiedTask | null>(null);

  const { data: smartViewsData } = useSmartViews();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  // Hydrate filters from ?view=<id> on mount (cross-session persistence)
  useEffect(() => {
    if (!router.isReady) return;
    const viewId = typeof q.view === 'string' ? q.view : null;
    if (!viewId || !smartViewsData) return;
    const view = smartViewsData.find((v: TaskSmartView) => v.id === viewId);
    if (!view) return;
    const f = view.filters as Partial<ListTasksQuery>;
    setFilterSourceType(f.sourceType?.[0] ?? '');
    setFilterStatus(f.status?.[0] ?? '');
    setFilterPriority(f.priority?.[0] ?? '');
    setFilterDueBefore(f.dueBefore ?? '');
    setFilterDueAfter(f.dueAfter ?? '');
    setFilterContactId(f.contactId ?? '');
    setActiveViewId(view.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, smartViewsData]);

  // ?action=create triggers dialog
  useEffect(() => {
    if (!router.isReady || router.query.action !== 'create') return;
    setCreateOpen(true);
    const { action, ...nextQuery } = router.query;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [router.isReady, router.pathname, router.query]);

  // Sync state -> URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (filterSourceType) params.type = filterSourceType;
    if (filterStatus) params.status = filterStatus;
    if (filterPriority) params.priority = filterPriority;
    if (filterDueBefore) params.dueBefore = filterDueBefore;
    if (filterDueAfter) params.dueAfter = filterDueAfter;
    if (filterContactId) params.contactId = filterContactId;
    if (page > 0) params.page = String(page);
    if (viewMode !== 'list') params.viewMode = viewMode;
    if (activeViewId) params.view = activeViewId;
    void router.replace({ pathname: router.pathname, query: params }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSourceType, filterStatus, filterPriority, filterDueBefore, filterDueAfter, filterContactId, page, viewMode, activeViewId]);

  // Build query
  const filters: ListTasksQuery = useMemo(() => ({
    sourceType: filterSourceType ? [filterSourceType as TaskSourceType] : undefined,
    status: filterStatus ? [filterStatus as UnifiedTaskStatus] : ['pending', 'in_progress'],
    priority: filterPriority ? [filterPriority as UnifiedTaskPriority] : undefined,
    dueBefore: filterDueBefore || undefined,
    dueAfter: filterDueAfter || undefined,
    contactId: filterContactId || undefined,
    page: page + 1,
    limit: rowsPerPage,
  }), [filterSourceType, filterStatus, filterPriority, filterDueBefore, filterDueAfter, filterContactId, page, rowsPerPage]);

  const { data, isLoading, isError, error } = useTasks(filters);

  const handleComplete = useCallback(
    async (task: UnifiedTask) => {
      try {
        await completeTask.mutateAsync({ sourceType: task.sourceType, id: task.sourceId });
        toast.success(t.tasks.completed);
      } catch {
        toast.error(t.tasks.completeError);
      }
    },
    [completeTask, toast, t],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask.mutateAsync({ sourceType: deleteTarget.sourceType, id: deleteTarget.sourceId });
      toast.success(t.tasks.deleted);
    } catch {
      toast.error(t.tasks.deleteError);
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteTask, toast, t]);

  const applyView = useCallback(
    (view: TaskSmartView) => {
      const f = view.filters as Partial<ListTasksQuery>;
      setFilterSourceType(f.sourceType?.[0] ?? '');
      setFilterStatus(f.status?.[0] ?? '');
      setFilterPriority(f.priority?.[0] ?? '');
      setFilterDueBefore(f.dueBefore ?? '');
      setFilterDueAfter(f.dueAfter ?? '');
      setFilterContactId(f.contactId ?? '');
      setActiveViewId(view.id);
      toast.success(t.tasks.smartViews.applied);
    },
    [t, toast],
  );

  const currentFilters: Partial<ListTasksQuery> = useMemo(
    () => ({
      ...(filterSourceType && { sourceType: [filterSourceType as TaskSourceType] }),
      ...(filterStatus && { status: [filterStatus as UnifiedTaskStatus] }),
      ...(filterPriority && { priority: [filterPriority as UnifiedTaskPriority] }),
      ...(filterDueBefore && { dueBefore: filterDueBefore }),
      ...(filterDueAfter && { dueAfter: filterDueAfter }),
      ...(filterContactId && { contactId: filterContactId }),
    }),
    [filterSourceType, filterStatus, filterPriority, filterDueBefore, filterDueAfter, filterContactId],
  );

  const hasFilters = !!(filterSourceType || filterStatus || filterPriority || filterDueBefore || filterDueAfter || filterContactId);
  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  // Loading
  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
        <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 2 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={48} animation="wave" sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  // Error
  if (isError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
        <Alert severity="error">{(error as Error)?.message ?? t.tasks.errorLoading}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {t.tasks.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t.tasks.description}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => { if (v) { setViewMode(v as ViewMode); setActiveViewId(null); } }}
            size="small"
            aria-label={t.tasks.viewList}
          >
            <ToggleButton value="list" aria-label={t.tasks.viewList}>
              <Tooltip title={t.tasks.viewList}>
                <Box sx={{ display: 'flex' }}><List size={18} /></Box>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="kanban" aria-label={t.tasks.viewKanban}>
              <Tooltip title={t.tasks.viewKanban}>
                <Box sx={{ display: 'flex' }}><Kanban size={18} /></Box>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
          >
            {t.tasks.createTask}
          </Button>
        </Box>
      </Box>

      {/* Saved views bar */}
      <SavedViewsBar
        activeViewId={activeViewId}
        onApplyView={applyView}
        onClearView={() => setActiveViewId(null)}
        onSaveClick={() => setSaveDialogOpen(true)}
        currentFilters={currentFilters}
      />

      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label={t.tasks.filters.sourceType}
          value={filterSourceType}
          onChange={(e) => { setFilterSourceType(e.target.value); setPage(0); setActiveViewId(null); }}
          size="small"
          select
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">{t.tasks.sourceTypes.all}</MenuItem>
          {SOURCE_TYPE_OPTIONS.map((st) => (
            <MenuItem key={st} value={st}>{t.tasks.sourceTypes[st]}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={t.tasks.filters.status}
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(0); setActiveViewId(null); }}
          size="small"
          select
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">{t.tasks.statuses.all}</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{t.tasks.statuses[s]}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={t.tasks.filters.priority}
          value={filterPriority}
          onChange={(e) => { setFilterPriority(e.target.value); setPage(0); setActiveViewId(null); }}
          size="small"
          select
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">{t.tasks.priorities.all}</MenuItem>
          {PRIORITY_OPTIONS.map((p) => (
            <MenuItem key={p} value={p}>{t.tasks.priorities[p]}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={t.tasks.filters.dueAfter}
          type="date"
          value={filterDueAfter}
          onChange={(e) => { setFilterDueAfter(e.target.value); setPage(0); setActiveViewId(null); }}
          size="small"
          sx={{ minWidth: 150 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label={t.tasks.filters.dueBefore}
          type="date"
          value={filterDueBefore}
          onChange={(e) => { setFilterDueBefore(e.target.value); setPage(0); setActiveViewId(null); }}
          size="small"
          sx={{ minWidth: 150 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label={t.tasks.filters.contact}
          value={filterContactId}
          onChange={(e) => { setFilterContactId(e.target.value); setPage(0); setActiveViewId(null); }}
          size="small"
          sx={{ minWidth: 150 }}
          placeholder={t.tasks.filters.contact}
        />
        <Chip
          variant="outlined"
          size="small"
          label={t.tasks.counts.total.replace('{count}', String(total))}
        />
      </Box>

      {/* Kanban view */}
      {viewMode === 'kanban' ? (
        <TasksKanbanBoard
          tasks={rows}
          filters={filters as unknown as Record<string, unknown>}
        />
      ) : (
        <>
          {/* Empty state */}
          {rows.length === 0 && !hasFilters ? (
            <EmptyState
              icon={CheckSquare}
              title={t.tasks.emptyTitle}
              description={t.tasks.emptyDescription}
              actionLabel={t.tasks.createTask}
              onAction={() => setCreateOpen(true)}
            />
          ) : (
            <>
              <TableContainer sx={{ flex: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t.tasks.dialog.titleLabel}</TableCell>
                      <TableCell>{t.tasks.filters.sourceType}</TableCell>
                      <TableCell>{t.tasks.filters.status}</TableCell>
                      <TableCell>{t.tasks.filters.priority}</TableCell>
                      <TableCell>{t.tasks.dialog.dueDateLabel}</TableCell>
                      <TableCell>{t.tasks.filters.contact}</TableCell>
                      <TableCell width={100} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((task: UnifiedTask) => (
                      <TableRow key={task.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500} color="primary">
                            {task.title}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t.tasks.sourceTypes[task.sourceType]}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t.tasks.statuses[task.status]}
                            size="small"
                            color={statusChipColor(task.status)}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t.tasks.priorities[task.priority]}
                            size="small"
                            color={priorityChipColor(task.priority)}
                            variant={task.priority === 'low' ? 'outlined' : 'filled'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color={task.dueDate && isOverdue(task.dueDate) ? 'error.main' : 'text.primary'}
                          >
                            {formatDate(task.dueDate)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {task.contactName ?? '\u2014'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {task.status !== 'completed' && (
                              <Tooltip title={t.tasks.completeTask}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleComplete(task)}
                                  disabled={completeTask.isPending}
                                  sx={{ minWidth: 36, minHeight: 36 }}
                                >
                                  <CheckSquare size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {task.sourceType === 'manual' && (
                              <Tooltip title={t.tasks.deleteTask}>
                                <IconButton
                                  size="small"
                                  onClick={() => setDeleteTarget(task)}
                                  sx={{ minWidth: 36, minHeight: 36 }}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && hasFilters && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">{t.tasks.noFilterResults}</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50]}
                labelRowsPerPage={tc?.rowsPerPage ?? 'Rows per page:'}
                labelDisplayedRows={({ from, to, count }) =>
                  (tc?.displayedRows ?? '{from}-{to} of {count}')
                    .replace('{from}', String(from))
                    .replace('{to}', String(to))
                    .replace('{count}', count !== -1 ? String(count) : `more than ${to}`)
                }
              />
            </>
          )}
        </>
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <SavedViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        currentFilters={currentFilters}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t.tasks.deleteTask}
        message={t.tasks.deleteConfirm}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        confirmDisabled={deleteTask.isPending}
      />
    </Box>
  );
}
