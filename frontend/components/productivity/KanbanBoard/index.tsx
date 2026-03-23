'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  Chip,
  alpha,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Skeleton,
} from '@mui/material';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  Inbox,
} from 'lucide-react';
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
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { FollowUpCard } from './FollowUpCard';
import { SnoozeDialog } from './SnoozeDialog';
import { PageHeader, KeyboardHelpDialog } from './BoardHeader';

// ── Section definitions ──
type SectionId = 'OVERDUE' | 'DUE_TODAY' | 'PENDING' | 'RESOLVED';

interface SectionDef {
  id: SectionId;
  icon: React.ReactNode;
  colorKey: 'error' | 'warning' | 'info' | 'success';
}

const SECTIONS: SectionDef[] = [
  { id: 'OVERDUE', icon: <AlertTriangle size={16} />, colorKey: 'error' },
  { id: 'DUE_TODAY', icon: <Clock size={16} />, colorKey: 'warning' },
  { id: 'PENDING', icon: <Inbox size={16} />, colorKey: 'info' },
  { id: 'RESOLVED', icon: <CheckCircle size={16} />, colorKey: 'success' },
];

function getSectionTitle(id: SectionId, t: ReturnType<typeof useTranslations>): string {
  const kanban = t.ai.followUpTracker.kanban;
  switch (id) {
    case 'OVERDUE': return kanban?.columns?.overdue || 'Overdue';
    case 'DUE_TODAY': return t.ai.followUpTracker.stats.dueToday || 'Due Today';
    case 'PENDING': return kanban?.columns?.pending || 'Pending';
    case 'RESOLVED': return kanban?.columns?.resolved || 'Resolved';
  }
}

