import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TablePagination,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  Clock3,
  Handshake,
  Kanban,
  List,
  ListFilter,
  Plus,
  Search,
  Ticket,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
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
import { SavedViewsBar } from './SavedViewsBar';
import { SavedViewDialog } from './SavedViewDialog';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { TasksKanbanBoard } from './TasksKanbanBoard';
import type {
  UnifiedTask,
  ListTasksQuery,
  TaskSmartView,
  TaskSourceType,
  UnifiedTaskStatus,
  UnifiedTaskPriority,
} from '@/lib/api/tasks';

type ViewMode = 'list' | 'kanban';
type QuickView = 'open' | 'today' | 'overdue' | 'manual' | 'ticket' | 'completed';

const SOURCE_TYPE_OPTIONS: TaskSourceType[] = ['follow_up', 'reminder', 'deal_action', 'ticket', 'manual'];
const STATUS_OPTIONS: UnifiedTaskStatus[] = ['pending', 'in_progress', 'completed', 'dismissed', 'expired'];
const PRIORITY_OPTIONS: UnifiedTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

const SOURCE_ICONS: Record<TaskSourceType, React.ElementType> = {
  follow_up: Clock3,
  reminder: Bell,
  deal_action: Handshake,
  ticket: Ticket,
  manual: CheckSquare,
};

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

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function startOfToday() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function matchesSearch(task: UnifiedTask, query: string) {
  if (!query) return true;
  const haystack = [
    task.title,
    task.description,
    task.contactName,
    task.sourceType,
    task.status,
    task.priority,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

interface MetricCardProps {
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'info' | 'neutral';
  helper: string;
}

function MetricCard({ label, value, tone, helper }: MetricCardProps) {
  const theme = useTheme();

  const toneMap = {
    danger: {
      fg: theme.palette.error.dark,
      bg: alpha(theme.palette.error.light, 0.06),
      border: alpha(theme.palette.error.main, 0.18),
      accent: theme.palette.error.main,
    },
    warning: {
      fg: theme.palette.warning.dark,
      bg: alpha(theme.palette.warning.light, 0.07),
      border: alpha(theme.palette.warning.main, 0.18),
      accent: theme.palette.warning.main,
    },
    info: {
      fg: theme.palette.info.dark,
      bg: alpha(theme.palette.info.light, 0.08),
      border: alpha(theme.palette.info.main, 0.18),
      accent: theme.palette.info.main,
    },
    neutral: {
      fg: theme.palette.text.primary,
      bg: alpha(theme.palette.background.paper, 0.96),
      border: alpha(theme.palette.divider, 0.9),
      accent: theme.palette.text.secondary,
    },
  }[tone];

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        borderRadius: 3.25,
        border: 1,
        borderColor: toneMap.border,
        bgcolor: toneMap.bg,
        minHeight: 92,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: toneMap.accent,
        }}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', pl: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.55, fontWeight: 800, color: toneMap.fg, pl: 0.5, fontSize: { xs: '1.9rem', md: '2rem' } }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, pl: 0.5, fontSize: '0.82rem' }}>
        {helper}
      </Typography>
    </Paper>
  );
}

interface TaskQueueItemProps {
  task: UnifiedTask;
  selected: boolean;
  isMobile: boolean;
  formatDate: (dateStr: string | null) => string;
  onOpen: (task: UnifiedTask) => void;
  onComplete: (task: UnifiedTask) => void;
  onDelete: (task: UnifiedTask) => void;
  isCompleting: boolean;
}

