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

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Box } from '@mui/material';
import { ThreadListItem, ThreadListItemData } from './ThreadListItem';

interface DraggableThreadListItemProps {
  thread: ThreadListItemData & { providerId: string };
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
export function DraggableThreadListItem({
  thread,
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: thread.id,
    data: {
      type: 'email',
      emailId: thread.id,
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
      {...listeners}
      {...attributes}
      sx={{
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none', // Prevent scrolling during drag on touch devices
      }}
    >
      <ThreadListItem
        thread={thread}
        isSelected={isSelected}
        isHovered={isHovered}
        isFocused={isFocused}
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
}

export default DraggableThreadListItem;