export function FollowupsKanbanBoard() {
  const theme = useTheme();
  const t = useTranslations();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // State — synced to URL query params
  const searchQuery = typeof router.query.q === 'string' ? router.query.q : '';
  const typeFilter = (['WAITING_FOR', 'TODO'] as const).includes(router.query.type as 'WAITING_FOR' | 'TODO')
    ? (router.query.type as 'WAITING_FOR' | 'TODO')
    : undefined;

  const setSearchQuery = useCallback((value: string) => {
    const query = { ...router.query };
    if (value) { query.q = value; } else { delete query.q; }
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [router]);

  const setTypeFilter = useCallback((value: 'WAITING_FOR' | 'TODO' | undefined) => {
    const query = { ...router.query };
    if (value) { query.type = value; } else { delete query.type; }
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [router]);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionId>>(new Set(['RESOLVED']));

  // Queries
  const { data: pendingData, isLoading, error, refetch } = usePendingFollowUps(200, true);
  const followUps = useMemo<EmailFollowUp[]>(
    () => (pendingData?.followUps as EmailFollowUp[] | undefined) ?? [],
    [pendingData?.followUps],
  );
  const { data: stats, isLoading: statsLoading } = useFollowUpStats();

  // Mutations
  const updateStatus = useUpdateFollowUpStatus();
  const snoozeFollowUp = useSnoozeFollowUp();
  const deleteFollowUp = useDeleteFollowUp();

  // Group follow-ups into sections
  const sections = useMemo(() => {
    const grouped: Record<SectionId, EmailFollowUp[]> = {
      OVERDUE: [], DUE_TODAY: [], PENDING: [], RESOLVED: [],
    };
    const query = searchQuery.toLowerCase();
    const now = new Date();
    const todayStr = now.toDateString();

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
        grouped.RESOLVED.push(f); // expired shown alongside resolved
      } else {
        const dueDate = f.dueDate ? new Date(f.dueDate) : null;
        if (dueDate && dueDate.toDateString() === todayStr) {
          grouped.DUE_TODAY.push(f);
        } else if (dueDate && dueDate < now) {
          grouped.OVERDUE.push(f);
        } else {
          grouped.PENDING.push(f);
        }
      }
    });
    return grouped;
  }, [followUps, searchQuery, typeFilter]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const items: EmailFollowUp[] = [];
    for (const sec of SECTIONS) {
      if (!collapsedSections.has(sec.id)) items.push(...sections[sec.id]);
    }
    return items;
  }, [sections, collapsedSections]);

  // ── Keyboard shortcuts ──
  const isTextInputFocused = useCallback(() => {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }, []);

  useHotkeys('j', () => {
    if (isTextInputFocused() || !flatList.length) return;
    const idx = selectedId ? flatList.findIndex((i) => i.id === selectedId) : -1;
    setSelectedId(flatList[Math.min(idx + 1, flatList.length - 1)]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [flatList, selectedId, isTextInputFocused]);

  useHotkeys('k', () => {
    if (isTextInputFocused() || !flatList.length) return;
    const idx = selectedId ? flatList.findIndex((i) => i.id === selectedId) : flatList.length;
    setSelectedId(flatList[Math.max(idx - 1, 0)]?.id || null);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen }, [flatList, selectedId, isTextInputFocused]);

  const selectedItem = useMemo(
    () => (selectedId ? followUps.find((f) => f.id === selectedId) : null),
    [selectedId, followUps],
  );

  useHotkeys('enter', () => {
    if (selectedItem?.emailId) router.push(`/dashboard/email?id=${selectedItem.emailId}`);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedItem }, [selectedItem, router]);

  useHotkeys('r', () => {
    if (isTextInputFocused()) return;
    if (selectedId && selectedItem?.status !== 'RESOLVED') handleResolve(selectedId);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedId }, [selectedId, selectedItem, isTextInputFocused]);

  useHotkeys('s', () => {
    if (isTextInputFocused()) return;
    if (selectedId && selectedItem?.status === 'PENDING') handleOpenSnooze(selectedId);
  }, { enabled: !snoozeDialogOpen && !helpDialogOpen && !!selectedId }, [selectedId, selectedItem, isTextInputFocused]);

  useHotkeys('shift+/', () => setHelpDialogOpen(true), { enabled: !snoozeDialogOpen }, []);

  useHotkeys('escape', () => {
    if (helpDialogOpen) setHelpDialogOpen(false);
    else if (snoozeDialogOpen) setSnoozeDialogOpen(false);
    else setSelectedId(null);
  }, [helpDialogOpen, snoozeDialogOpen]);

  // ── Handlers ──
  const handleResolve = useCallback(async (id: string) => {
    setResolvingId(id);
    try { await updateStatus.mutateAsync({ id, status: 'RESOLVED' }); }
    finally { setResolvingId(null); }
  }, [updateStatus]);

  const handleRequestDelete = useCallback((id: string) => setDeleteTargetId(id), []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTargetId) return;
    try { await deleteFollowUp.mutateAsync(deleteTargetId); }
    catch { /* handled */ }
    finally { setDeleteTargetId(null); }
  }, [deleteTargetId, deleteFollowUp]);

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

  const toggleSection = useCallback((id: SectionId) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Loading ──
  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', p: { xs: 2, md: 3 } }}>
        <PageHeader
          t={t} isMobile={isMobile} stats={null} statsLoading
          searchQuery="" onSearchChange={() => {}}
          typeFilter={undefined} onTypeFilterChange={() => {}}
          onShowHelp={() => {}}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 3 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2.5 }} />
          ))}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', p: { xs: 2, md: 3 } }}>
        <QueryErrorAlert error={error} onRetry={() => refetch()} />
      </Box>
    );
  }

  const totalVisible = Object.values(sections).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', p: { xs: 2, md: 3 } }}>
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

      {/* ── Grouped sections ── */}
      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {totalVisible === 0 && (
          <EmptyState
            icon={Clock}
            color="#55cae5"
            title={t.ai.followUpTracker.noFollowUps}
            description={t.ai.followUpTracker.noFollowUpsDescription}
          />
        )}

        {SECTIONS.map((sec) => {
          const items = sections[sec.id];
          if (items.length === 0) return null;
          const isCollapsed = collapsedSections.has(sec.id);
          const color = theme.palette[sec.colorKey].main;

          return (
            <Box key={sec.id}>
              {/* Section header */}
              <Box
                role="button"
                tabIndex={0}
                onClick={() => toggleSection(sec.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(sec.id); } }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1,
                  cursor: 'pointer',
                  userSelect: 'none',
                  px: 0.5,
                  '&:hover': { '& .section-title': { color: 'text.primary' } },
                }}
              >
                <Box sx={{ color, display: 'flex', alignItems: 'center' }}>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </Box>
                <Box sx={{ color, display: 'flex', alignItems: 'center' }}>
                  {sec.icon}
                </Box>
                <Typography
                  className="section-title"
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    transition: 'color 0.15s',
                  }}
                >
                  {getSectionTitle(sec.id, t)}
                </Typography>
                <Chip
                  label={items.length}
                  size="small"
                  sx={{
                    height: 20, minWidth: 28, fontSize: '0.6875rem', fontWeight: 700,
                    bgcolor: alpha(color, 0.1), color, borderRadius: 1.5,
                  }}
                />
              </Box>

              {/* Section items */}
              <Collapse in={!isCollapsed}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map((followUp) => (
                    <FollowUpCard
                      key={followUp.id}
                      followUp={followUp}
                      onResolve={handleResolve}
                      onSnooze={handleOpenSnooze}
                      onViewEmail={handleViewEmail}
                      onDelete={handleRequestDelete}
                      isResolving={resolvingId === followUp.id}
                      isSelected={selectedId === followUp.id}
                    />
                  ))}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      {/* Dialogs */}
      <SnoozeDialog
        open={snoozeDialogOpen}
        onClose={() => { setSnoozeDialogOpen(false); setSnoozeTargetId(null); }}
        followUpId={snoozeTargetId}
        onSnooze={handleSnooze}
      />
      <KeyboardHelpDialog open={helpDialogOpen} onClose={() => setHelpDialogOpen(false)} t={t} />
      <Dialog
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          {t.ai.followUpTracker.actions.delete}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t.ai.followUpTracker.kanban?.deleteConfirm || 'This follow-up will be permanently removed.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTargetId(null)} sx={{ borderRadius: 2, textTransform: 'none' }}>
            {t.common.cancel}
          </Button>
          <Button
            variant="contained" color="error" onClick={handleConfirmDelete}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}
          >
            {t.ai.followUpTracker.actions.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default FollowupsKanbanBoard;
