'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  alpha,
  useTheme,
  useMediaQuery,
  IconButton,
  Tooltip,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Search, Bell, Clock, AlertTriangle, CheckCircle, Calendar, Keyboard } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  usePendingFollowUps,
  useFollowUpStats,
  useUpdateFollowUpStatus,
  useSnoozeFollowUp,
  useDeleteFollowUp,
  type EmailFollowUp,
} from '@/hooks/queries';
import type { Theme } from '@mui/material';
import { KanbanColumn } from './KanbanColumn';
import { KanbanSkeleton } from './KanbanSkeleton';
import { FollowUpCard } from '@/components/ai/FollowUpTracker/FollowUpCard';
import { SnoozeDialog } from './SnoozeDialog';

// Column configuration - actionable view (not strictly matching Prisma enum)
// "overdue" is a virtual column for items past due date
type KanbanColumnId = 'PENDING' | 'OVERDUE' | 'RESOLVED' | 'EXPIRED';
const COLUMNS: { id: KanbanColumnId; title: string; titleKey: string; color: string }[] = [
  { id: 'PENDING', title: 'Pending', titleKey: 'pending', color: 'warning.main' },
  { id: 'OVERDUE', title: 'Overdue', titleKey: 'overdue', color: 'error.main' },
  { id: 'RESOLVED', title: 'Resolved', titleKey: 'resolved', color: 'success.main' },
  { id: 'EXPIRED', title: 'Expired', titleKey: 'expired', color: 'grey.500' },
];

