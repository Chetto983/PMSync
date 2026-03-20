'use client';

import React from 'react';
import { Box, Typography, Chip, alpha, useTheme } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  Inbox,
  Clock,
  AlertTriangle,
  CheckCircle,
  Archive,
} from 'lucide-react';
import type { EmailFollowUp } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';
import { KanbanCard } from './KanbanCard';

export type KanbanColumnId = 'PENDING' | 'OVERDUE' | 'RESOLVED' | 'EXPIRED';

interface KanbanColumnProps {
  id: KanbanColumnId;
  title: string;
  color: string;
  items: EmailFollowUp[];
  fullWidth?: boolean;
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onDelete?: (id: string) => void;
  resolvingId?: string | null;
  selectedId?: string | null;
}

const COLUMN_ICONS: Record<KanbanColumnId, React.ReactNode> = {
  PENDING: <Clock size={14} />,
  OVERDUE: <AlertTriangle size={14} />,
  RESOLVED: <CheckCircle size={14} />,
  EXPIRED: <Archive size={14} />,
};

export function KanbanColumn({
  id,
  title,
  color,
  items,
  fullWidth = false,
  onResolve,
  onSnooze,
  onViewEmail,
  onDelete,
  resolvingId,
  selectedId,
}: KanbanColumnProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id });

  const getColor = (colorPath: string): string => {
    const [palette, shade] = colorPath.split('.');
    const paletteObj = theme.palette[palette as keyof typeof theme.palette];
    if (paletteObj && typeof paletteObj === 'object' && shade && shade in paletteObj) {
      return (paletteObj as unknown as Record<string, string>)[shade];
    }
    return colorPath;
  };

  const columnColor = getColor(color);

  const emptyConfig = getEmptyConfig(id, t);

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: fullWidth ? '100%' : undefined,
        minWidth: fullWidth ? 0 : 300,
        maxWidth: fullWidth ? '100%' : 340,
        flex: fullWidth ? undefined : '1 1 300px',
        bgcolor: isOver
          ? alpha(columnColor, 0.06)
          : alpha(theme.palette.background.default, 0.5),
        borderRadius: 3,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s ease',
        border: isOver
          ? `2px dashed ${alpha(columnColor, 0.4)}`
          : '2px solid transparent',
      }}
    >
      {/* Column header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          px: 0.5,
        }}
      >
        <Box sx={{ color: columnColor, display: 'flex', alignItems: 'center' }}>
          {COLUMN_ICONS[id]}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            color: 'text.primary',
            fontSize: '0.8rem',
            letterSpacing: 0.3,
          }}
        >
          {title}
        </Typography>
        <Chip
          label={items.length}
          size="small"
          sx={{
            ml: 'auto',
            height: 22,
            minWidth: 28,
            fontSize: '0.7rem',
            fontWeight: 700,
            bgcolor: items.length > 0 ? alpha(columnColor, 0.12) : 'action.hover',
            color: items.length > 0 ? columnColor : 'text.secondary',
          }}
        />
      </Box>

      {/* Cards container */}
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 120,
            maxHeight: 'calc(100vh - 300px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            pr: 0.5,
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'action.hover',
              borderRadius: 2,
            },
          }}
        >
          {items.map((followUp) => (
            <KanbanCard
              key={followUp.id}
              followUp={followUp}
              onResolve={onResolve}
              onSnooze={onSnooze}
              onViewEmail={onViewEmail}
              onDelete={onDelete}
              isResolving={resolvingId === followUp.id}
              isSelected={selectedId === followUp.id}
            />
          ))}

          {/* Contextual empty state */}
          {items.length === 0 && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 140,
                borderRadius: 2.5,
                bgcolor: alpha(columnColor, 0.02),
                border: `1px dashed ${alpha(columnColor, 0.15)}`,
                px: 2,
                py: 3,
              }}
            >
              <Box sx={{ color: alpha(columnColor, 0.35), mb: 1 }}>
                {emptyConfig.icon}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: alpha(columnColor, 0.7),
                  fontWeight: 600,
                  textAlign: 'center',
                  fontSize: '0.8rem',
                }}
              >
                {emptyConfig.message}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.disabled',
                  textAlign: 'center',
                  mt: 0.5,
                  maxWidth: 200,
                }}
              >
                {emptyConfig.hint}
              </Typography>
            </Box>
          )}
        </Box>
      </SortableContext>
    </Box>
  );
}

function getEmptyConfig(
  id: KanbanColumnId,
  t: ReturnType<typeof useTranslations>,
): { icon: React.ReactNode; message: string; hint: string } {
  const empty = t.ai.followUpTracker.kanban?.empty;
  switch (id) {
    case 'PENDING':
      return {
        icon: <Inbox size={28} />,
        message: empty?.noPending || 'All clear',
        hint: empty?.noPendingHint || 'Follow-ups appear here when emails need a response',
      };
    case 'OVERDUE':
      return {
        icon: <AlertTriangle size={28} />,
        message: empty?.noOverdue || 'Nothing overdue',
        hint: empty?.noOverdueHint || 'Overdue items will appear here automatically',
      };
    case 'RESOLVED':
      return {
        icon: <CheckCircle size={28} />,
        message: empty?.noResolved || 'Nothing resolved yet',
        hint: empty?.noResolvedHint || 'Drag cards here or click resolve',
      };
    case 'EXPIRED':
      return {
        icon: <Archive size={28} />,
        message: empty?.noExpired || 'No expired items',
        hint: empty?.noExpiredHint || 'Expired follow-ups are moved here after the deadline',
      };
  }
}

export default KanbanColumn;
