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

// Indentation per nesting level (in pixels)
const INDENT_PER_LEVEL = 16;

interface FolderItemDisplayProps {
  folder: FolderType;
  icon: React.ReactNode;
  label: string;
  selected?: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  style?: React.CSSProperties;
  /** Nesting depth (0 = root). Used for visual indentation. */
  level?: number;
  /** Whether this folder is currently a drop target for another folder */
  isDropTarget?: boolean;
}

/**
 * Presentational folder item - used both for sortable and overlay
 * Uses forwardRef for clean DOM structure
 * Entire item is draggable (not just a handle)
 */
export const FolderItemDisplay = forwardRef<HTMLDivElement, FolderItemDisplayProps>(
  function FolderItemDisplay(
    { folder, icon, label, selected, isDragging, isOverlay, onClick, onMouseEnter, onMouseLeave, dragProps, style, level = 0, isDropTarget = false },
    ref
  ) {
    // Calculate indentation based on nesting level
    // MUI spacing unit is 8px, so we divide by 8 to convert pixels to spacing units
    const indentPadding = level * INDENT_PER_LEVEL / 8;

    return (
      <ListItemButton
        ref={ref}
        component="div"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        selected={selected}
        style={style}
        {...dragProps}
        sx={{
          py: 0.25,
          px: 1,
          pl: 1 + indentPadding, // Base padding + level indentation
          minHeight: 32,
          borderRadius: 1,
          mx: 0.5,
          position: 'relative',
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: isOverlay
            ? (theme) => alpha(theme.palette.background.paper, 0.95)
            : isDropTarget
              ? (theme) => alpha(theme.palette.primary.main, 0.08)
              : undefined,
          boxShadow: isOverlay ? '0 4px 12px rgba(0,0,0,0.15)' : undefined,
          // Drop target visual indicator
          ...(isDropTarget && {
            outline: '2px dashed',
            outlineColor: 'primary.main',
            outlineOffset: -2,
          }),
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
  providerId: string;
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Optional prefetch handler on hover */
  onMouseEnter?: () => void;
  /** Optional cleanup handler on mouse leave */
  onMouseLeave?: () => void;
  /** Nesting depth (0 = root). Used for visual indentation. */
  level?: number;
  /** Whether this folder is currently a drop target for another folder */
  isDropTarget?: boolean;
}

/**
 * Sortable wrapper using useSortable hook
 * Provides drag-and-drop functionality with smooth animations
 * Entire item is draggable
 */
export function SortableFolderItem({
  folder,
  providerId,
  icon,
  label,
  selected,
  onClick,
  onMouseEnter,
  onMouseLeave,
  level = 0,
  isDropTarget = false,
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
    data: {
      type: 'sortable-folder',
      folderId: folder.id,
      providerId,
      folderName: folder.name,
      folder, // Pass full folder data for drop handling
    },
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      dragProps={{ ...attributes, ...listeners }}
      style={style}
      level={level}
      isDropTarget={isDropTarget}
    />
  );
}

export default SortableFolderItem;
