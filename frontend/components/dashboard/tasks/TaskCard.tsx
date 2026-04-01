import React from 'react';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import { Calendar, User, Clock, Bell, Handshake, Ticket, CheckSquare } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { UnifiedTask, TaskSourceType } from '@/lib/api/tasks';

// ---- Helpers ----

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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const SOURCE_ICONS: Record<TaskSourceType, React.ElementType> = {
  follow_up: Clock,
  reminder: Bell,
  deal_action: Handshake,
  ticket: Ticket,
  manual: CheckSquare,
};

// ---- Component ----

interface TaskCardProps {
  task: UnifiedTask;
  onClick?: (task: UnifiedTask) => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const SourceIcon = SOURCE_ICONS[task.sourceType];
  const overdue = isOverdue(task.dueDate);
  const dueToday = isDueToday(task.dueDate);

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging && onClick) {
          e.stopPropagation();
          onClick(task);
        }
      }}
      sx={{
        p: 1.5,
        mb: 1,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: isDragging ? 'primary.main' : 'divider',
        cursor: isDragging ? 'grabbing' : 'grab',
        '&:hover, &:focus-visible': {
          borderColor: 'primary.light',
          boxShadow: 1,
          outline: 'none',
        },
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Title */}
      <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.5 }}>
        {task.title}
      </Typography>

      {/* Description */}
      {task.description && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mb: 0.5 }}>
          {task.description}
        </Typography>
      )}

      {/* Bottom row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <SourceIcon size={14} style={{ opacity: 0.5 }} />
        <Chip
          label={t.tasks.sourceTypes[task.sourceType]}
          size="small"
          variant="outlined"
          sx={{ height: 18, fontSize: '0.65rem' }}
        />

        {task.contactName && (
          <Tooltip title={task.contactName}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
              <User size={12} style={{ opacity: 0.5 }} />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 100 }}>
                {task.contactName}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {task.dueDate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <Calendar size={12} style={{ opacity: 0.5 }} />
            <Typography
              variant="caption"
              color={overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.secondary'}
            >
              {formatShortDate(task.dueDate)}
            </Typography>
          </Box>
        )}

        {(task.priority === 'urgent' || task.priority === 'high') && (
          <Chip
            label={t.tasks.priorities[task.priority]}
            size="small"
            color={task.priority === 'urgent' ? 'error' : 'warning'}
            sx={{ height: 18, fontSize: '0.65rem' }}
          />
        )}
      </Box>
    </Box>
  );
}
