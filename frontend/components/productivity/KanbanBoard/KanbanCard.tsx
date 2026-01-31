'use client';

import React from 'react';
import { Box, useTheme } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EmailFollowUp } from '@/hooks/queries';
import { FollowUpCard } from '@/components/ai/FollowUpTracker/FollowUpCard';

interface KanbanCardProps {
  followUp: EmailFollowUp;
  onResolve?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onViewEmail?: (emailId: string) => void;
  onDelete?: (id: string) => void;
  isResolving?: boolean;
  isDragging?: boolean;
  isSelected?: boolean;
}

export function KanbanCard({
  followUp,
  onResolve,
  onSnooze,
  onViewEmail,
  onDelete,
  isResolving,
  isDragging: isDraggingProp,
  isSelected,
}: KanbanCardProps) {
  const theme = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: followUp.id });

  const handleClick = () => {
    if (onViewEmail && followUp.emailId) {
      onViewEmail(followUp.emailId);
    }
  };

  return (
    <Box
      ref={setNodeRef}
      onClick={handleClick}
      sx={{
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging || isDraggingProp ? 0.5 : 1,
        cursor: 'grab',
        borderRadius: 2,
        outline: isSelected ? `2px solid ${theme.palette.primary.main}` : 'none',
        outlineOffset: 2,
        '&:active': {
          cursor: 'grabbing',
        },
      }}
      {...attributes}
      {...listeners}
    >
      <FollowUpCard
        followUp={followUp}
        onResolve={onResolve}
        onSnooze={onSnooze}
        onViewEmail={onViewEmail}
        onDelete={onDelete}
        isResolving={isResolving}
      />
    </Box>
  );
}

export default KanbanCard;
