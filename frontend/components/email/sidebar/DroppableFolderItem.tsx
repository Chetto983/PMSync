/**
 * Droppable Folder Item Component
 *
 * Wraps FolderItem to accept email drops with:
 * - Provider validation (only same provider)
 * - Grow animation on hover (scale 1.05)
 * - Highlight on valid drop target
 * - Forbidden cursor on invalid drop
 *
 * Animation: 200ms ease with scale + background color
 */

import { useDroppable } from '@dnd-kit/core';
import { Box, alpha } from '@mui/material';
import { ReactNode } from 'react';

interface DroppableFolderItemProps {
  folderId: string;
  providerId: string;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * Makes folder accept email drops with provider validation
 */
export function DroppableFolderItem({
  folderId,
  providerId,
  children,
  disabled = false,
}: DroppableFolderItemProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: folderId,
    data: {
      type: 'folder',
      folderId,
      providerId,
    },
    disabled,
  });

  // Check if dragged item is from same provider
  const draggedProviderId = active?.data?.current?.providerId;
  const isValidDrop = active && draggedProviderId === providerId;
  const isInvalidDrop = active && draggedProviderId && draggedProviderId !== providerId;

  return (
    <Box
      ref={setNodeRef}
      sx={{
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isOver && isValidDrop ? 'scale(1.03)' : 'scale(1)',
        transformOrigin: 'center left',
        bgcolor:
          isOver && isValidDrop
            ? (theme) => alpha(theme.palette.primary.main, 0.12)
            : isInvalidDrop && isOver
              ? (theme) => alpha(theme.palette.error.main, 0.08)
              : 'transparent',
        borderRadius: 1,
        cursor: isInvalidDrop && isOver ? 'not-allowed' : 'pointer',
        // Add glow border on valid hover
        border: '2px solid',
        borderColor:
          isOver && isValidDrop
            ? 'primary.main'
            : isInvalidDrop && isOver
              ? 'error.main'
              : 'transparent',
        // Add subtle shadow on valid hover
        boxShadow:
          isOver && isValidDrop
            ? (theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.25)}`
            : isInvalidDrop && isOver
              ? (theme) => `0 2px 8px ${alpha(theme.palette.error.main, 0.15)}`
              : 'none',
        // Pulse animation for valid drop
        animation: isOver && isValidDrop ? 'dropPulse 1s ease-in-out infinite' : 'none',
        '@keyframes dropPulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.85 },
        },
      }}
    >
      {children}
    </Box>
  );
}

export default DroppableFolderItem;
