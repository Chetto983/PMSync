'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  Chip,
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
import { KanbanColumn, type KanbanColumnId } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { KanbanSkeleton } from './KanbanSkeleton';
import { SnoozeDialog } from './SnoozeDialog';
import { PageHeader, KeyboardHelpDialog } from './BoardHeader';

// Column definitions
const COLUMNS: { id: KanbanColumnId; titleKey: string; color: string }[] = [
  { id: 'PENDING', titleKey: 'pending', color: 'warning.main' },
  { id: 'OVERDUE', titleKey: 'overdue', color: 'error.main' },
  { id: 'RESOLVED', titleKey: 'resolved', color: 'success.main' },
  { id: 'EXPIRED', titleKey: 'expired', color: 'grey.500' },
];

const COLUMN_ORDER: KanbanColumnId[] = ['PENDING', 'OVERDUE', 'RESOLVED', 'EXPIRED'];

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
  const [mobileColumnId, setMobileColumnId] = useState<KanbanColumnId>('PENDING');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedColumnIdx, setSelectedColumnIdx] = useState(0);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  // Queries
  const { data: pendingData, isLoading, error } = usePendingFollowUps(200);
  const followUps = useMemo<EmailFollowUp[]>(
    () => (pendingData?.followUps as EmailFollowUp[] | undefined) ?? [],
    [pendingData?.followUps],
  );
  const { data: stats, isLoading: statsLoading } = useFollowUpStats();

  // Mutations
  const updateStatus = useUpdateFollowUpStatus();
  const snoozeFollowUp = useSnoozeFollowUp();
  const deleteFollowUp = useDeleteFollowUp();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Group follow-ups into columns
  const columns = useMemo(() => {
    const grouped: Record<KanbanColumnId, EmailFollowUp[]> = {
      PENDING: [],
      OVERDUE: [],
      RESOLVED: [],
      EXPIRED: [],
    };
    const query = searchQuery.toLowerCase();
    const now = new Date();

    followUps.forEach((f) => {
      if (query) {
        const match =
          f.email?.subject?.toLowerCase().includes(query) ||
          f.email?.from?.toLowerCase().includes(query) ||
          f.reason?.toLowerCase().includes(query);
        if (!match) return;
      }
      if (typeFilter && f.followUpType !== typeFilter) return;

      if (f.status === 'RESOLVED') {
        grouped.RESOLVED.push(f);
      } else if (f.status === 'EXPIRED') {
        grouped.EXPIRED.push(f);
      } else {
        const dueDate = f.dueDate ? new Date(f.dueDate) : null;
        if (dueDate && dueDate < now) {
          grouped.OVERDUE.push(f);
        } else {
          grouped.PENDING.push(f);
        }
      }
    });
    return grouped;
  }, [followUps, searchQuery, typeFilter]);

  const activeItem = useMemo(
    () => (activeId ? followUps.find((f) => f.id === activeId) : null),
    [activeId, followUps],
  );

  const selectedItem = useMemo(
    () => (selectedId ? followUps.find((f) => f.id === selectedId) : null),
    [selectedId, followUps],
  );

  // ── Keyboard shortcuts ──
  useHotkeys('j', () => {
    const items = columns[COLUMN_ORDER[selectedColumnIdx]] || [];
    if (!items.length) return;
    const idx = selectedId ? items.findIndex((i) => i.id === selectedId) : -1;
    setSelectedId(items[Math.min(idx + 1, items.length - 1)]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [columns, selectedColumnIdx, selectedId]);

  useHotkeys('k', () => {
    const items = columns[COLUMN_ORDER[selectedColumnIdx]] || [];
    if (!items.length) return;
    const idx = selectedId ? items.findIndex((i) => i.id === selectedId) : items.length;
    setSelectedId(items[Math.max(idx - 1, 0)]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [columns, selectedColumnIdx, selectedId]);

  useHotkeys('h', () => {
    const newIdx = Math.max(selectedColumnIdx - 1, 0);
    setSelectedColumnIdx(newIdx);
    setSelectedId(columns[COLUMN_ORDER[newIdx]]?.[0]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [selectedColumnIdx, columns]);

  useHotkeys('l', () => {
    const newIdx = Math.min(selectedColumnIdx + 1, COLUMN_ORDER.length - 1);
    setSelectedColumnIdx(newIdx);
    setSelectedId(columns[COLUMN_ORDER[newIdx]]?.[0]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [selectedColumnIdx, columns]);

  useHotkeys('enter', () => {
    if (selectedItem?.emailId) router.push(`/dashboard/email?id=${selectedItem.emailId}`);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedItem }, [selectedItem, router]);

  useHotkeys('r', () => {
    if (selectedId && selectedItem?.status !== 'RESOLVED') handleResolve(selectedId);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedId }, [selectedId, selectedItem]);

  useHotkeys('s', () => {
    if (selectedId && selectedItem?.status === 'PENDING') handleOpenSnooze(selectedId);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedId }, [selectedId, selectedItem]);

  useHotkeys('shift+/', () => setHelpDialogOpen(true), { enabled: !snoozeDialogOpen }, []);

  useHotkeys('escape', () => {
    if (helpDialogOpen) setHelpDialogOpen(false);
    else if (snoozeDialogOpen) setSnoozeDialogOpen(false);
    else setSelectedId(null);
  }, [helpDialogOpen, snoozeDialogOpen]);

  // ── Handlers ──
  const handleDragStart = useCallback((e: DragStartEvent) => setActiveId(e.active.id as string), []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const id = active.id as string;
    const item = followUps.find((f) => f.id === id);
    if (!item) return;

    const validColumns: KanbanColumnId[] = ['PENDING', 'OVERDUE', 'RESOLVED', 'EXPIRED'];
    let targetColumn: KanbanColumnId | null = null;

    if (validColumns.includes(over.id as KanbanColumnId)) {
      targetColumn = over.id as KanbanColumnId;
    } else {
      const targetCard = followUps.find((f) => f.id === over.id);
      if (!targetCard) return;
      const now = new Date();
      const td = targetCard.dueDate ? new Date(targetCard.dueDate) : null;
      if (targetCard.status === 'RESOLVED') targetColumn = 'RESOLVED';
      else if (targetCard.status === 'EXPIRED') targetColumn = 'EXPIRED';
      else if (td && td < now) targetColumn = 'OVERDUE';
      else targetColumn = 'PENDING';
    }

    // Current column
    const now = new Date();
    const dd = item.dueDate ? new Date(item.dueDate) : null;
    let currentColumn: KanbanColumnId;
    if (item.status === 'RESOLVED') currentColumn = 'RESOLVED';
    else if (item.status === 'EXPIRED') currentColumn = 'EXPIRED';
    else if (dd && dd < now) currentColumn = 'OVERDUE';
    else currentColumn = 'PENDING';

    if (!targetColumn || currentColumn === targetColumn) return;

    setResolvingId(id);
    try {
      if (targetColumn === 'OVERDUE') return;
      if (targetColumn === 'PENDING' && currentColumn === 'OVERDUE') {
        await snoozeFollowUp.mutateAsync({ id, dueDate: addDays(new Date(), 3).toISOString() });
      } else if (targetColumn === 'RESOLVED') {
        await updateStatus.mutateAsync({ id, status: 'RESOLVED' });
      } else if (targetColumn === 'EXPIRED') {
        await updateStatus.mutateAsync({ id, status: 'EXPIRED' });
      } else if (targetColumn === 'PENDING') {
        await updateStatus.mutateAsync({ id, status: 'PENDING' });
      }
    } finally {
      setResolvingId(null);
    }
  }, [followUps, updateStatus, snoozeFollowUp]);

  const handleResolve = useCallback(async (id: string) => {
    setResolvingId(id);
    try { await updateStatus.mutateAsync({ id, status: 'RESOLVED' }); }
    finally { setResolvingId(null); }
  }, [updateStatus]);

  const handleDelete = useCallback(async (id: string) => {
    try { await deleteFollowUp.mutateAsync(id); } catch { /* handled */ }
  }, [deleteFollowUp]);

  const handleOpenSnooze = useCallback((id: string) => {
    setSnoozeTargetId(id);
    setSnoozeDialogOpen(true);
  }, []);

  const handleSnooze = useCallback(async (date: Date) => {
    if (!snoozeTargetId) return;
    try {
      await snoozeFollowUp.mutateAsync({ id: snoozeTargetId, dueDate: date.toISOString() });
      setSnoozeDialogOpen(false);
      setSnoozeTargetId(null);
    } catch { /* handled */ }
  }, [snoozeTargetId, snoozeFollowUp]);

  const handleViewEmail = useCallback(
    (emailId: string) => router.push(`/dashboard/email?id=${emailId}`),
    [router],
  );

  const getColumnTitle = (titleKey: string): string => {
    const kanban = t.ai.followUpTracker.kanban;
    if (kanban?.columns && titleKey in kanban.columns) {
      return kanban.columns[titleKey as keyof typeof kanban.columns];
    }
    return titleKey.charAt(0).toUpperCase() + titleKey.slice(1);
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        t={t}
        isMobile={isMobile}
        stats={null}
          statsLoading
          searchQuery=""
          onSearchChange={() => {}}
          typeFilter={undefined}
          onTypeFilterChange={() => {}}
          onShowHelp={() => {}}
        />
        <KanbanSkeleton />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">{t.ai.followUpTracker.error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        t={t}
        isMobile={isMobile}
        stats={stats}
        statsLoading={statsLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        onShowHelp={() => setHelpDialogOpen(true)}
      />

      {/* ── Mobile: column tabs ── */}
      {isMobile ? (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, px: 2, pb: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 2 }}>
            {COLUMNS.map((col) => (
              <ToggleButton
                key={col.id}
                value={col.id}
                selected={mobileColumnId === col.id}
                onChange={() => setMobileColumnId(col.id)}
                sx={{
                  justifyContent: 'space-between',
                  textTransform: 'none',
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                }}
              >
                <span>{getColumnTitle(col.titleKey)}</span>
                <Chip label={columns[col.id].length} size="small" />
              </ToggleButton>
            ))}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <KanbanColumn
              id={mobileColumnId}
              title={getColumnTitle(COLUMNS.find((c) => c.id === mobileColumnId)?.titleKey || 'pending')}
              color={COLUMNS.find((c) => c.id === mobileColumnId)?.color || 'warning.main'}
              items={columns[mobileColumnId]}
              fullWidth
              onResolve={handleResolve}
              onSnooze={handleOpenSnooze}
              onViewEmail={handleViewEmail}
              onDelete={handleDelete}
              resolvingId={resolvingId}
              selectedId={selectedId}
            />
          </Box>
        </Box>
      ) : (
        /* ── Desktop: DnD Kanban ── */
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
              px: 2,
              py: 2,
              minHeight: 400,
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

          <DragOverlay>
            {activeItem ? (
              <Box sx={{ opacity: 0.85, transform: 'rotate(2deg)', maxWidth: 340 }}>
                <KanbanCard followUp={activeItem} />
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <SnoozeDialog
        open={snoozeDialogOpen}
        onClose={() => { setSnoozeDialogOpen(false); setSnoozeTargetId(null); }}
        followUpId={snoozeTargetId}
        onSnooze={handleSnooze}
      />

      <KeyboardHelpDialog
        open={helpDialogOpen}
        onClose={() => setHelpDialogOpen(false)}
        t={t}
      />
    </Box>
  );
}

export default FollowupsKanbanBoard;
