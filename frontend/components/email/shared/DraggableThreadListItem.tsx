import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Box } from '@mui/material';
import type { Email } from '@/stores/email-store';
import type { Conversation } from '@/lib/api/email';

/**
 * Props for DraggableThreadListItem wrapper
 */
export interface DraggableThreadListItemProps {
  /**
   * The thread data
   */
  thread: Email | Conversation;

  /**
   * Whether dragging is enabled
   */
  isDragEnabled?: boolean;

  /**
   * Whether this item is selected (for bulk drag)
   */
  isSelected?: boolean;

  /**
   * Children to wrap (the actual ThreadListItem)
   */
  children: React.ReactNode;
}

/**
 * Wrapper component that makes ThreadListItem draggable
 *
 * Features:
 * - Adds drag handle on hover
 * - Visual feedback when dragging
 * - Supports bulk drag when multiple items are selected
 */
export const DraggableThreadListItem: React.FC<DraggableThreadListItemProps> = ({
  thread,
  isDragEnabled = true,
  isSelected = false,
  children,
}) => {
  // Extract IDs for drag data
  const threadId = thread.threadId || ('id' in thread ? thread.id : '');
  const emailId = 'id' in thread ? thread.id : thread.latestEmailId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `email-${emailId}`,
    data: {
      type: 'email',
      email: thread,
      emailId,
      threadId,
      isSelected,
    },
    disabled: !isDragEnabled,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      sx={{
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragEnabled ? 'grab' : 'default',
        transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
        '&:active': {
          cursor: isDragEnabled ? 'grabbing' : 'default',
        },
        // Highlight when dragging
        ...(isDragging && {
          boxShadow: '0 0 0 2px rgba(25, 118, 210, 0.3)',
          borderRadius: 1,
        }),
        ...style,
      }}
    >
      {children}
    </Box>
  );
};

export default DraggableThreadListItem;
