/**
 * Draggable Thread List Item Wrapper
 *
 * Wraps ThreadListItem with @dnd-kit drag functionality
 * Includes provider metadata for cross-provider validation
 *
 * Animation features:
 * - 250ms duration drag overlay
 * - Semi-transparent drag preview
 * - Scale transform on drag
 * - Smooth opacity transition
 */

import React, { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Box } from '@mui/material';
import { ThreadListItem, ThreadListItemData } from './ThreadListItem';

interface DraggableThreadListItemProps {
  thread: ThreadListItemData & { providerId: string };
  draggedEmailIds: string[] | null;
  isSelected: boolean;
  isHovered: boolean;
  /** Keyboard navigation focus state */
  isFocused?: boolean;
  onSelect: (id: string, checked: boolean, event?: React.MouseEvent) => void;
  onClick: (id: string) => void;
  onFlag: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move to folder (opens folder picker) */
  onMove?: (id: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
}

/**
 * Makes ThreadListItem draggable with provider validation metadata
 */
export const DraggableThreadListItem = memo<DraggableThreadListItemProps>(function DraggableThreadListItem({
  thread,
  draggedEmailIds,
  isSelected,
  isHovered,
  isFocused = false,
  onSelect,
  onClick,
  onFlag,
  onArchive,
  onDelete,
  onMove,
  onMouseEnter,
  onMouseLeave,
}: DraggableThreadListItemProps) {
  const emailIds = draggedEmailIds ?? [thread.id];
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: thread.id,
    data: {
      type: 'email',
      emailId: thread.id,
      emailIds,
      emailCount: emailIds.length,
      providerId: thread.providerId,
      thread,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    transition: 'opacity 150ms ease',
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        userSelect: 'none',
      }}
    >
      <ThreadListItem
        thread={thread}
        isSelected={isSelected}
        isHovered={isHovered}
        isFocused={isFocused}
        dragHandleProps={{ ...listeners, ...attributes }}
        onSelect={onSelect}
        onClick={onClick}
        onFlag={onFlag}
        onArchive={onArchive}
        onDelete={onDelete}
        onMove={onMove}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </Box>
  );
}, (prev, next) => (
  prev.thread.id === next.thread.id &&
  prev.thread.from === next.thread.from &&
  prev.thread.subject === next.thread.subject &&
  prev.thread.date === next.thread.date &&
  prev.thread.isUnread === next.thread.isUnread &&
  prev.thread.isFlagged === next.thread.isFlagged &&
  prev.thread.hasAttachments === next.thread.hasAttachments &&
  prev.thread.threadCount === next.thread.threadCount &&
  prev.thread.providerId === next.thread.providerId &&
  (prev.draggedEmailIds?.join('|') ?? '') === (next.draggedEmailIds?.join('|') ?? '') &&
  prev.isSelected === next.isSelected &&
  prev.isHovered === next.isHovered &&
  prev.isFocused === next.isFocused
));

DraggableThreadListItem.displayName = 'DraggableThreadListItem';

export default DraggableThreadListItem;
