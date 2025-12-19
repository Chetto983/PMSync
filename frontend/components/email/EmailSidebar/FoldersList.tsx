import React, { useState, useCallback } from 'react';
import {
  Box,
  List,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Skeleton,
  Tooltip,
} from '@mui/material';
import { ChevronDown, FolderPlus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useDndMonitor } from '@dnd-kit/core';
import { useFoldersStore } from '@/stores/folders-store';
import { DroppableFolderItem } from './DroppableFolderItem';
import type { FolderGroup, FolderItem } from './types';

interface FoldersListProps {
  folderGroups: FolderGroup[];
  selectedFolderId?: string | null;
  onFolderSelect: (folderId: string) => void;
  loading: boolean;
  isEmailDragging: boolean;
  folderOrders: Record<string, string[]>;
  setFolderOrders: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onFolderContextMenu: (event: React.MouseEvent<HTMLElement>, folder: FolderItem) => void;
  onCreateFolderForProvider: (providerId: string, providerEmail: string) => void;
  t: {
    email: {
      noProviders: string;
    };
    folders: {
      createFolder: string;
    };
  };
}

/**
 * Folders list section with provider grouping and drag-drop support
 */
export function FoldersList({
  folderGroups,
  selectedFolderId,
  onFolderSelect,
  loading,
  isEmailDragging,
  folderOrders,
  setFolderOrders,
  onFolderContextMenu,
  onCreateFolderForProvider,
  t,
}: FoldersListProps) {
  const countsByFolderId = useFoldersStore((state) => state.countsByFolderId);

  // Track which providers are expanded
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    return new Set(folderGroups.map((g) => g.providerId));
  });

  // Listen for folder reorder drag events
  useDndMonitor({
    onDragEnd: (event) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      // Only handle folder reordering (type: 'folder-reorder')
      if (active.data.current?.type !== 'folder-reorder') return;

      const activeFolderId = active.id.toString();
      const overFolderId = over.id.toString().replace('droppable-', '');

      const providerGroup = folderGroups.find((g) =>
        g.folders.some((f) => f.id === activeFolderId)
      );

      if (!providerGroup) return;

      const currentOrder =
        folderOrders[providerGroup.providerId] || providerGroup.folders.map((f) => f.id);

      const activeIndex = currentOrder.indexOf(activeFolderId);
      const overIndex = currentOrder.indexOf(overFolderId);

      if (activeIndex === -1 || overIndex === -1) return;

      const newOrder = arrayMove(currentOrder, activeIndex, overIndex);

      setFolderOrders((prev) => ({
        ...prev,
        [providerGroup.providerId]: newOrder,
      }));
    },
  });

  // Toggle provider expansion
  const toggleProvider = useCallback((providerId: string) => {
    setExpandedProviders((prev) => {
      const newExpanded = new Set(prev);
      if (prev.has(providerId)) {
        newExpanded.delete(providerId);
      } else {
        newExpanded.add(providerId);
      }
      return newExpanded;
    });
  }, []);

  // Get live count for a folder
  const getFolderCount = useCallback(
    (folderId: string, providerId?: string): number | undefined => {
      const key = providerId ? `${providerId}:${folderId}` : folderId;
      const liveCounts = countsByFolderId[key];
      return liveCounts?.unreadCount;
    },
    [countsByFolderId]
  );

  // Apply custom folder order for a provider
  const getSortedFolders = useCallback(
    (group: FolderGroup): FolderItem[] => {
      const savedOrder = folderOrders[group.providerId];

      if (!savedOrder || savedOrder.length === 0) {
        return group.folders;
      }

      return [...group.folders].sort((a, b) => {
        const aIndex = savedOrder.indexOf(a.id);
        const bIndex = savedOrder.indexOf(b.id);

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return 0;
      });
    },
    [folderOrders]
  );

  if (loading) {
    return (
      <Box sx={{ px: 1, py: 2 }}>
        {[...Array(3)].map((_, groupIndex) => (
          <Box key={groupIndex} sx={{ mb: 3 }}>
            <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
            {[...Array(4)].map((_, itemIndex) => (
              <Stack
                key={itemIndex}
                direction="row"
                spacing={1.5}
                sx={{ mb: 1, alignItems: 'center', px: 1 }}
              >
                <Skeleton variant="circular" width={20} height={20} />
                <Skeleton variant="text" width="70%" height={18} />
                <Box sx={{ flex: 1 }} />
                <Skeleton variant="rounded" width={24} height={16} />
              </Stack>
            ))}
          </Box>
        ))}
      </Box>
    );
  }

  if (folderGroups.length === 0) {
    return (
      <Box sx={{ px: 2, py: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {t.email.noProviders}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      {folderGroups.map((group) => (
        <Accordion
          key={group.providerId}
          expanded={expandedProviders.has(group.providerId)}
          onChange={() => toggleProvider(group.providerId)}
          disableGutters
          elevation={0}
          sx={{
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
          }}
        >
          <AccordionSummary
            expandIcon={<ChevronDown size={16} />}
            sx={{
              minHeight: 40,
              px: 2,
              '&.Mui-expanded': { minHeight: 40 },
              '& .MuiAccordionSummary-content': { my: 0.5 },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, fontSize: '0.7rem' }}
              >
                {group.providerEmail}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Tooltip title={t.folders.createFolder}>
                <Box
                  component="span"
                  role="button"
                  tabIndex={0}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onCreateFolderForProvider(group.providerId, group.providerEmail);
                  }}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      onCreateFolderForProvider(group.providerId, group.providerEmail);
                    }
                  }}
                  sx={{
                    width: 24,
                    height: 24,
                    mr: 0.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                  aria-label={t.folders.createFolder}
                >
                  <FolderPlus size={14} />
                </Box>
              </Tooltip>
            </Stack>
          </AccordionSummary>

          <AccordionDetails sx={{ p: 0 }}>
            <SortableContext
              items={getSortedFolders(group).map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <List sx={{ py: 0 }}>
                {getSortedFolders(group).map((folder) => {
                  const displayCount =
                    getFolderCount(folder.id, folder.providerId) ?? folder.count;
                  const isSelected = selectedFolderId === folder.id;

                  return (
                    <DroppableFolderItem
                      key={folder.id}
                      folder={folder}
                      isSelected={isSelected}
                      count={displayCount}
                      onSelect={() => onFolderSelect(folder.id)}
                      isEmailDragging={isEmailDragging}
                      onContextMenu={onFolderContextMenu}
                    />
                  );
                })}
              </List>
            </SortableContext>
          </AccordionDetails>
        </Accordion>
      ))}
    </>
  );
}