function TaskQueueItem({
  task,
  selected,
  isMobile,
  formatDate,
  onOpen,
  onComplete,
  onDelete,
  isCompleting,
}: TaskQueueItemProps) {
  const t = useTranslations();
  const theme = useTheme();
  const SourceIcon = SOURCE_ICONS[task.sourceType];
  const overdue = isOverdue(task.dueDate);
  const dueToday = isDueToday(task.dueDate);

  return (
    <Paper
      elevation={0}
      onClick={() => onOpen(task)}
      sx={{
        p: { xs: 1.4, md: 1.65 },
        borderRadius: 3.25,
        border: 1,
        borderColor: selected ? alpha(theme.palette.primary.main, 0.7) : alpha(theme.palette.divider, 0.96),
        bgcolor: selected ? alpha(theme.palette.primary.light, 0.07) : theme.palette.background.paper,
        cursor: 'pointer',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.35),
          boxShadow: `0 10px 22px ${alpha(theme.palette.common.black, 0.06)}`,
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.9fr) minmax(240px, 0.95fr) auto' },
          gap: 1.5,
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.1, minWidth: 0 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.light, 0.1),
              color: 'text.secondary',
              flexShrink: 0,
            }}
          >
            <SourceIcon size={16} />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
              {task.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.25,
                display: '-webkit-box',
                overflow: 'hidden',
                WebkitLineClamp: isMobile ? 2 : 1,
                WebkitBoxOrient: 'vertical',
                fontSize: '0.84rem',
              }}
            >
              {task.description || t.tasks.workspaceView.noDescription}
            </Typography>

            <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap" sx={{ mt: 0.85 }}>
              <Chip size="small" variant="outlined" label={t.tasks.sourceTypes[task.sourceType]} sx={{ height: 22, '& .MuiChip-label': { px: 1, fontWeight: 700 } }} />
              <Chip size="small" color={statusChipColor(task.status)} label={t.tasks.statuses[task.status]} sx={{ height: 22, '& .MuiChip-label': { px: 1, fontWeight: 700 } }} />
              <Chip
                size="small"
                color={priorityChipColor(task.priority)}
                variant={task.priority === 'low' ? 'outlined' : 'filled'}
                label={t.tasks.priorities[task.priority]}
                sx={{ height: 22, '& .MuiChip-label': { px: 1, fontWeight: 700 } }}
              />
            </Stack>
          </Box>
        </Box>

        <Stack spacing={0.7}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarDays size={14} />
            <Typography
              variant="caption"
              sx={{
                color: overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.primary',
                fontWeight: overdue || dueToday ? 700 : 500,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {formatDate(task.dueDate)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <UserRound size={14} />
            <Typography variant="caption" color="text.secondary">
              {task.contactName ?? '\u2014'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Clock3 size={14} />
            <Typography variant="caption" color="text.secondary">
              {formatDate(task.updatedAt ?? task.createdAt)}
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: 'row', md: 'column' }} spacing={0.75} sx={{ justifySelf: { md: 'end' } }}>
          {task.status !== 'completed' && (
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckSquare size={15} />}
              onClick={(event) => {
                event.stopPropagation();
                onComplete(task);
              }}
              disabled={isCompleting}
              sx={{ minWidth: { md: 112 }, fontWeight: 700 }}
            >
              {t.tasks.completeTask}
            </Button>
          )}
          {task.sourceType === 'manual' && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<Trash2 size={15} />}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(task);
              }}
              sx={{ fontWeight: 700 }}
            >
              {t.common.delete}
            </Button>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}

