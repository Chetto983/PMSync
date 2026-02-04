'use client';

import React from 'react';
import { Box, Typography, Chip, alpha, useTheme } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Inbox } from 'lucide-react';
import type { EmailFollowUp } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';
import { KanbanCard } from './KanbanCard';

// Virtual column type - OVERDUE is not a real status but a date-based grouping
type KanbanColumnId = 'PENDING' | 'OVERDUE' | 'RESOLVED' | 'EXPIRED';

interface KanbanColumnProps {
  id: KanbanColumnId;
  title: string;
  color: string;
  items: EmailFollowUp[];
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onDelete?: (id: string) => void;
  resolvingId?: string | null;
  selectedId?: string | null;
}

export function KanbanColumn({
  id,
  title,
  color,
  items,
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

  // Get empty state message based on column id
  const getEmptyMessage = (): string => {
    const empty = t.ai.followUpTracker.kanban?.empty;
    switch (id) {
      case 'PENDING':
        return empty?.noPending || 'No pending follow-ups';
      case 'OVERDUE':
        return empty?.noOverdue || 'Nothing overdue';
      case 'RESOLVED':
        return empty?.noResolved || 'Nothing resolved yet';
      case 'EXPIRED':
        return empty?.noExpired || 'No expired items';
      default:
        return empty?.noItems || 'No items';
    }
  };

  // Extract MUI color from string like 'warning.main'
  const getColor = (colorPath: string): string => {
    const [palette, shade] = colorPath.split('.');
    const paletteObj = theme.palette[palette as keyof typeof theme.palette];
    if (paletteObj && typeof paletteObj === 'object' && shade && shade in paletteObj) {
      return (paletteObj as unknown as Record<string, string>)[shade];
    }
    return colorPath;
  };

  const columnColor = getColor(color);

  return (
    <Box
      ref={setNodeRef}
      sx={{
        minWidth: 300,
        maxWidth: 300,
        bgcolor: isOver ? alpha(columnColor, 0.08) : 'background.default',
        borderRadius: 2,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        transition: 'background-color 0.2s ease',
        border: isOver ? `2px dashed ${alpha(columnColor, 0.4)}` : '2px solid transparent',
      }}
    >
      {/* Column header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          px: 0.5,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: columnColor,
          }}
        />
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 600, color: 'text.primary' }}
        >
          {title}
        </Typography>
        <Chip
          label={items.length}
          size="small"
          sx={{
            ml: 'auto',
            height: 20,
            minWidth: 24,
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: alpha(columnColor, 0.15),
            color: columnColor,
          }}
        />
      </Box>

      {/* Cards container - scrollable */}
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 200,
            maxHeight: 'calc(100vh - 280px)', // Header + stats + search = ~280px
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            pr: 0.5, // Padding for scrollbar
            // Custom scrollbar styling
            '&::-webkit-scrollbar': {
              width: 6,
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'action.hover',
              borderRadius: 3,
            },
            '&::-webkit-scrollbar-thumb:hover': {
              bgcolor: 'action.selected',
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

          {/* Empty state */}
          {items.length === 0 && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 120,
                borderRadius: 2,
                bgcolor: alpha(columnColor, 0.02),
                border: `1px dashed ${alpha(columnColor, 0.2)}`,
                transition: 'all 0.2s ease',
              }}
            >
              <Inbox
                size={24}
                color={alpha(columnColor, 0.4)}
                style={{ marginBottom: 8 }}
              />
              <Typography
                variant="caption"
                sx={{ color: alpha(columnColor, 0.6), fontWeight: 500 }}
              >
                {getEmptyMessage()}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', mt: 0.5 }}
              >
                {t.ai.followUpTracker.kanban?.empty?.dropHere || 'Drop here'}
              </Typography>
            </Box>
          )}
        </Box>
      </SortableContext>
    </Box>
  );
}

export default KanbanColumn;
