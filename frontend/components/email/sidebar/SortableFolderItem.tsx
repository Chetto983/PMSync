/**
 * Sortable Folder Item Component
 *
 * A draggable folder item using @dnd-kit for reordering.
 * Entire item is draggable with smooth animations.
 *
 * Best practices:
 * - Separate presentational component for DragOverlay
 * - Custom transition for snappy feel (150ms)
 * - CSS transforms for smooth animations
 * - Touch-action: none for mobile support
 *
 * @see https://docs.dndkit.com/presets/sortable
 */

import React, { forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  alpha,
} from '@mui/material';
import type { Folder as FolderType } from '@/lib/api/folders';

// Custom transition for snappy, responsive feel
const ANIMATION_CONFIG = {
  duration: 150, // ms - faster than default 250ms for snappy feel
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)', // ease-out-quart
};

interface FolderItemDisplayProps {
  folder: FolderType;
  icon: React.ReactNode;
  label: string;
  selected?: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  style?: React.CSSProperties;
}

/**
 * Presentational folder item - used both for sortable and overlay
 * Uses forwardRef for clean DOM structure
 * Entire item is draggable (not just a handle)
 */
export const FolderItemDisplay = forwardRef<HTMLDivElement, FolderItemDisplayProps>(
  function FolderItemDisplay(
    { folder, icon, label, selected, isDragging, isOverlay, onClick, dragProps, style },
    ref
  ) {
    return (
      <ListItemButton
        ref={ref}
        component="div"
        onClick={onClick}
        selected={selected}
        style={style}
        {...dragProps}
        sx={{
          py: 0.25,
          px: 1,
          minHeight: 32,
          borderRadius: 1,
          mx: 0.5,
          position: 'relative',
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: isOverlay
            ? (theme) => alpha(theme.palette.background.paper, 0.95)
            : undefined,
          boxShadow: isOverlay ? '0 4px 12px rgba(0,0,0,0.15)' : undefined,
          cursor: isOverlay ? 'grabbing' : 'grab',
          touchAction: 'none', // Required for mobile drag support
          userSelect: 'none',
          '&.Mui-selected': {
            backgroundColor: (theme) =>
              alpha(theme.palette.primary.main, 0.08),
            '&:hover': {
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, 0.12),
            },
          },
          '&:hover': {
            backgroundColor: (theme) =>
              alpha(theme.palette.action.hover, 0.04),
          },
          '&:active': {
            cursor: 'grabbing',
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          {(folder.unreadCount ?? 0) > 0 ? (
            <Badge
              badgeContent={folder.unreadCount > 99 ? '99+' : folder.unreadCount}
              color="primary"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.6rem',
                  height: 14,
                  minWidth: 14,
                  padding: '0 3px',
                },
              }}
            >
              {icon}
            </Badge>
          ) : (
            icon
          )}
        </ListItemIcon>
        <ListItemText
          primary={label}
          slotProps={{
            primary: {
              variant: 'body2',
              fontSize: '0.75rem',
              noWrap: true,
            },
          }}
        />
      </ListItemButton>
    );
  }
);

interface SortableFolderItemProps {
  folder: FolderType;
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}

/**
 * Sortable wrapper using useSortable hook
 * Provides drag-and-drop functionality with smooth animations
 * Entire item is draggable
 */
export function SortableFolderItem({
  folder,
  icon,
  label,
  selected,
  onClick,
}: SortableFolderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: folder.id,
    transition: ANIMATION_CONFIG,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Handle click to prevent triggering during drag
  const handleClick = () => {
    // Only trigger click if not currently dragging
    if (!isDragging) {
      onClick();
    }
  };

  return (
    <FolderItemDisplay
      ref={setNodeRef}
      folder={folder}
      icon={icon}
      label={label}
      selected={selected}
      isDragging={isDragging}
      onClick={handleClick}
      dragProps={{ ...attributes, ...listeners }}
      style={style}
    />
  );
}

export default SortableFolderItem;
