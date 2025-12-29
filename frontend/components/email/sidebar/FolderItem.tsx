/**
 * Folder Item Component
 *
 * Individual folder item in the sidebar navigation.
 * Supports collapsed mode, unread count badge, and selection state.
 *
 * Design: Clean TailAdmin-inspired with subtle hover effects
 */

import React from 'react';
import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Tooltip,
  useTheme,
} from '@mui/material';

interface FolderItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  selected?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}

export function FolderItem({
  icon,
  label,
  count,
  selected = false,
  collapsed = false,
  onClick,
}: FolderItemProps) {
  const theme = useTheme();

  const content = (
    <ListItem disablePadding sx={{ px: collapsed ? 0.5 : 1 }}>
      <ListItemButton
        selected={selected}
        onClick={onClick}
        sx={{
          borderRadius: 1.5,
          py: 0.75,
          px: collapsed ? 1 : 1.5,
          minHeight: 40,
          justifyContent: collapsed ? 'center' : 'flex-start',
          transition: 'all 0.15s ease',
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
          },
          '&.Mui-selected': {
            backgroundColor: theme.palette.primary.main + '14', // 8% opacity
            '&:hover': {
              backgroundColor: theme.palette.primary.main + '1F', // 12% opacity
            },
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: collapsed ? 0 : 36,
            color: selected ? 'primary.main' : 'text.secondary',
            justifyContent: 'center',
          }}
        >
          {count !== undefined && count > 0 ? (
            <Badge
              badgeContent={count > 99 ? '99+' : count}
              color="primary"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.65rem',
                  height: 16,
                  minWidth: 16,
                  padding: '0 4px',
                },
              }}
            >
              {icon}
            </Badge>
          ) : (
            icon
          )}
        </ListItemIcon>

        {!collapsed && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{
              variant: 'body2',
              fontWeight: selected ? 600 : 400,
              color: selected ? 'primary.main' : 'text.primary',
              noWrap: true,
            }}
          />
        )}

        {/* Count badge on expanded view (alternative position) */}
        {!collapsed && count !== undefined && count > 0 && (
          <Badge
            badgeContent={count > 99 ? '99+' : count}
            color="default"
            sx={{
              '& .MuiBadge-badge': {
                position: 'relative',
                transform: 'none',
                fontSize: '0.7rem',
                height: 18,
                minWidth: 18,
                backgroundColor: selected
                  ? theme.palette.primary.main + '1F'
                  : theme.palette.action.selected,
                color: selected ? 'primary.main' : 'text.secondary',
              },
            }}
          />
        )}
      </ListItemButton>
    </ListItem>
  );

  // Wrap with tooltip when collapsed
  if (collapsed) {
    return (
      <Tooltip title={label} placement="right" arrow>
        {content}
      </Tooltip>
    );
  }

  return content;
}

export default FolderItem;
