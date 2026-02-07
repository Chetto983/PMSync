/**
 * Labels Sidebar Component
 *
 * Displays labels as a hierarchical tree in the email sidebar with:
 * - Collapsible section header
 * - Nested tree view with indentation, guide lines, and chevrons
 * - Expand/collapse per label with localStorage persistence
 * - Aggregate email counts on parent labels
 * - Context menu for edit/delete
 * - Colored left border per label
 * - Drag-drop nesting and reordering (via LabelTreeDndWrapper)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  Typography,
  IconButton,
  Tooltip,
  Skeleton,
  Collapse,
  TextField,
  alpha,
} from '@mui/material';
import { Tag, Plus, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabels } from '@/hooks/queries';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useLabelTreeStore } from '@/stores/label-tree-store';
import { buildTree, flattenTree, getAncestorIds } from '@/lib/label-tree-utils';
import { LabelTreeDndWrapper } from '../labels/LabelTreeDndWrapper';
import { LabelDialog } from '../labels/LabelDialog';
import { LabelContextMenu } from '../labels/LabelContextMenu';
import type { Label } from '@/lib/api/labels';
import type { FlattenedItem } from '@/lib/label-tree-utils';

interface LabelsSidebarProps {
  /** Whether sidebar is collapsed */
  collapsed?: boolean;
}

