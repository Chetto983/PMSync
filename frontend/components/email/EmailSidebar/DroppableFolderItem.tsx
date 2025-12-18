import React, { useEffect, useState } from 'react';
import { Box, Chip, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FolderItem } from './types';

interface DroppableFolderItemProps {
  folder: FolderItem;
  isSelected: boolean;
  count: number | undefined;
  onSelect: () => void;
  isEmailDragging?: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, folder: FolderItem) => void;
}

export const DroppableFolderItem: React.FC<DroppableFolderItemProps> = ({
  folder,
  isSelected,
  count,
  onSelect,
  isEmailDragging = false,
  onContextMenu,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [justDropped, setJustDropped] = useState(false);

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${folder.id}`,
    data: {
      type: 'folder',
      folder,
    },
  });

  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({
    id: folder.id,
    data: {
      type: 'folder-reorder',
      folder,
    },
  });

  useEffect(() => {
    if (!isDragging && transform === null) {
      const timer = setTimeout(() => {
        setJustDropped(true);
        const bounceTimer = setTimeout(() => setJustDropped(false), 400);
        return () => clearTimeout(bounceTimer);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isDragging, transform]);

  const isValidDropTarget = isEmailDragging && !isDragging;
  const isActiveDropTarget = isOver && isValidDropTarget;

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu?.(event, folder);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ListItemButton
      ref={(node) => {
        setDroppableRef(node);
        setSortableRef(node);
      }}
      selected={isSelected}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={style}
      sx={{
        borderRadius: 1.5,
        mb: 0.25,
        mx: 0.5,
        py: 0.75,
        px: 1.5,
        minHeight: 36,
        position: 'relative',

        ...(justDropped && {
          animation: 'folderBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }),

        '@keyframes folderBounce': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.08)' },
          '60%': { transform: 'scale(0.96)' },
          '80%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },

        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none !important',
        },

        cursor: isDragging ? 'grabbing' : 'grab',

        ...(isDragging && {
          bgcolor: 'background.paper',
          boxShadow: '0 12px 28px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.15)',
          border: '2px solid',
          borderColor: 'primary.main',
          zIndex: 1000,
          opacity: 1,
          scale: '1.02',
        }),

        ...(!isDragging && {
          bgcolor: isActiveDropTarget ? 'primary.main' : isOver ? 'action.hover' : 'transparent',
          border: isActiveDropTarget ? '2px solid' : isValidDropTarget ? '2px dashed' : '2px solid transparent',
          borderColor: isActiveDropTarget ? 'primary.dark' : isValidDropTarget ? 'grey.500' : 'transparent',
          boxShadow: isActiveDropTarget ? '0 4px 12px rgba(25, 118, 210, 0.25)' : 'none',
        }),

        '&::before':
          isOver && !isActiveDropTarget && !isDragging
            ? {
                content: '""',
                position: 'absolute',
                top: -2,
                left: 8,
                right: 8,
                height: 3,
                bgcolor: 'primary.main',
                borderRadius: 1,
              }
            : {},

        '&:hover': {
          bgcolor: isActiveDropTarget ? 'primary.main' : 'action.hover',
        },

        '&:focus-visible': {
          outline: '3px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
      {...attributes}
      {...listeners}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: isHovered && !isDragging && !isEmailDragging ? 0.4 : 0,
          transition: 'opacity 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        <Box sx={{ width: 4, height: 4, bgcolor: 'text.secondary', borderRadius: '50%' }} />
        <Box sx={{ width: 4, height: 4, bgcolor: 'text.secondary', borderRadius: '50%' }} />
      </Box>

      <ListItemIcon
        sx={{
          minWidth: 32,
          ml: 1,
          color: isDragging ? 'primary.main' : isActiveDropTarget ? 'white' : folder.color || 'inherit',
          transition: 'color 0.15s ease, transform 0.15s ease',
          transform: isDragging ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {folder.icon}
      </ListItemIcon>

      <ListItemText
        primary={folder.label}
        primaryTypographyProps={{
          fontSize: '0.8125rem',
          fontWeight: isDragging || isSelected ? 600 : 500,
          color: isActiveDropTarget ? 'white' : 'inherit',
          noWrap: true,
        }}
      />

      {count != null && count > 0 && !isActiveDropTarget && (
        <Chip
          label={count}
          size="small"
          sx={{
            height: 18,
            minWidth: 24,
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: isSelected ? 'primary.main' : 'action.selected',
            color: isSelected ? 'white' : 'text.primary',
          }}
        />
      )}
    </ListItemButton>
  );
};

