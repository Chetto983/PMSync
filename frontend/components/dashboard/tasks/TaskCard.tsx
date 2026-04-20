import React from 'react';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
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
  const theme = useTheme();
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
        p: 1.75,
        mb: 1,
        bgcolor: alpha(theme.palette.background.paper, 0.94),
        borderRadius: 2.5,
        border: 1,
        borderColor: isDragging ? 'primary.main' : alpha(theme.palette.divider, 0.84),
        cursor: isDragging ? 'grabbing' : onClick ? 'pointer' : 'grab',
        '&:hover, &:focus-visible': {
          borderColor: 'primary.light',
          boxShadow: `0 12px 28px ${alpha(theme.palette.common.black, 0.08)}`,
          outline: 'none',
          transform: 'translateY(-1px)',
        },
        userSelect: 'none',
        touchAction: 'none',
        transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.35 }}>
            {task.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
            {t.tasks.sourceTypes[task.sourceType]}
          </Typography>
        </Box>
        {(task.priority === 'urgent' || task.priority === 'high') && (
          <Chip
            label={t.tasks.priorities[task.priority]}
            size="small"
            color={task.priority === 'urgent' ? 'error' : 'warning'}
            sx={{ height: 22, fontWeight: 700 }}
          />
        )}
      </Box>

      {task.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            mb: 1.25,
            overflow: 'hidden',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.45,
          }}
        >
          {task.description}
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.light, 0.12),
            color: 'primary.main',
          }}
        >
          <SourceIcon size={13} />
        </Box>
        {task.contactName && (
          <Tooltip title={task.contactName}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.45, minWidth: 0 }}>
              <User size={12} style={{ opacity: 0.55 }} />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 124 }}>
                {task.contactName}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {task.dueDate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.45 }}>
            <Calendar size={12} style={{ opacity: 0.55 }} />
            <Typography
              variant="caption"
              color={overdue ? 'error.main' : dueToday ? 'warning.main' : 'text.secondary'}
              sx={{ fontWeight: overdue || dueToday ? 700 : 500 }}
            >
              {formatShortDate(task.dueDate)}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
