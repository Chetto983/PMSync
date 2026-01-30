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
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  alpha,
  useTheme,
  IconButton,
  Tooltip,
  Divider,
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
  useFollowUpsList,
  useFollowUpStats,
  useSnoozeFollowUp,
  useUpdateFollowUpStatus,
  type EmailFollowUp,
  type EmailFollowUpStatus,
} from '@/hooks/queries';
import type { Theme } from '@mui/material';
import { KanbanColumn } from './KanbanColumn';
import { KanbanSkeleton } from './KanbanSkeleton';
import { FollowUpCard } from '@/components/ai/FollowUpTracker/FollowUpCard';

// Column configuration matching Prisma enum
const COLUMNS: { id: EmailFollowUpStatus; title: string; titleKey: string; color: string }[] = [
  { id: 'PENDING', title: 'Pending', titleKey: 'pending', color: 'warning.main' },
  { id: 'REMINDED', title: 'Reminded', titleKey: 'reminded', color: 'info.main' },
  { id: 'RESOLVED', title: 'Resolved', titleKey: 'resolved', color: 'success.main' },
  { id: 'EXPIRED', title: 'Expired', titleKey: 'expired', color: 'error.main' },
];

// Date helper functions
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FollowupsKanbanBoard() {
  const theme = useTheme();
  const t = useTranslations();
  const router = useRouter();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Keyboard navigation state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedColumnIdx, setSelectedColumnIdx] = useState(0);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Queries
  const { data, isLoading, error } = useFollowUpsList(undefined, 200);
  const { data: stats } = useFollowUpStats();

  // Mutations
  const updateStatus = useUpdateFollowUpStatus();
  const snoozeFollowUp = useSnoozeFollowUp();

  // Sensors for pointer (mouse/touch) and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Filter and group follow-ups
  const columns = useMemo(() => {
    const grouped: Record<EmailFollowUpStatus, EmailFollowUp[]> = {
      PENDING: [],
      REMINDED: [],
      RESOLVED: [],
      EXPIRED: [],
    };

    const followUps = data?.followUps || [];
    const query = searchQuery.toLowerCase();

    followUps.forEach((f) => {
      // Apply search filter
      if (query) {
        const matchesSearch =
          f.email?.subject?.toLowerCase().includes(query) ||
          f.email?.from?.toLowerCase().includes(query) ||
          f.reason?.toLowerCase().includes(query);
        if (!matchesSearch) return;
      }

      if (grouped[f.status]) {
        grouped[f.status].push(f);
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
  const columnOrder: EmailFollowUpStatus[] = ['PENDING', 'REMINDED', 'RESOLVED', 'EXPIRED'];

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
    const targetStatus = over.id as EmailFollowUpStatus;

    // Find current item to check if status changed
    const item = data.followUps.find((f) => f.id === followUpId);
    if (!item || item.status === targetStatus) return;

    // Update status via API
    setResolvingId(followUpId);
    try {
      await updateStatus.mutateAsync({ id: followUpId, status: targetStatus });
    } finally {
      setResolvingId(null);
    }
  }, [data?.followUps, updateStatus]);

  const handleResolve = useCallback(async (id: string) => {
    setResolvingId(id);
    try {
      await updateStatus.mutateAsync({ id, status: 'RESOLVED' });
    } finally {
      setResolvingId(null);
    }
  }, [updateStatus]);

  const handleOpenSnooze = useCallback((id: string) => {
    setSnoozeTargetId(id);
    setSnoozeDialogOpen(true);
  }, []);

  const handleSnooze = useCallback(async (days: number) => {
    if (!snoozeTargetId) return;

    const newDate = days === 7
      ? addWeeks(new Date(), 1)
      : addDays(new Date(), days);

    try {
      await snoozeFollowUp.mutateAsync({
        id: snoozeTargetId,
        dueDate: newDate.toISOString(),
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
        <Header theme={theme} t={t} stats={stats} searchQuery={searchQuery} onSearchChange={setSearchQuery} onShowHelp={() => setHelpDialogOpen(true)} />
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
      <Header theme={theme} t={t} stats={stats} searchQuery={searchQuery} onSearchChange={setSearchQuery} onShowHelp={() => setHelpDialogOpen(true)} />

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
            gap: 2,
            overflowX: 'auto',
            p: 2,
            minHeight: 500,
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
      <Dialog
        open={snoozeDialogOpen}
        onClose={() => setSnoozeDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t.ai.followUpTracker.snooze.title}</DialogTitle>
        <DialogContent>
          <List>
            <ListItemButton onClick={() => handleSnooze(1)}>
              <ListItemIcon>
                <Calendar size={20} />
              </ListItemIcon>
              <ListItemText
                primary={t.ai.followUpTracker.snooze.tomorrow}
                secondary={formatDate(addDays(new Date(), 1))}
              />
            </ListItemButton>
            <ListItemButton onClick={() => handleSnooze(7)}>
              <ListItemIcon>
                <Calendar size={20} />
              </ListItemIcon>
              <ListItemText
                primary={t.ai.followUpTracker.snooze.nextWeek}
                secondary={formatDate(addWeeks(new Date(), 1))}
              />
            </ListItemButton>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnoozeDialogOpen(false)}>
            {t.common.cancel}
          </Button>
        </DialogActions>
      </Dialog>

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
  onShowHelp?: () => void;
}

function Header({ theme, t, stats, searchQuery, onSearchChange, onShowHelp }: HeaderProps) {
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
    </Box>
  );
}

export default FollowupsKanbanBoard;