// Date helper for drag-drop snooze
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function FollowupsKanbanBoard() {
  const theme = useTheme();
  const t = useTranslations();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'WAITING_FOR' | 'TODO' | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Keyboard navigation state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedColumnIdx, setSelectedColumnIdx] = useState(0);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Queries — only pending follow-ups supported by backend
  const { data: pendingData, isLoading, error } = usePendingFollowUps(200);
  const data = pendingData ? { followUps: pendingData.followUps as unknown as EmailFollowUp[], count: pendingData.count } : undefined;
  const { data: stats } = useFollowUpStats();

  // Mutations
  const updateStatus = useUpdateFollowUpStatus();
  const snoozeFollowUp = useSnoozeFollowUp();
  const deleteFollowUp = useDeleteFollowUp();

  // Sensors for pointer (mouse/touch) and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Filter and group follow-ups into actionable columns
  // OVERDUE is a virtual column for items past due date (regardless of PENDING/REMINDED status)
  const columns = useMemo(() => {
    const grouped: Record<KanbanColumnId, EmailFollowUp[]> = {
      PENDING: [],
      OVERDUE: [],
      RESOLVED: [],
      EXPIRED: [],
    };

    const followUps = data?.followUps || [];
    const query = searchQuery.toLowerCase();
    const now = new Date();

    followUps.forEach((f) => {
      // Apply search filter
      if (query) {
        const matchesSearch =
          f.email?.subject?.toLowerCase().includes(query) ||
          f.email?.from?.toLowerCase().includes(query) ||
          f.reason?.toLowerCase().includes(query);
        if (!matchesSearch) return;
      }

      // Group by actionable status
      if (f.status === 'RESOLVED') {
        grouped.RESOLVED.push(f);
      } else if (f.status === 'EXPIRED') {
        grouped.EXPIRED.push(f);
      } else {
        // PENDING or REMINDED - check if overdue
        const dueDate = f.dueDate ? new Date(f.dueDate) : null;
        const isOverdue = dueDate && dueDate < now;
        if (isOverdue) {
          grouped.OVERDUE.push(f);
        } else {
          grouped.PENDING.push(f);
        }
      }
    });

    return grouped;
  }, [data?.followUps, searchQuery]);

  // Get active item for drag overlay
  const activeItem = useMemo(() => {
    if (!activeId || !data?.followUps) return null;
    return data.followUps.find((f) => f.id === activeId);
  }, [activeId, data?.followUps]);

  // Column order for keyboard navigation
  const columnOrder: KanbanColumnId[] = ['PENDING', 'OVERDUE', 'RESOLVED', 'EXPIRED'];

  // Get selected item
  const selectedItem = useMemo(() => {
    if (!selectedId || !data?.followUps) return null;
    return data.followUps.find((f) => f.id === selectedId);
  }, [selectedId, data?.followUps]);

  // Keyboard shortcuts
  useHotkeys('j', () => {
    // Move down in current column
    const currentColumn = columnOrder[selectedColumnIdx];
    const items = columns[currentColumn] || [];
    if (items.length === 0) return;

    const currentIdx = selectedId ? items.findIndex((i) => i.id === selectedId) : -1;
    const nextIdx = Math.min(currentIdx + 1, items.length - 1);
    setSelectedId(items[nextIdx]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [columns, selectedColumnIdx, selectedId]);

  useHotkeys('k', () => {
    // Move up in current column
    const currentColumn = columnOrder[selectedColumnIdx];
    const items = columns[currentColumn] || [];
    if (items.length === 0) return;

    const currentIdx = selectedId ? items.findIndex((i) => i.id === selectedId) : items.length;
    const prevIdx = Math.max(currentIdx - 1, 0);
    setSelectedId(items[prevIdx]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [columns, selectedColumnIdx, selectedId]);

  useHotkeys('h', () => {
    // Move to previous column
    const newIdx = Math.max(selectedColumnIdx - 1, 0);
    setSelectedColumnIdx(newIdx);
    const newColumn = columnOrder[newIdx];
    const items = columns[newColumn] || [];
    setSelectedId(items[0]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [selectedColumnIdx, columns]);

  useHotkeys('l', () => {
    // Move to next column
    const newIdx = Math.min(selectedColumnIdx + 1, columnOrder.length - 1);
    setSelectedColumnIdx(newIdx);
    const newColumn = columnOrder[newIdx];
    const items = columns[newColumn] || [];
    setSelectedId(items[0]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [selectedColumnIdx, columns]);

  useHotkeys('enter', () => {
    // Open selected email
    if (selectedItem?.emailId) {
      router.push(`/dashboard/email?id=${selectedItem.emailId}`);
    }
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedItem }, [selectedItem, router]);

  useHotkeys('r', () => {
    // Resolve selected item
    if (selectedId && selectedItem?.status !== 'RESOLVED') {
      handleResolve(selectedId);
    }
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedId }, [selectedId, selectedItem]);

  useHotkeys('s', () => {
    // Snooze selected item
    if (selectedId && selectedItem?.status === 'PENDING') {
      handleOpenSnooze(selectedId);
    }
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedId }, [selectedId, selectedItem]);

  useHotkeys('shift+/', () => {
    // Show help (? key)
    setHelpDialogOpen(true);
  }, { enabled: !snoozeDialogOpen }, []);

  useHotkeys('escape', () => {
    // Clear selection or close dialogs
    if (helpDialogOpen) {
      setHelpDialogOpen(false);
    } else if (snoozeDialogOpen) {
      setSnoozeDialogOpen(false);
    } else {
      setSelectedId(null);
    }
  }, [helpDialogOpen, snoozeDialogOpen]);

  // Handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !data?.followUps) return;

    const followUpId = active.id as string;
    const item = data.followUps.find((f) => f.id === followUpId);
    if (!item) return;

    // Determine target column (either column ID or card's column)
    const validColumns: KanbanColumnId[] = ['PENDING', 'OVERDUE', 'RESOLVED', 'EXPIRED'];
    let targetColumn: KanbanColumnId;

    if (validColumns.includes(over.id as KanbanColumnId)) {
      targetColumn = over.id as KanbanColumnId;
    } else {
      // Dropped on a card - find which column that card is in
      const targetCard = data.followUps.find((f) => f.id === over.id);
      if (!targetCard) return;
      // Determine target card's virtual column
      const now = new Date();
      const targetDueDate = targetCard.dueDate ? new Date(targetCard.dueDate) : null;
      const targetIsOverdue = targetDueDate && targetDueDate < now;
      if (targetCard.status === 'RESOLVED') {
        targetColumn = 'RESOLVED';
      } else if (targetCard.status === 'EXPIRED') {
        targetColumn = 'EXPIRED';
      } else if (targetIsOverdue) {
        targetColumn = 'OVERDUE';
      } else {
        targetColumn = 'PENDING';
      }
    }

    // Determine current item's virtual column
    const now = new Date();
    const itemDueDate = item.dueDate ? new Date(item.dueDate) : null;
    const itemIsOverdue = itemDueDate && itemDueDate < now;
    let currentColumn: KanbanColumnId;
    if (item.status === 'RESOLVED') {
      currentColumn = 'RESOLVED';
    } else if (item.status === 'EXPIRED') {
      currentColumn = 'EXPIRED';
    } else if (itemIsOverdue) {
      currentColumn = 'OVERDUE';
    } else {
      currentColumn = 'PENDING';
    }

    // No change if same column
    if (currentColumn === targetColumn) return;

    setResolvingId(followUpId);
    try {
      // Handle special cases
      if (targetColumn === 'OVERDUE') {
        // Can't manually move to OVERDUE - it's date-based
        // Just ignore this drop
        return;
      } else if (targetColumn === 'PENDING' && currentColumn === 'OVERDUE') {
        // Moving from OVERDUE to PENDING = snooze (extend due date)
        const newDueDate = addDays(new Date(), 3); // Default snooze 3 days
        await snoozeFollowUp.mutateAsync({ id: followUpId, dueDate: newDueDate.toISOString() });
      } else if (targetColumn === 'RESOLVED') {
        await updateStatus.mutateAsync({ id: followUpId, status: 'RESOLVED' });
      } else if (targetColumn === 'EXPIRED') {
        await updateStatus.mutateAsync({ id: followUpId, status: 'EXPIRED' });
      } else if (targetColumn === 'PENDING') {
        // Moving to PENDING from RESOLVED/EXPIRED - reactivate
        await updateStatus.mutateAsync({ id: followUpId, status: 'PENDING' });
      }
    } finally {
      setResolvingId(null);
    }
  }, [data?.followUps, updateStatus, snoozeFollowUp]);

  const handleResolve = useCallback(async (id: string) => {
    setResolvingId(id);
    try {
      await updateStatus.mutateAsync({ id, status: 'RESOLVED' });
    } finally {
      setResolvingId(null);
    }
  }, [updateStatus]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteFollowUp.mutateAsync(id);
    } catch {
      // Error handled by mutation
    }
  }, [deleteFollowUp]);

  const handleOpenSnooze = useCallback((id: string) => {
    setSnoozeTargetId(id);
    setSnoozeDialogOpen(true);
  }, []);

  const handleSnooze = useCallback(async (date: Date) => {
    if (!snoozeTargetId) return;


    try {
      await snoozeFollowUp.mutateAsync({
        id: snoozeTargetId,
        dueDate: date.toISOString(),
      });
      setSnoozeDialogOpen(false);
      setSnoozeTargetId(null);
    } catch {
      // Error handled by mutation
    }
  }, [snoozeTargetId, snoozeFollowUp]);

  const handleViewEmail = useCallback((emailId: string) => {
    router.push(`/dashboard/email?id=${emailId}`);
  }, [router]);

  // Get translated column title
  const getColumnTitle = (titleKey: string): string => {
    const kanban = t.ai.followUpTracker.kanban;
    if (kanban?.columns && titleKey in kanban.columns) {
      return kanban.columns[titleKey as keyof typeof kanban.columns];
    }
    // Fallback to status translation
    const status = t.ai.followUpTracker.status;
    if (status && titleKey.toUpperCase() in status) {
      return status[titleKey.toUpperCase() as keyof typeof status];
    }
    return titleKey.charAt(0).toUpperCase() + titleKey.slice(1);
  };

  if (isLoading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Header
          theme={theme}
          t={t}
          stats={stats}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          onShowHelp={() => setHelpDialogOpen(true)}
        />
        <KanbanSkeleton />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">{t.ai.followUpTracker.error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header
        theme={theme}
        t={t}
        stats={stats}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        onShowHelp={() => setHelpDialogOpen(true)}
      />

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            gap: isMobile ? 1.5 : 2,
            overflowX: 'auto',
            p: isMobile ? 1 : 2,
            minHeight: isMobile ? 400 : 500,
            // Mobile: snap scrolling for columns
            scrollSnapType: isMobile ? 'x mandatory' : 'none',
            '& > *': {
              scrollSnapAlign: isMobile ? 'start' : 'none',
              // Mobile: narrower columns
              minWidth: isMobile ? 260 : 300,
              maxWidth: isMobile ? 260 : 300,
            },
          }}
        >
          {COLUMNS.map((col, idx) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={getColumnTitle(col.titleKey)}
              color={col.color}
              items={columns[col.id]}
              onResolve={handleResolve}
              onSnooze={handleOpenSnooze}
              onViewEmail={handleViewEmail}
              onDelete={handleDelete}
              resolvingId={resolvingId}
              selectedId={selectedColumnIdx === idx ? selectedId : null}
            />
          ))}
        </Box>

        {/* Drag overlay */}
        <DragOverlay>
          {activeItem ? (
            <Box sx={{ opacity: 0.9, transform: 'rotate(3deg)' }}>
              <FollowUpCard followUp={activeItem} />
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Snooze Dialog */}
      <SnoozeDialog
        open={snoozeDialogOpen}
        onClose={() => {
          setSnoozeDialogOpen(false);
          setSnoozeTargetId(null);
        }}
        followUpId={snoozeTargetId}
        onSnooze={handleSnooze}
      />

      {/* Keyboard Shortcuts Help Dialog */}
      <Dialog
        open={helpDialogOpen}
        onClose={() => setHelpDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Keyboard size={20} />
          {t.ai.followUpTracker.kanban?.keyboard?.title || 'Keyboard Shortcuts'}
        </DialogTitle>
        <DialogContent>
          {/* Navigation */}
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t.ai.followUpTracker.kanban?.keyboard?.navigation || 'Navigation'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            <ShortcutRow keys={['j']} label={t.ai.followUpTracker.kanban?.keyboard?.moveDown || 'Move down'} />
            <ShortcutRow keys={['k']} label={t.ai.followUpTracker.kanban?.keyboard?.moveUp || 'Move up'} />
            <ShortcutRow keys={['h']} label={t.ai.followUpTracker.kanban?.keyboard?.prevColumn || 'Previous column'} />
            <ShortcutRow keys={['l']} label={t.ai.followUpTracker.kanban?.keyboard?.nextColumn || 'Next column'} />
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Actions */}
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t.ai.followUpTracker.kanban?.keyboard?.actions || 'Actions'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ShortcutRow keys={['Enter']} label={t.ai.followUpTracker.kanban?.keyboard?.openEmail || 'Open email'} />
            <ShortcutRow keys={['r']} label={t.ai.followUpTracker.kanban?.keyboard?.resolve || 'Resolve'} />
            <ShortcutRow keys={['s']} label={t.ai.followUpTracker.kanban?.keyboard?.snooze || 'Snooze'} />
            <ShortcutRow keys={['?']} label={t.ai.followUpTracker.kanban?.keyboard?.showHelp || 'Show help'} />
            <ShortcutRow keys={['Esc']} label={t.ai.followUpTracker.kanban?.keyboard?.clearSelection || 'Clear selection'} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpDialogOpen(false)}>
            {t.common.close || 'Close'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Helper component for keyboard shortcut rows
function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {keys.map((key) => (
          <Box
            key={key}
            component="kbd"
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              fontWeight: 600,
              minWidth: 24,
              textAlign: 'center',
            }}
          >
            {key}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Header component (extracted for reuse)
interface HeaderProps {
  theme: Theme;
  t: ReturnType<typeof useTranslations>;
  stats?: { pending: number; overdue: number; dueToday: number; resolved: number } | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  typeFilter?: 'WAITING_FOR' | 'TODO';
  onTypeFilterChange?: (value: 'WAITING_FOR' | 'TODO' | undefined) => void;
  onShowHelp?: () => void;
}

function Header({ theme, t, stats, searchQuery, onSearchChange, typeFilter, onTypeFilterChange, onShowHelp }: HeaderProps) {
  return (
    <Box sx={{ mb: 2, px: 2, pt: 2 }}>
      {/* Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.warning.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'warning.main',
          }}
        >
          <Bell size={24} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t.ai.followUpTracker.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t.ai.followUpTracker.kanban?.subtitle || t.ai.followUpTracker.subtitle}
          </Typography>
        </Box>
        {/* Keyboard shortcuts hint */}
        <Tooltip title={t.ai.followUpTracker.kanban?.keyboard?.title || 'Keyboard Shortcuts'}>
          <IconButton
            size="small"
            onClick={onShowHelp}
            sx={{ color: 'text.secondary' }}
          >
            <Keyboard size={20} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 3, mt: 2, mb: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Clock size={16} color={theme.palette.warning.main} />
            <Typography variant="body2" color="text.secondary">
              <strong>{stats.pending}</strong> {t.ai.followUpTracker.stats.pending.toLowerCase()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={16} color={theme.palette.error.main} />
            <Typography variant="body2" color="text.secondary">
              <strong>{stats.overdue}</strong> {t.ai.followUpTracker.stats.overdue.toLowerCase()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calendar size={16} color={theme.palette.info.main} />
            <Typography variant="body2" color="text.secondary">
              <strong>{stats.dueToday}</strong> {t.ai.followUpTracker.stats.dueToday.toLowerCase()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircle size={16} color={theme.palette.success.main} />
            <Typography variant="body2" color="text.secondary">
              <strong>{stats.resolved}</strong> {t.ai.followUpTracker.stats.resolved.toLowerCase()}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Search */}
      <TextField
        fullWidth
        size="small"
        placeholder={t.ai.followUpTracker.searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={18} />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
          },
        }}
      />

      {/* Type Filter */}
      {onTypeFilterChange && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            {t.ai.followUpTracker.types.all}:
          </Typography>
          <ToggleButtonGroup
            value={typeFilter || ''}
            exclusive
            onChange={(_, newValue) => onTypeFilterChange(newValue === '' ? undefined : newValue)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                px: 2,
                py: 0.5,
                fontSize: '0.875rem',
              },
            }}
          >
            <ToggleButton value="">
              {t.ai.followUpTracker.types.all}
            </ToggleButton>
            <ToggleButton value="WAITING_FOR">
              {t.ai.followUpTracker.types.waitingFor}
            </ToggleButton>
            <ToggleButton value="TODO">
              {t.ai.followUpTracker.types.todo}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}
    </Box>
  );
}

export default FollowupsKanbanBoard;
