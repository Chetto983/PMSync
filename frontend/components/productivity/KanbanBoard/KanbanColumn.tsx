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
  PENDING: <Clock size={15} />,
  OVERDUE: <AlertTriangle size={15} />,
  RESOLVED: <CheckCircle size={15} />,
  EXPIRED: <Archive size={15} />,
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
        minWidth: fullWidth ? 0 : 310,
        maxWidth: fullWidth ? '100%' : 360,
        flex: fullWidth ? undefined : '1 1 310px',
        bgcolor: isOver
          ? alpha(columnColor, 0.06)
          : theme.palette.mode === 'dark'
            ? alpha(theme.palette.background.paper, 0.4)
            : alpha(theme.palette.grey[50], 0.7),
        borderRadius: 3,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s ease',
        border: isOver
          ? `2px dashed ${alpha(columnColor, 0.4)}`
          : `1px solid ${alpha(theme.palette.divider, 0.4)}`,
      }}
    >
      {/* Column header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          px: 0.75,
        }}
      >
        <Box
          sx={{
            color: columnColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 1.5,
            bgcolor: alpha(columnColor, 0.08),
            flexShrink: 0,
          }}
        >
          {COLUMN_ICONS[id]}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            color: 'text.primary',
            fontSize: '0.75rem',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Typography>
        <Chip
          label={items.length}
          size="small"
          sx={{
            ml: 'auto',
            height: 24,
            minWidth: 32,
            fontSize: '0.75rem',
            fontWeight: 700,
            bgcolor: items.length > 0 ? alpha(columnColor, 0.12) : 'action.hover',
            color: items.length > 0 ? columnColor : 'text.secondary',
            borderRadius: 1.5,
          }}
        />
      </Box>

      {/* Cards */}
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 100,
            maxHeight: 'calc(100vh - 280px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            pr: 0.5,
            '&::-webkit-scrollbar': { width: 5 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha(theme.palette.text.primary, 0.08),
              borderRadius: 3,
              '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.15) },
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

          {items.length === 0 && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 160,
                borderRadius: 2.5,
                bgcolor: alpha(columnColor, 0.02),
                border: `1px dashed ${alpha(columnColor, 0.12)}`,
                px: 3,
                py: 4,
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 3,
                  bgcolor: alpha(columnColor, 0.06),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: alpha(columnColor, 0.4),
                  mb: 2,
                }}
              >
                {emptyConfig.icon}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 600,
                  textAlign: 'center',
                  fontSize: '0.8125rem',
                  lineHeight: 1.4,
                }}
              >
                {emptyConfig.message}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.disabled',
                  textAlign: 'center',
                  mt: 0.75,
                  maxWidth: 220,
                  lineHeight: 1.5,
                  fontSize: '0.75rem',
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
        icon: <Inbox size={24} strokeWidth={1.5} />,
        message: empty?.noPending || 'All clear',
        hint: empty?.noPendingHint || 'Follow-ups appear here when emails need a response',
      };
    case 'OVERDUE':
      return {
        icon: <AlertTriangle size={24} strokeWidth={1.5} />,
        message: empty?.noOverdue || 'Nothing overdue',
        hint: empty?.noOverdueHint || 'Overdue items will appear here automatically',
      };
    case 'RESOLVED':
      return {
        icon: <CheckCircle size={24} strokeWidth={1.5} />,
        message: empty?.noResolved || 'Nothing resolved yet',
        hint: empty?.noResolvedHint || 'Drag cards here or click resolve',
      };
    case 'EXPIRED':
      return {
        icon: <Archive size={24} strokeWidth={1.5} />,
        message: empty?.noExpired || 'No expired items',
        hint: empty?.noExpiredHint || 'Expired follow-ups are moved here after the deadline',
      };
  }
}

export default KanbanColumn;
