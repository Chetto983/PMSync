/**
 * Labels Sidebar Component — hierarchical label tree with DnD, bulk select/delete.
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
  Checkbox,
  CircularProgress,
} from '@mui/material';
import { Tag, Plus, ChevronDown, ChevronRight, Search, X, Trash2, CheckSquare } from 'lucide-react';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabels, useBulkDeleteLabels } from '@/hooks/queries';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useLabelTreeStore } from '@/stores/label-tree-store';
import { buildTree, flattenTree, getAncestorIds } from '@/lib/label-tree-utils';
import { localizeAiLabel } from '@/lib/email-triage/ai-display';
import { LabelTreeDndWrapper } from '../labels/LabelTreeDndWrapper';
import { LabelDialog } from '../labels/LabelDialog';
import { LabelContextMenu } from '../labels/LabelContextMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Label } from '@/lib/api/labels';
import type { FlattenedItem } from '@/lib/label-tree-utils';

interface LabelsSidebarProps {
  /** Whether sidebar is collapsed */
  collapsed?: boolean;
}

export function LabelsSidebar({ collapsed = false }: LabelsSidebarProps) {
  const t = useTranslations();
  const { locale } = useLocale();
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

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const bulkDelete = useBulkDeleteLabels();

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
        .filter((l) => {
          const localizedName = localizeAiLabel(l.name, locale).toLowerCase();
          return l.name.toLowerCase().includes(query) || localizedName.includes(query);
        })
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
      .filter((l) => {
        const localizedName = localizeAiLabel(l.name, locale).toLowerCase();
        return l.name.toLowerCase().includes(query) || localizedName.includes(query);
      })
      .map((l) => l.id);
    matchIds.forEach((id) => expandTo(id, userLabels));
  }, [searchQuery, userLabels, expandTo, locale]);

  useEffect(() => {
    if (userLabels.length > 0) {
      const validIds = new Set(userLabels.map((l) => l.id));
      pruneStaleIds(validIds);
    }
  }, [userLabels, pruneStaleIds]);

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
          folderPath: undefined,
          specialUse: undefined,
        });
      }
    },
    [setFilters, filters.labelId],
  );

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

  const toggleSectionExpanded = useCallback(() => {
    setSectionExpanded((prev) => !prev);
  }, []);

  const isLabelSelected = useCallback(
    (id: string) => filters.labelId === id,
    [filters.labelId],
  );

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

  // Bulk selection handlers
  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleLabelSelected = useCallback((labelId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === userLabels.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(userLabels.map((l) => l.id)));
    }
  }, [selectedIds.size, userLabels]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await bulkDelete.mutateAsync(ids);
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch {
      // partial failure still resets
    }
    setConfirmDeleteOpen(false);
  }, [selectedIds, bulkDelete]);

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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            {userLabels.length > 0 && (
              <Tooltip title={selectMode ? (t.email?.labels?.exitSelectMode || 'Cancel') : (t.email?.labels?.selectMode || 'Select')}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectMode();
                  }}
                  sx={{ p: 0.5 }}
                  color={selectMode ? 'primary' : 'default'}
                >
                  <CheckSquare size={14} />
                </IconButton>
              </Tooltip>
            )}
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
            locale={locale}
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

            {/* Bulk action bar */}
            {selectMode && (
              <Box
                sx={{
                  px: 1.5,
                  py: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={selectedIds.size === userLabels.length && userLabels.length > 0}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < userLabels.length}
                    onChange={toggleSelectAll}
                    sx={{ p: 0.25 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {selectedIds.size > 0
                      ? (t.email?.labels?.selected || '{count} selected').replace('{count}', String(selectedIds.size))
                      : (t.email?.labels?.selectAll || 'Select all')}
                  </Typography>
                </Box>
                {selectedIds.size > 0 && (
                  <Tooltip title={t.email?.labels?.bulkDelete || 'Delete selected'}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={bulkDelete.isPending}
                      sx={{ p: 0.5 }}
                    >
                      {bulkDelete.isPending ? <CircularProgress size={14} /> : <Trash2 size={14} />}
                    </IconButton>
                  </Tooltip>
                )}
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
                onLabelClick={selectMode ? (item) => toggleLabelSelected(item.id) : handleDndLabelClick}
                onContextMenu={selectMode ? undefined : handleDndContextMenu}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleLabelSelected}
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

      {/* Bulk Delete Confirm Dialog */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={t.email?.labels?.bulkDelete || 'Delete selected'}
        message={
          (t.email?.labels?.bulkDeleteConfirm || 'Are you sure you want to delete {count} label(s)? Emails with these labels will not be deleted.').replace('{count}', String(selectedIds.size))
        }
        confirmText={t.common?.delete || 'Delete'}
        cancelText={t.common?.cancel || 'Cancel'}
        confirmColor="error"
        isLoading={bulkDelete.isPending}
        variant="danger"
      />
    </>
  );
}

function CollapsedLabelList({
  labels,
  selectedLabelId,
  onLabelClick,
  locale,
}: {
  labels: Label[];
  selectedLabelId?: string;
  onLabelClick: (id: string) => void;
  locale?: string;
}) {
  return (
    <List disablePadding>
      {labels.map((label) => (
        <Tooltip key={label.id} title={localizeAiLabel(label.name, locale)} placement="right">
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