export function TasksList() {
  const t = useTranslations();
  const tc = t.common;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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

  const q = router.query;
  const [viewMode, setViewMode] = useState<ViewMode>(() => (q.viewMode === 'kanban' ? 'kanban' : 'list'));
  const [filterSourceType, setFilterSourceType] = useState(() => (typeof q.type === 'string' ? q.type : ''));
  const [filterStatus, setFilterStatus] = useState(() => (typeof q.status === 'string' ? q.status : ''));
  const [filterPriority, setFilterPriority] = useState(() => (typeof q.priority === 'string' ? q.priority : ''));
  const [filterDueBefore, setFilterDueBefore] = useState(() => (typeof q.dueBefore === 'string' ? q.dueBefore : ''));
  const [filterDueAfter, setFilterDueAfter] = useState(() => (typeof q.dueAfter === 'string' ? q.dueAfter : ''));
  const [filterContactId, setFilterContactId] = useState(() => (typeof q.contactId === 'string' ? q.contactId : ''));
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(() => {
    const p = parseInt(typeof q.page === 'string' ? q.page : '', 10);
    return isNaN(p) ? 0 : p;
  });
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(() => (typeof q.view === 'string' ? q.view : null));
  const [deleteTarget, setDeleteTarget] = useState<UnifiedTask | null>(null);
  const [selectedTask, setSelectedTask] = useState<UnifiedTask | null>(null);

  const deferredSearch = useDeferredValue(searchQuery.trim());

  const { data: smartViewsData } = useSmartViews();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  useEffect(() => {
    if (!router.isReady) return;
    const viewId = typeof q.view === 'string' ? q.view : null;
    if (!viewId || !smartViewsData) return;
    const view = smartViewsData.find((item: TaskSmartView) => item.id === viewId);
    if (!view) return;
    const f = view.filters as Partial<ListTasksQuery>;
    setFilterSourceType(f.sourceType?.[0] ?? '');
    setFilterStatus(f.status?.[0] ?? '');
    setFilterPriority(f.priority?.[0] ?? '');
    setFilterDueBefore(f.dueBefore ?? '');
    setFilterDueAfter(f.dueAfter ?? '');
    setFilterContactId(f.contactId ?? '');
    setActiveViewId(view.id);
  }, [q.view, router.isReady, smartViewsData]);

  useEffect(() => {
    if (!router.isReady || router.query.action !== 'create') return;
    setCreateOpen(true);
    const { action, ...nextQuery } = router.query;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [router.isReady, router.pathname, router.query]);

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
    // `router` intentionally omitted: Next.js mutates its identity on every
    // replace, so including it here causes an infinite replace loop that
    // cancels user-initiated navigation (confirmed 55 nav events / 5s).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeViewId,
    filterContactId,
    filterDueAfter,
    filterDueBefore,
    filterPriority,
    filterSourceType,
    filterStatus,
    page,
    viewMode,
  ]);

  const filters: ListTasksQuery = useMemo(
    () => ({
      sourceType: filterSourceType ? [filterSourceType as TaskSourceType] : undefined,
      status: filterStatus ? [filterStatus as UnifiedTaskStatus] : ['pending', 'in_progress'],
      priority: filterPriority ? [filterPriority as UnifiedTaskPriority] : undefined,
      dueBefore: filterDueBefore || undefined,
      dueAfter: filterDueAfter || undefined,
      contactId: filterContactId || undefined,
      page: page + 1,
      limit: rowsPerPage,
    }),
    [filterContactId, filterDueAfter, filterDueBefore, filterPriority, filterSourceType, filterStatus, page, rowsPerPage],
  );

  const { data, isLoading, isError, error } = useTasks(filters);

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  useEffect(() => {
    if (!selectedTask) return;
    const fresh = rows.find((task) => task.id === selectedTask.id);
    if (fresh) setSelectedTask(fresh);
  }, [rows, selectedTask]);

  const visibleRows = useMemo(
    () => rows.filter((task) => matchesSearch(task, deferredSearch)),
    [rows, deferredSearch],
  );

  const metrics = useMemo(() => ({
    overdue: visibleRows.filter((task) => isOverdue(task.dueDate)).length,
    today: visibleRows.filter((task) => isDueToday(task.dueDate)).length,
    inProgress: visibleRows.filter((task) => task.status === 'in_progress').length,
    waiting: visibleRows.filter((task) => task.sourceType === 'follow_up').length,
  }), [visibleRows]);

  const activeTaskCount = metrics.overdue + metrics.today + metrics.inProgress + metrics.waiting;
  const overdueLabel = t.common.overdue ?? t.tasks.overdue;
  const dueTodayLabel = t.common.today ?? t.tasks.dueToday;
  const inProgressLabel = t.tasks.statuses.in_progress ?? 'In progress';
  const waitingLabel = t.tasks.waitingFor ?? 'Waiting';

  const handleComplete = useCallback(
    async (task: UnifiedTask) => {
      try {
        await completeTask.mutateAsync({ sourceType: task.sourceType, id: task.sourceId });
        toast.success(t.tasks.completed);
      } catch {
        toast.error(t.tasks.completeError);
      }
    },
    [completeTask, t.tasks.completeError, t.tasks.completed, toast],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask.mutateAsync({ sourceType: deleteTarget.sourceType, id: deleteTarget.sourceId });
      toast.success(t.tasks.deleted);
      if (selectedTask?.id === deleteTarget.id) {
        setSelectedTask(null);
      }
    } catch {
      toast.error(t.tasks.deleteError);
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteTask, selectedTask?.id, t.tasks.deleteError, t.tasks.deleted, toast]);

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
      setPage(0);
      toast.success(t.tasks.smartViews.applied);
    },
    [t.tasks.smartViews.applied, toast],
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
    [filterContactId, filterDueAfter, filterDueBefore, filterPriority, filterSourceType, filterStatus],
  );

  const hasFilters = !!(filterSourceType || filterStatus || filterPriority || filterDueBefore || filterDueAfter || filterContactId);
  const hasSearch = !!deferredSearch;
  const activeFilterCount = [filterSourceType, filterStatus, filterPriority, filterDueBefore, filterDueAfter, filterContactId].filter(Boolean).length;

  useEffect(() => {
    if (hasFilters) {
      setShowAdvancedFilters(true);
    }
  }, [hasFilters]);

  const clearFilters = useCallback(() => {
    setFilterSourceType('');
    setFilterStatus('');
    setFilterPriority('');
    setFilterDueBefore('');
    setFilterDueAfter('');
    setFilterContactId('');
    setActiveViewId(null);
    setPage(0);
    setShowAdvancedFilters(false);
  }, []);

  const applyQuickView = useCallback((quickView: QuickView) => {
    const today = startOfToday();

    setPage(0);
    setActiveViewId(null);
    setFilterPriority('');
    setFilterContactId('');

    if (quickView === 'open') {
      setFilterSourceType('');
      setFilterStatus('');
      setFilterDueBefore('');
      setFilterDueAfter('');
      return;
    }

    if (quickView === 'today') {
      setFilterSourceType('');
      setFilterStatus('');
      setFilterDueAfter(today);
      setFilterDueBefore(today);
      return;
    }

    if (quickView === 'overdue') {
      setFilterSourceType('');
      setFilterStatus('');
      setFilterDueAfter('');
      setFilterDueBefore(yesterday());
      return;
    }

    if (quickView === 'manual') {
      setFilterSourceType('manual');
      setFilterStatus('');
      setFilterDueBefore('');
      setFilterDueAfter('');
      return;
    }

    if (quickView === 'ticket') {
      setFilterSourceType('ticket');
      setFilterStatus('');
      setFilterDueBefore('');
      setFilterDueAfter('');
      return;
    }

    setFilterSourceType('');
    setFilterStatus('completed');
    setFilterDueBefore('');
    setFilterDueAfter('');
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1360 }}>
        <Skeleton width="30%" height={36} animation="wave" sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} animation="wave" sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={84} animation="wave" sx={{ mb: 2 }} />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} variant="rounded" height={92} animation="wave" sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1360 }}>
        <Alert severity="error">{(error as Error)?.message ?? t.tasks.errorLoading}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1360 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          borderRadius: 4.5,
          border: 1,
          borderColor: alpha(theme.palette.primary.main, 0.12),
          bgcolor: alpha(theme.palette.background.paper, 0.98),
          boxShadow: `0 10px 30px ${alpha(theme.palette.common.black, 0.04)}`,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 3,
            background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.info.main, 0.6)} 100%)`,
          },
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.45fr) auto' },
            gap: 1.5,
            alignItems: 'start',
          }}
        >
          <Box>
            <Typography variant="overline" sx={{ color: 'primary.dark', fontWeight: 800, letterSpacing: '0.14em', fontSize: '0.7rem' }}>
              {t.tasks.workspaceView.eyebrow}
            </Typography>
            <Typography
              variant="h3"
              sx={{ mt: 0.15, fontWeight: 800, letterSpacing: '-0.04em', fontSize: { xs: '1.95rem', md: '2.45rem' } }}
            >
              {t.tasks.title}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.55, maxWidth: 700, fontSize: { xs: '0.98rem', md: '1rem' } }}>
              {t.tasks.description}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary', fontWeight: 600 }}>
              {t.tasks.workspaceView.summaryTemplate.replace('{count}', String(activeTaskCount))}
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, value) => {
                if (!value) return;
                setViewMode(value as ViewMode);
                setActiveViewId(null);
              }}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.background.default, 0.8),
                borderRadius: 999,
                '& .MuiToggleButton-root': {
                  px: 1.35,
                  py: 0.55,
                  border: 0,
                  borderRadius: '999px !important',
                  textTransform: 'none',
                  fontWeight: 700,
                  gap: 0.75,
                },
              }}
            >
              <ToggleButton value="list" aria-label={t.tasks.viewList}>
                <List size={16} />
                {!isMobile && t.tasks.viewList}
              </ToggleButton>
              <ToggleButton value="kanban" aria-label={t.tasks.viewKanban}>
                <Kanban size={16} />
                {!isMobile && t.tasks.viewKanban}
              </ToggleButton>
            </ToggleButtonGroup>

            <Button variant="contained" size="large" startIcon={<Plus size={18} />} onClick={() => setCreateOpen(true)} sx={{ minWidth: { xs: '100%', sm: 164 }, fontWeight: 700 }}>
              {t.tasks.createTask}
            </Button>
          </Stack>
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
          gap: 1.1,
          mt: 1.25,
        }}
      >
        <MetricCard label={overdueLabel} value={metrics.overdue} tone="danger" helper={t.tasks.workspaceView.metricHelpers.overdue} />
        <MetricCard label={dueTodayLabel} value={metrics.today} tone="warning" helper={t.tasks.workspaceView.metricHelpers.today} />
        <MetricCard label={inProgressLabel} value={metrics.inProgress} tone="info" helper={t.tasks.workspaceView.metricHelpers.inProgress} />
        <MetricCard label={waitingLabel} value={metrics.waiting} tone="neutral" helper={t.tasks.workspaceView.metricHelpers.waiting} />
      </Box>

      <SavedViewsBar
        activeViewId={activeViewId}
        onApplyView={applyView}
        onClearView={() => setActiveViewId(null)}
        onSaveClick={() => setSaveDialogOpen(true)}
        currentFilters={currentFilters}
      />

      <Paper elevation={0} sx={{ mt: 1.5, p: { xs: 1.4, md: 1.6 }, borderRadius: 4, border: 1, borderColor: alpha(theme.palette.divider, 0.95), boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.03)}` }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.3fr) auto' },
            gap: 1.1,
            alignItems: 'start',
          }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {t.tasks.workspaceView.commandTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.84rem' }}>
              {t.tasks.workspaceView.commandDescription}
            </Typography>
          </Box>

          <TextField
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t.tasks.searchPlaceholder}
            size="small"
            sx={{ minWidth: { lg: 260 }, '& .MuiOutlinedInput-root': { bgcolor: alpha(theme.palette.background.default, 0.7) } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} aria-label={t.tasks.workspaceView.clearSearch}>
                    <X size={16} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
        </Box>

        <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 1.35 }}>
          {(['open', 'today', 'overdue', 'manual', 'ticket', 'completed'] as QuickView[]).map((quickView) => (
            <Button
              key={quickView}
              size="small"
              variant="outlined"
              onClick={() => applyQuickView(quickView)}
              sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700, minHeight: 30, px: 1.3, borderColor: alpha(theme.palette.primary.main, 0.28) }}
            >
              {t.tasks.workspaceView.quickViews[quickView]}
            </Button>
          ))}
          <Button
            size="small"
            variant={showAdvancedFilters ? 'contained' : 'outlined'}
            color={showAdvancedFilters ? 'primary' : 'inherit'}
            startIcon={<ListFilter size={14} />}
            onClick={() => setShowAdvancedFilters((current) => !current)}
            sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700, minHeight: 30, px: 1.3 }}
          >
            {activeFilterCount > 0
              ? t.tasks.workspaceView.filtersButtonActive.replace('{count}', String(activeFilterCount))
              : t.tasks.workspaceView.filtersButton}
          </Button>
        </Stack>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.2, mt: 1.1, flexWrap: 'wrap' }}>
          <Chip
            label={t.tasks.workspaceView.searchResultsLabel.replace('{count}', String(hasSearch ? visibleRows.length : total))}
            color="primary"
            variant="outlined"
            sx={{ height: 26, '& .MuiChip-label': { px: 1, fontWeight: 700 } }}
          />
          {(hasFilters || hasSearch) && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                clearFilters();
                setSearchQuery('');
              }}
            >
              {t.tasks.filters.clearAll}
            </Button>
          )}
        </Box>

        {showAdvancedFilters && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
              gap: 1,
              mt: 1.1,
              alignItems: 'center',
            }}
          >
          <TextField
            label={t.tasks.filters.sourceType}
            value={filterSourceType}
            onChange={(event) => {
              setFilterSourceType(event.target.value);
              setPage(0);
              setActiveViewId(null);
            }}
            size="small"
            select
          >
            <MenuItem value="">{t.tasks.sourceTypes.all}</MenuItem>
            {SOURCE_TYPE_OPTIONS.map((type) => (
              <MenuItem key={type} value={type}>
                {t.tasks.sourceTypes[type]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={t.tasks.filters.status}
            value={filterStatus}
            onChange={(event) => {
              setFilterStatus(event.target.value);
              setPage(0);
              setActiveViewId(null);
            }}
            size="small"
            select
          >
            <MenuItem value="">{t.tasks.statuses.all}</MenuItem>
            {STATUS_OPTIONS.map((status) => (
              <MenuItem key={status} value={status}>
                {t.tasks.statuses[status]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={t.tasks.filters.priority}
            value={filterPriority}
            onChange={(event) => {
              setFilterPriority(event.target.value);
              setPage(0);
              setActiveViewId(null);
            }}
            size="small"
            select
          >
            <MenuItem value="">{t.tasks.priorities.all}</MenuItem>
            {PRIORITY_OPTIONS.map((priority) => (
              <MenuItem key={priority} value={priority}>
                {t.tasks.priorities[priority]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={t.tasks.filters.dueAfter}
            type="date"
            value={filterDueAfter}
            onChange={(event) => {
              setFilterDueAfter(event.target.value);
              setPage(0);
              setActiveViewId(null);
            }}
            size="small"
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label={t.tasks.filters.dueBefore}
            type="date"
            value={filterDueBefore}
            onChange={(event) => {
              setFilterDueBefore(event.target.value);
              setPage(0);
              setActiveViewId(null);
            }}
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          </Box>
        )}

        {filterContactId && (
          <Chip
            sx={{ mt: 1.5 }}
            label={`${t.tasks.filters.contact}: ${filterContactId}`}
            onDelete={() => setFilterContactId('')}
          />
        )}
      </Paper>

      {viewMode === 'kanban' ? (
        <Box sx={{ mt: 2 }}>
          <TasksKanbanBoard tasks={visibleRows} filters={filters as unknown as Record<string, unknown>} onTaskClick={setSelectedTask} />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ mt: 2, borderRadius: 4, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
          <Box sx={{ px: { xs: 1.75, md: 2 }, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.background.default, 0.52) }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {t.tasks.workspaceView.queueTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.84rem' }}>
              {t.tasks.workspaceView.queueDescription}
            </Typography>
          </Box>

          {rows.length === 0 && !hasFilters ? (
            <Box sx={{ p: 2 }}>
              <EmptyState
                icon={CheckSquare}
                title={t.tasks.emptyTitle}
                description={t.tasks.emptyDescription}
                actionLabel={t.tasks.createTask}
                onAction={() => setCreateOpen(true)}
              />
            </Box>
          ) : visibleRows.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <EmptyState
                icon={Search}
                title={hasSearch ? t.tasks.workspaceView.searchEmptyTitle : t.tasks.emptyTitle}
                description={hasSearch ? t.tasks.workspaceView.searchEmptyDescription : t.tasks.noFilterResults}
                actionLabel={hasFilters || hasSearch ? t.tasks.filters.clearAll : t.tasks.createTask}
                onAction={() => {
                  if (hasFilters || hasSearch) {
                    clearFilters();
                    setSearchQuery('');
                    return;
                  }
                  setCreateOpen(true);
                }}
              />
            </Box>
          ) : (
            <Stack spacing={1} sx={{ p: { xs: 1.25, md: 1.5 } }}>
              {visibleRows.map((task) => (
                <TaskQueueItem
                  key={task.id}
                  task={task}
                  selected={selectedTask?.id === task.id}
                  isMobile={isMobile}
                  formatDate={formatDate}
                  onOpen={setSelectedTask}
                  onComplete={handleComplete}
                  onDelete={setDeleteTarget}
                  isCompleting={completeTask.isPending}
                />
              ))}
            </Stack>
          )}

          <Divider />
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage={tc?.rowsPerPage ?? 'Rows per page:'}
            labelDisplayedRows={({ from, to, count }) =>
              (tc?.displayedRows ?? '{from}-{to} of {count}')
                .replace('{from}', String(from))
                .replace('{to}', String(to))
                .replace('{count}', count !== -1 ? String(count) : `more than ${to}`)
            }
          />
        </Paper>
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <SavedViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        currentFilters={currentFilters}
      />

      <TaskDetailDrawer
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onComplete={handleComplete}
        onDelete={setDeleteTarget}
        formatDate={formatDate}
        isCompleting={completeTask.isPending}
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
