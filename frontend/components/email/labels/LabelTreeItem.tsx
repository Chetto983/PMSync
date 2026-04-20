/**
 * Label Tree Item Component
 *
 * A single row in the label tree sidebar.
 * Renders indentation, guide lines, chevron, colored border, count, and menu.
 *
 * Uses forwardRef for @dnd-kit compatibility (Plan 05-02).
 */

import React, { forwardRef, useState } from 'react';
import {
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
  IconButton,
  Box,
  Checkbox,
  alpha,
  useMediaQuery,
} from '@mui/material';
import { ChevronRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import { useLocale } from '@/lib/hooks/use-locale';
import { localizeAiLabel } from '@/lib/email-triage/ai-display';
import type { TreeItem } from '@/lib/label-tree-utils';
import { LabelAccuracyBadge } from './LabelAccuracyBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelTreeItemProps {
  label: TreeItem;
  depth: number;
  isCollapsed: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  aggregateCount: number;
  onToggle: () => void;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onMenuClick: (event: React.MouseEvent<HTMLElement>) => void;
  style?: React.CSSProperties;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  /** Show checkbox for bulk selection */
  selectMode?: boolean;
  /** Whether this item is checked in bulk selection */
  isChecked?: boolean;
  /** Toggle checked state */
  onToggleCheck?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate indentation in pixels.
 * First 2 levels at 16px each, levels 3+ at 8px each.
 * Add 8px base padding.
 */
function getIndent(depth: number): number {
  const base = 8;
  if (depth <= 1) return base + depth * 16;
  return base + 2 * 16 + (depth - 2) * 8;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LabelTreeItem = forwardRef<HTMLDivElement, LabelTreeItemProps>(
  function LabelTreeItem(
    {
      label,
      depth,
      isCollapsed,
      isSelected,
      hasChildren,
      aggregateCount,
      onToggle,
      onClick,
      onContextMenu,
      onMenuClick,
      style,
      dragProps,
      isDragging,
      selectMode,
      isChecked,
      onToggleCheck,
    },
    ref,
  ) {
    const [hovered, setHovered] = useState(false);
    const { locale } = useLocale();
    const hasTouchPointer = useMediaQuery('(hover: none), (pointer: coarse)');
    const indent = getIndent(depth);

    // Dimmed empty parents: no own emails AND has children
    const isEmptyParent =
      hasChildren && aggregateCount === 0;

    const borderColor = label.color?.backgroundColor || '#9e9e9e';

    return (
      <div ref={ref} style={style} {...dragProps}>
        <ListItemButton
          selected={isSelected}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          sx={{
            pl: `${indent}px`,
            pr: 1,
            py: 0.25,
            minHeight: 32,
            borderLeft: `3px solid ${borderColor}`,
            opacity: isDragging ? 0.4 : isEmptyParent ? 0.6 : 1,
            position: 'relative',
            touchAction: 'none',
            userSelect: 'none',
            borderRadius: 1,
            mx: 1,
            '&:hover': {
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, 0.08),
            },
            '&.Mui-selected': {
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, 0.12),
              '&:hover': {
                backgroundColor: (theme) =>
                  alpha(theme.palette.primary.main, 0.16),
              },
            },
          }}
        >
          {/* VS Code-style vertical guide lines */}
          {Array.from({ length: depth }, (_, i) => (
            <Box
              key={i}
              sx={{
                position: 'absolute',
                left: `${getIndent(i) + 6}px`,
                top: 0,
                bottom: 0,
                width: '1px',
                bgcolor: (theme) =>
                  alpha(theme.palette.divider, 0.3),
              }}
            />
          ))}

          {/* Checkbox for bulk selection */}
          {selectMode && (
            <Checkbox
              size="small"
              checked={!!isChecked}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCheck?.();
              }}
              sx={{ p: 0.25, mr: 0.25 }}
            />
          )}

          {/* Chevron for expand/collapse */}
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              sx={{ p: 0.25, mr: 0.5, minWidth: 20 }}
            >
              {isCollapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </IconButton>
          ) : (
            <Box sx={{ width: 20, mr: 0.5, flexShrink: 0 }} />
          )}

          {/* Label name */}
          <Tooltip title={localizeAiLabel(label.name, locale)} enterDelay={600} disableInteractive>
            <ListItemText
              primary={localizeAiLabel(label.name, locale)}
              slotProps={{
                primary: {
                  variant: 'body2',
                  noWrap: true,
                  fontSize: '0.8125rem',
                },
              }}
            />
          </Tooltip>

          {/* Aggregate email count */}
          {aggregateCount > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 0.5, flexShrink: 0 }}
            >
              {aggregateCount}
            </Typography>
          )}

          {/* Phase 148 D-10: accuracy pill (30d window) */}
          <LabelAccuracyBadge labelId={label.id} />

          {/* Three-dot menu button (visible on hover) */}
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick(e);
            }}
            sx={{
              p: 0.25,
              ml: 0.5,
              opacity: hovered || hasTouchPointer ? 1 : 0.72,
              color: hovered ? 'text.primary' : 'text.secondary',
              transition: 'opacity 0.15s ease, color 0.15s ease',
              flexShrink: 0,
            }}
          >
            <MoreHorizontal size={14} />
          </IconButton>
        </ListItemButton>
      </div>
    );
  },
);

export default LabelTreeItem;
