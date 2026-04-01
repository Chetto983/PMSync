import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
} from '@mui/material';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUpdateTask, useCompleteTask } from '@/hooks/queries/use-tasks';
import { tasksKeys } from '@/hooks/queries/tasks-keys';
import { useGlobalToast } from '@/lib/context/toast-context';
import { TaskCard } from './TaskCard';
import type { UnifiedTask, UnifiedTaskStatus, UnifiedTaskListResponse } from '@/lib/api/tasks';

// ---- Column config ----

const KANBAN_STATUSES: UnifiedTaskStatus[] = ['pending', 'in_progress', 'completed'];

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning.main',
  in_progress: 'info.main',
  completed: 'success.main',
};

// ---- Status Column ----

interface StatusColumnProps {
  status: UnifiedTaskStatus;
  tasks: UnifiedTask[];
  isOverCurrent: boolean;
  statusLabel: string;
  noTasksLabel: string;
  onTaskClick?: (task: UnifiedTask) => void;
}

const StatusColumn = React.memo(function StatusColumn({
  status,
  tasks,
  isOverCurrent,
  statusLabel,
  noTasksLabel,
  onTaskClick,
}: StatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const highlighted = isOver || isOverCurrent;

  const columnTasks = useMemo(
    () => tasks.filter((t) => t.status === status),
    [tasks, status],
  );

  return (
    <Box
      ref={setNodeRef}
      sx={{
        minWidth: 280,
        maxWidth: 320,
        flex: '0 0 280px',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: highlighted ? 'action.hover' : 'background.default',
        borderRadius: 2,
        border: 1,
        borderColor: highlighted ? 'primary.main' : 'divider',
        transition: 'border-color 0.2s, background-color 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: STATUS_COLORS[status] ?? 'text.disabled',
              flexShrink: 0,
            }}
          />
          <Typography variant="subtitle2" fontWeight={600} noWrap>
            {statusLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {columnTasks.length}
          </Typography>
        </Box>
      </Box>

      {/* Cards */}
      <Box
        sx={{
          p: 1,
          flex: 1,
          minHeight: 100,
          overflowY: 'auto',
          maxHeight: 'calc(100dvh - 300px)',
        }}
      >
        {columnTasks.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', textAlign: 'center', mt: 4 }}
          >
            {noTasksLabel}
          </Typography>
        ) : (
          columnTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))
        )}
      </Box>
    </Box>
  );
});

// ---- Kanban Board ----

interface TasksKanbanBoardProps {
  tasks: UnifiedTask[];
  filters?: Record<string, unknown>;
  onTaskClick?: (task: UnifiedTask) => void;
}

export function TasksKanbanBoard({ tasks, filters, onTaskClick }: TasksKanbanBoardProps) {
  const t = useTranslations();
  const toast = useGlobalToast();
  const queryClient = useQueryClient();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();

  const [activeTask, setActiveTask] = useState<UnifiedTask | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as UnifiedTask | undefined;
    if (task) setActiveTask(task);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverColumnId((event.over?.id as string) ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      setOverColumnId(null);

      const { active, over } = event;
      if (!over) return;

      const task = active.data.current?.task as UnifiedTask | undefined;
      const newStatus = over.id as UnifiedTaskStatus;
      if (!task || task.status === newStatus) return;

      // CRITICAL: non-manual tasks can only be completed
      if (task.sourceType !== 'manual' && newStatus !== 'completed') {
        toast.error(t.tasks.kanban.dragRestricted);
        return;
      }

      // Optimistic update
      const queryKey = tasksKeys.list(filters);
      const previousData = queryClient.getQueryData<UnifiedTaskListResponse>(queryKey);

      queryClient.setQueryData<UnifiedTaskListResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((d) =>
            d.id === task.id ? { ...d, status: newStatus } : d,
          ),
        };
      });

      const onError = () => {
        if (previousData) {
          queryClient.setQueryData(queryKey, previousData);
        }
        toast.error(t.tasks.kanban.moveError);
      };

      const onSuccess = () => {
        const msg = t.tasks.kanban.movedSuccess.replace(
          '{status}',
          t.tasks.statuses[newStatus],
        );
        toast.success(msg);
      };

      if (newStatus === 'completed') {
        completeTask.mutate(
          { sourceType: task.sourceType, id: task.sourceId },
          { onSuccess, onError },
        );
      } else {
        updateTask.mutate(
          { sourceType: 'manual', id: task.sourceId, dto: { status: newStatus } },
          { onSuccess, onError },
        );
      }
    },
    [filters, queryClient, completeTask, updateTask, toast, t],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          p: 1,
          pb: 2,
          minHeight: 400,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'action.disabled',
            borderRadius: 3,
          },
        }}
      >
        {KANBAN_STATUSES.map((status) => (
          <StatusColumn
            key={status}
            status={status}
            tasks={tasks}
            isOverCurrent={overColumnId === status}
            statusLabel={t.tasks.statuses[status]}
            noTasksLabel={t.tasks.kanban.noTasks}
            onTaskClick={onTaskClick}
          />
        ))}
      </Box>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <Box
            sx={{
              p: 1.5,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: 1,
              borderColor: 'primary.main',
              boxShadow: 3,
              minWidth: 240,
              maxWidth: 300,
              opacity: 0.9,
            }}
          >
            <Typography variant="body2" fontWeight={600} noWrap>
              {activeTask.title}
            </Typography>
            {(activeTask.priority === 'urgent' || activeTask.priority === 'high') && (
              <Typography variant="caption" color="error.main">
                {t.tasks.priorities[activeTask.priority]}
              </Typography>
            )}
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
