/**
 * Labels Sidebar Component
 *
 * Displays labels in the email sidebar with:
 * - Collapsible section
 * - List of user labels
 * - Add label button
 * - Context menu for edit/delete
 * - Color indicators
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Tooltip,
  Skeleton,
  Collapse,
  alpha,
} from '@mui/material';
import { Tag, Plus, MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabels } from '@/hooks/queries';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { LabelDialog } from '../labels/LabelDialog';
import { LabelContextMenu } from '../labels/LabelContextMenu';
import type { Label } from '@/lib/api/labels';

interface LabelsSidebarProps {
  /** Whether sidebar is collapsed */
  collapsed?: boolean;
}

export function LabelsSidebar({ collapsed = false }: LabelsSidebarProps) {
  const t = useTranslations();
  const { data: labels, isLoading } = useLabels();

  const filters = useEmailUIStore((state) => state.filters);
  const setFilters = useEmailUIStore((state) => state.setFilters);

  // Section expanded state
  const [expanded, setExpanded] = useState(true);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Context menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

  // Handle label click - filter emails by label
  const handleLabelClick = useCallback(
    (label: Label) => {
      setFilters({
        labelId: label.id,
        providerId: undefined,
        folderId: undefined,
        specialUse: undefined,
      });
    },
    [setFilters]
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, label: Label) => {
      event.preventDefault();
      event.stopPropagation();
      setMenuAnchor(event.currentTarget);
      setSelectedLabel(label);
    },
    []
  );

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    // Don't clear selectedLabel here - the dialog still needs it!
  }, []);

  // Toggle section expanded
  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Check if a label is selected
  const isLabelSelected = (labelId: string) =>
    filters.labelId === labelId;

  // Filter to show only USER labels (not SYSTEM)
  const userLabels = labels?.filter((l) => l.type === 'USER') || [];

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ px: collapsed ? 1 : 2, py: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={32}
            sx={{ mb: 0.5, borderRadius: 1 }}
          />
        ))}
      </Box>
    );
  }

  return (
    <>
      {/* Section Header - Collapsible */}
      {!collapsed ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 0.5,
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: (theme) =>
                alpha(theme.palette.action.hover, 0.5),
            },
            borderRadius: 1,
            mx: 1,
          }}
          onClick={toggleExpanded}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            <Tag size={14} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t.email?.labels?.title || 'Etichette'}
            </Typography>
          </Box>
          <Tooltip title={t.email?.labels?.addLabel || 'Aggiungi etichetta'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setCreateDialogOpen(true);
              }}
              sx={{ p: 0.5 }}
            >
              <Plus size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        // Collapsed: Show Tag icon as section indicator
        <Tooltip title={t.email?.labels?.title || 'Etichette'} placement="right">
          <ListItemButton
            onClick={toggleExpanded}
            sx={{
              py: 0.5,
              px: 1,
              minHeight: 36,
              justifyContent: 'center',
              mx: 0.5,
              borderRadius: 1,
              '&:hover': {
                backgroundColor: (theme) =>
                  alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <Tag size={16} />
          </ListItemButton>
        </Tooltip>
      )}

      {/* Labels List - Collapsible */}
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <List disablePadding>
          {userLabels.length === 0 ? (
            !collapsed && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, py: 1, display: 'block' }}
              >
                {t.email?.labels?.noLabels || 'Nessuna etichetta'}
              </Typography>
            )
          ) : (
            userLabels.map((label) => (
              <ListItemButton
                key={label.id}
                selected={isLabelSelected(label.id)}
                onClick={() => handleLabelClick(label)}
                onContextMenu={(e) => handleContextMenu(e, label)}
                sx={{
                  py: 0.5,
                  px: collapsed ? 1 : 2,
                  pl: collapsed ? 1 : 3.5, // Indent under the header
                  minHeight: 36,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 1,
                  mx: collapsed ? 0.5 : 1,
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
                {/* Tag icon with color */}
                <ListItemIcon
                  sx={{
                    minWidth: collapsed ? 0 : 28,
                    justifyContent: 'center',
                  }}
                >
                  {collapsed ? (
                    <Tooltip title={label.name} placement="right">
                      <Box component="span" sx={{ display: 'flex' }}>
                        <Tag
                          size={16}
                          color={label.color?.backgroundColor || '#9e9e9e'}
                          fill={label.color?.backgroundColor || '#9e9e9e'}
                        />
                      </Box>
                    </Tooltip>
                  ) : (
                    <Tag
                      size={16}
                      color={label.color?.backgroundColor || '#9e9e9e'}
                      fill={label.color?.backgroundColor || '#9e9e9e'}
                    />
                  )}
                </ListItemIcon>

                {/* Label name */}
                {!collapsed && (
                  <>
                    <ListItemText
                      primary={label.name}
                      slotProps={{
                        primary: {
                          variant: 'body2',
                          noWrap: true,
                          fontSize: '0.8125rem',
                        },
                      }}
                    />
                    {/* Email count */}
                    {label._count?.emailLabels !== undefined &&
                      label._count.emailLabels > 0 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 1 }}
                        >
                          {label._count.emailLabels}
                        </Typography>
                      )}
                    {/* More options button */}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, label);
                      }}
                      sx={{
                        p: 0.25,
                        ml: 0.5,
                        opacity: 0,
                        '.MuiListItemButton-root:hover &': { opacity: 1 },
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </IconButton>
                  </>
                )}
              </ListItemButton>
            ))
          )}
        </List>
      </Collapse>

      {/* Collapsed: Add button at bottom */}
      {collapsed && expanded && (
        <Tooltip title={t.email?.labels?.addLabel || 'Aggiungi etichetta'} placement="right">
          <ListItemButton
            onClick={() => setCreateDialogOpen(true)}
            sx={{
              py: 0.5,
              px: 1,
              minHeight: 36,
              justifyContent: 'center',
              mx: 0.5,
              borderRadius: 1,
              '&:hover': {
                backgroundColor: (theme) =>
                  alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <Plus size={16} />
          </ListItemButton>
        </Tooltip>
      )}

      {/* Create Label Dialog */}
      <LabelDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {/* Context Menu */}
      <LabelContextMenu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        label={selectedLabel}
      />
    </>
  );
}

export default LabelsSidebar;
