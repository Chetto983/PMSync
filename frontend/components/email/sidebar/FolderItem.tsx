/**
 * Folder Item Component
 *
 * Individual folder item in the sidebar navigation.
 * Supports collapsed mode, unread count (right-aligned number), and selection state.
 *
 * Design: Outlook-inspired — left accent border on active, right-aligned count,
 * compact spacing, clear visual hierarchy.
 */

import React from 'react';
import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
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
  /** Optional prefetch handler on hover */
  onMouseEnter?: () => void;
  /** Optional cleanup handler on mouse leave */
  onMouseLeave?: () => void;
}

export function FolderItem({
  icon,
  label,
  count,
  selected = false,
  collapsed = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: FolderItemProps) {
  const theme = useTheme();
  const hasCount = count !== undefined && count > 0;

  const content = (
    <ListItem disablePadding sx={{ px: collapsed ? 0.5 : 0.5 }}>
      <ListItemButton
        data-testid="folder-item"
        selected={selected}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        sx={{
          borderRadius: 1,
          py: 0.5,
          px: collapsed ? 1 : 1.5,
          minHeight: 36,
          justifyContent: collapsed ? 'center' : 'flex-start',
          transition: 'background-color 0.15s ease',
          // Active: left accent border
          borderLeft: 3,
          borderLeftColor: selected ? 'primary.main' : 'transparent',
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
          },
          '&.Mui-selected': {
            backgroundColor: theme.palette.primary.main + '0A', // 4% opacity — subtle
            '&:hover': {
              backgroundColor: theme.palette.primary.main + '14', // 8% opacity
            },
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: collapsed ? 0 : 32,
            color: selected ? 'primary.main' : 'text.secondary',
            justifyContent: 'center',
          }}
        >
          {/* Badge on icon only when collapsed (no room for count text) */}
          {collapsed && hasCount ? (
            <Badge
              badgeContent={count > 99 ? '99+' : count}
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

        {!collapsed && (
          <>
            <ListItemText
              primary={label}
              slotProps={{
                primary: {
                  variant: 'body2',
                  fontWeight: selected ? 600 : hasCount ? 500 : 400,
                  color: selected ? 'primary.main' : 'text.primary',
                  noWrap: true,
                  fontSize: '0.8125rem',
                },
              }}
            />
            {/* Right-aligned unread count (not badge) */}
            {hasCount && (
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.6875rem',
                  color: selected ? 'primary.main' : 'text.secondary',
                  flexShrink: 0,
                  ml: 1,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 20,
                  textAlign: 'right',
                }}
              >
                {count > 99 ? '99+' : count}
              </Typography>
            )}
          </>
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