export function LabelsSidebar({ collapsed = false }: LabelsSidebarProps) {
  const t = useTranslations();
  const { data: labels, isLoading } = useLabels();

  const filters = useEmailUIStore((state) => state.filters);
  const setFilters = useEmailUIStore((state) => state.setFilters);

  // Tree expansion state (persisted)
  const expandedIds = useLabelTreeStore((state) => state.expandedIds);
  const toggleExpanded = useLabelTreeStore((state) => state.toggleExpanded);
  const pruneStaleIds = useLabelTreeStore((state) => state.pruneStaleIds);

  // Section expanded state
  const [sectionExpanded, setSectionExpanded] = useState(true);

  // Search filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();

  // Context menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

  // Filter to show only USER labels (not SYSTEM)
  const userLabels = useMemo(
    () => labels?.filter((l) => l.type === 'USER') || [],
    [labels],
  );

  // Build tree from flat labels
  const tree = useMemo(
    () => buildTree(userLabels, expandedIds),
    [userLabels, expandedIds],
  );

  // Flatten tree for display (skips collapsed children)
  const flatList = useMemo(() => flattenTree(tree), [tree]);

  // Filter flat items by search query (show matches + ancestors)
  const expandTo = useLabelTreeStore((state) => state.expandTo);

  const filteredFlatItems = useMemo(() => {
    if (!searchQuery.trim()) return flatList;
    const query = searchQuery.toLowerCase();
    const matchIds = new Set(
      userLabels
        .filter((l) => l.name.toLowerCase().includes(query))
        .map((l) => l.id),
    );
    const ancestorIds = new Set<string>();
    matchIds.forEach((id) => {
      getAncestorIds(userLabels, id).forEach((aid) => ancestorIds.add(aid));
    });
    const visibleIds = new Set([...matchIds, ...ancestorIds]);
    return flatList.filter((item) => visibleIds.has(item.id));
  }, [flatList, searchQuery, userLabels]);

  // Auto-expand ancestors of search matches
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.toLowerCase();
    const matchIds = userLabels
      .filter((l) => l.name.toLowerCase().includes(query))
      .map((l) => l.id);
    matchIds.forEach((id) => expandTo(id, userLabels));
  }, [searchQuery, userLabels, expandTo]);

  // Prune stale expansion IDs when labels change
  useEffect(() => {
    if (userLabels.length > 0) {
      const validIds = new Set(userLabels.map((l) => l.id));
      pruneStaleIds(validIds);
    }
  }, [userLabels, pruneStaleIds]);

  // Handle label click - toggle filter by label
  const handleLabelClick = useCallback(
    (labelId: string) => {
      if (filters.labelId === labelId) {
        // Deselect — clear label filter
        setFilters({ labelId: undefined });
      } else {
        setFilters({
          labelId,
          providerId: undefined,
          folderId: undefined,
          specialUse: undefined,
        });
      }
    },
    [setFilters, filters.labelId],
  );

  // Handle context menu from DnD wrapper (receives FlattenedItem)
  const handleDndContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, item: FlattenedItem) => {
      event.preventDefault();
      event.stopPropagation();
      const flatLabel = userLabels.find((l) => l.id === item.id);
      if (flatLabel) {
        setMenuAnchor(event.currentTarget);
        setSelectedLabel(flatLabel);
      }
    },
    [userLabels],
  );

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    // Don't clear selectedLabel here - the dialog still needs it!
  }, []);

  // Toggle section expanded
  const toggleSectionExpanded = useCallback(() => {
    setSectionExpanded((prev) => !prev);
  }, []);

  // Check if a label is selected
  const isLabelSelected = useCallback(
    (id: string) => filters.labelId === id,
    [filters.labelId],
  );

  // DnD wrapper label click handler (receives FlattenedItem)
  const handleDndLabelClick = useCallback(
    (item: FlattenedItem) => {
      handleLabelClick(item.id);
    },
    [handleLabelClick],
  );

  // Handle create dialog open with optional parent
  const handleOpenCreate = useCallback((parentId?: string) => {
    setCreateParentId(parentId);
    setCreateDialogOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setCreateDialogOpen(false);
    setCreateParentId(undefined);
  }, []);

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
          onClick={toggleSectionExpanded}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {sectionExpanded ? (
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
              {t.email?.labels?.title || 'Labels'}
            </Typography>
          </Box>
          <Tooltip title={t.email?.labels?.addLabel || 'Add Label'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenCreate();
              }}
              sx={{ p: 0.5 }}
            >
              <Plus size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        // Collapsed sidebar: Show Tag icon as section indicator
        <Tooltip
          title={t.email?.labels?.title || 'Labels'}
          placement="right"
        >
          <ListItemButton
            onClick={toggleSectionExpanded}
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

      {/* Labels Tree - Collapsible */}
      <Collapse in={sectionExpanded} timeout="auto" unmountOnExit>
        {collapsed ? (
          /* Collapsed sidebar: flat icon list */
          <CollapsedLabelList
            labels={userLabels}
            selectedLabelId={filters.labelId}
            onLabelClick={handleLabelClick}
          />
        ) : (
          <>
            {/* Search filter (visible when 6+ labels) */}
            {userLabels.length > 5 && (
              <Box sx={{ px: 2, py: 0.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder={
                    t.email?.labels?.searchLabelsPlaceholder ||
                    'Filter labels...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <Search
                          size={14}
                          style={{ marginRight: 4, flexShrink: 0 }}
                        />
                      ),
                      endAdornment: searchQuery ? (
                        <IconButton
                          size="small"
                          onClick={() => setSearchQuery('')}
                          sx={{ p: 0.25 }}
                        >
                          <X size={14} />
                        </IconButton>
                      ) : null,
                      sx: { fontSize: '0.75rem', height: 28 },
                    },
                  }}
                />
              </Box>
            )}

            {filteredFlatItems.length === 0 ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, py: 1, display: 'block' }}
              >
                {searchQuery
                  ? (t.email?.labels?.noLabelsFound || 'No labels found')
                  : (t.email?.labels?.noLabels || 'No labels yet')}
              </Typography>
            ) : (
              <LabelTreeDndWrapper
                flatItems={filteredFlatItems}
                tree={tree}
                expandedIds={expandedIds}
                onToggle={toggleExpanded}
                isLabelSelected={isLabelSelected}
                onLabelClick={handleDndLabelClick}
                onContextMenu={handleDndContextMenu}
              />
            )}
          </>
        )}
      </Collapse>

      {/* Collapsed: Add button at bottom */}
      {collapsed && sectionExpanded && (
        <Tooltip
          title={t.email?.labels?.addLabel || 'Add Label'}
          placement="right"
        >
          <ListItemButton
            onClick={() => handleOpenCreate()}
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
        onClose={handleCloseCreate}
        defaultParentId={createParentId}
      />

      {/* Context Menu */}
      <LabelContextMenu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        label={selectedLabel}
        onAddChild={handleOpenCreate}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// CollapsedLabelList - flat icons when sidebar is collapsed
// ---------------------------------------------------------------------------

function CollapsedLabelList({
  labels,
  selectedLabelId,
  onLabelClick,
}: {
  labels: Label[];
  selectedLabelId?: string;
  onLabelClick: (id: string) => void;
}) {
  return (
    <List disablePadding>
      {labels.map((label) => (
        <Tooltip key={label.id} title={label.name} placement="right">
          <ListItemButton
            selected={selectedLabelId === label.id}
            onClick={() => onLabelClick(label.id)}
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
              '&.Mui-selected': {
                backgroundColor: (theme) =>
                  alpha(theme.palette.primary.main, 0.12),
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center' }}>
              <Tag
                size={16}
                color={label.color?.backgroundColor || '#9e9e9e'}
                fill={label.color?.backgroundColor || '#9e9e9e'}
              />
            </ListItemIcon>
          </ListItemButton>
        </Tooltip>
      ))}
    </List>
  );
}

export default LabelsSidebar;
