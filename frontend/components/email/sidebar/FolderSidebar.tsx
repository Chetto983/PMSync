/**
 * Folder Sidebar Component
 *
 * Displays the folder navigation for the email module.
 * Uses TanStack Query for data, Zustand for UI state.
 * Features collapsible provider sections with drag-and-drop reordering.
 *
 * Design: Clean TailAdmin-inspired sidebar with icons
 * DnD: @dnd-kit with DragOverlay for smooth animations
 * @see https://docs.dndkit.com/presets/sortable
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  List,
  Divider,
  Typography,
  Skeleton,
  IconButton,
  Tooltip,
  Collapse,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  alpha,
} from '@mui/material';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Mail,
  RefreshCw,
  Flag,
  ChevronDown,
  ChevronRight,
  Folder,
  User,
  Star,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders } from '@/hooks/queries/use-folders';
import { useUserPreferences, useUpdatePreferences } from '@/hooks/queries/use-settings';
import { useEmailUIStore, useEmailSidebar, type SpecialFolder } from '@/stores/email-ui-store';
import { FolderItem } from './FolderItem';
import { SortableFolderItem, FolderItemDisplay } from './SortableFolderItem';
import { LabelsSidebar } from './LabelsSidebar';
import type { Folder as FolderType, Provider } from '@/lib/api/folders';

interface FolderSidebarProps {
  collapsed?: boolean;
  width?: number;
}

// Map special folder types to icons (including all backend special uses)
const FOLDER_ICONS: Record<string, React.ReactNode> = {
  INBOX: <Inbox size={18} />,
  SENT: <Send size={18} />,
  DRAFTS: <FileText size={18} />,
  TRASH: <Trash2 size={18} />,
  SPAM: <AlertOctagon size={18} />,
  JUNK: <AlertOctagon size={18} />,
  ARCHIVE: <Archive size={18} />,
  ALL: <Mail size={18} />,
  STARRED: <Star size={18} />,
  FLAGGED: <Flag size={18} />,
  IMPORTANT: <Flag size={18} />,
};

// Order of special folders in sidebar (top-level aggregated view)
const FOLDER_ORDER: SpecialFolder[] = [
  'INBOX',
  'SENT',
  'DRAFTS',
  'ARCHIVE',
  'SPAM',
  'TRASH',
  'ALL',
];

// Get icon for a folder based on specialUse
function getFolderIcon(folder: FolderType): React.ReactNode {
  if (folder.specialUse) {
    const specialUse = folder.specialUse.toUpperCase();
    return FOLDER_ICONS[specialUse] || <Folder size={16} />;
  }
  return <Folder size={16} />;
}

/**
 * Sort folders by user preference order, then by default order
 */
function sortFoldersByOrder(
  folders: FolderType[],
  orderIds: string[] | undefined
): FolderType[] {
  if (orderIds && orderIds.length > 0) {
    return [...folders].sort((a, b) => {
      const indexA = orderIds.indexOf(a.id);
      const indexB = orderIds.indexOf(b.id);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return defaultFolderSort(a, b);
    });
  }
  return [...folders].sort(defaultFolderSort);
}

/**
 * Default folder sorting: special folders first by order, then alphabetical
 */
function defaultFolderSort(a: FolderType, b: FolderType): number {
  const orderA = a.specialUse
    ? FOLDER_ORDER.indexOf(a.specialUse.toUpperCase() as SpecialFolder)
    : 99;
  const orderB = b.specialUse
    ? FOLDER_ORDER.indexOf(b.specialUse.toUpperCase() as SpecialFolder)
    : 99;
  if (orderA !== orderB) {
    return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
  }
  return a.name.localeCompare(b.name);
}

export function FolderSidebar({ collapsed = false, width }: FolderSidebarProps) {
  const t = useTranslations();
  const { data, isLoading, refetch, isFetching } = useFolders();
  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdatePreferences();

  const filters = useEmailUIStore((state) => state.filters);
  const setFolder = useEmailUIStore((state) => state.setFolder);
  const setFilters = useEmailUIStore((state) => state.setFilters);
  const toggleProviderCollapse = useEmailUIStore((state) => state.toggleProviderCollapse);

  const { collapsedProviders } = useEmailSidebar();

  // Track active drag item for DragOverlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);

  // Configure DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get folder labels from translations
  const getFolderLabel = useCallback((folder: string): string => {
    const upperFolder = folder.toUpperCase();
    const labels: Record<string, string> = {
      INBOX: t.folders.inbox,
      SENT: t.folders.sent,
      DRAFTS: t.folders.drafts,
      TRASH: t.folders.trash,
      SPAM: t.folders.spam,
      JUNK: t.folders.spam, // JUNK is same as SPAM
      ARCHIVE: t.folders.archive,
      ALL: t.folders.all,
      STARRED: t.folders.starred,
      FLAGGED: t.folders.starred, // FLAGGED is same as STARRED
      IMPORTANT: t.email?.quickFilters?.important || 'Important',
    };
    return labels[upperFolder] || folder;
  }, [t]);

  // Calculate unread counts per folder from API data
  const folderCounts = useMemo(() => {
    const counts: Partial<Record<SpecialFolder, number>> = {};

    if (data?.foldersByProvider) {
      Object.values(data.foldersByProvider).forEach((folders) => {
        folders.forEach((folder) => {
          if (folder.specialUse) {
            const specialUse = folder.specialUse.toUpperCase() as SpecialFolder;
            counts[specialUse] = (counts[specialUse] || 0) + (folder.unreadCount || 0);
          }
        });
      });
    }

    return counts;
  }, [data]);

  // Handle aggregated folder selection (clears provider filter)
  const handleFolderClick = (folder: SpecialFolder) => {
    setFilters({ providerId: undefined, folderId: undefined });
    setFolder(folder);
  };

  // Handle provider-specific folder click (tracks by folder ID)
  const handleProviderFolderClick = (providerId: string, folder: FolderType) => {
    setFilters({
      providerId,
      folderId: folder.id,
      specialUse: folder.specialUse?.toUpperCase() as SpecialFolder,
    });
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent, providerId: string) => {
    setActiveId(event.active.id as string);
    setActiveProviderId(providerId);
  };

  // Handle drag end - reorder and persist
  const handleDragEnd = (event: DragEndEvent, providerId: string, folders: FolderType[]) => {
    const { active, over } = event;

    setActiveId(null);
    setActiveProviderId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = folders.findIndex((f) => f.id === active.id);
    const newIndex = folders.findIndex((f) => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFolders = arrayMove(folders, oldIndex, newIndex);
    const newOrder = reorderedFolders.map((f) => f.id);

    const currentFolderOrders = preferences?.folderOrders || {};
    updatePreferences.mutate({
      folderOrders: {
        ...currentFolderOrders,
        [providerId]: newOrder,
      },
    });
  };

  // Get active folder for DragOverlay
  const getActiveFolder = (): FolderType | null => {
    if (!activeId || !activeProviderId || !data?.foldersByProvider) return null;
    const folders = data.foldersByProvider[activeProviderId];
    return folders?.find((f) => f.id === activeId) || null;
  };

  const activeFolder = getActiveFolder();
  const sidebarWidth = width ?? (collapsed ? 64 : '100%');

  return (
    <Box
      sx={{
        width: sidebarWidth,
        minWidth: collapsed ? 64 : 180,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: collapsed ? 1 : 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 48,
        }}
      >
        {!collapsed && (
          <Typography variant="subtitle2" fontWeight={600} color="text.primary">
            {t.folders.inbox}
          </Typography>
        )}
        <Tooltip title={t.folders.refresh}>
          <span>
            <IconButton
              size="small"
              onClick={handleRefresh}
              disabled={isFetching}
              sx={{
                animation: isFetching ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' },
                },
              }}
            >
              <RefreshCw size={16} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Folder List */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {isLoading ? (
          <Box sx={{ px: collapsed ? 1 : 2 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={36}
                sx={{ mb: 0.5, borderRadius: 1 }}
              />
            ))}
          </Box>
        ) : (
          <>
            {/* Aggregated Folders (All Accounts) */}
            <List disablePadding>
              {FOLDER_ORDER.map((folder) => (
                <FolderItem
                  key={folder}
                  icon={FOLDER_ICONS[folder]}
                  label={getFolderLabel(folder)}
                  count={folderCounts[folder]}
                  selected={filters.specialUse === folder && !filters.providerId}
                  collapsed={collapsed}
                  onClick={() => handleFolderClick(folder)}
                />
              ))}
            </List>

            {/* Labels Section */}
            <Divider sx={{ my: 1 }} />
            <LabelsSidebar collapsed={collapsed} />

            {/* Quick Filters - Important */}
            <Divider sx={{ my: 1 }} />
            <List disablePadding>
              <FolderItem
                icon={<Flag size={18} />}
                label={t.email.quickFilters.important}
                collapsed={collapsed}
                selected={filters.isImportant === true}
                onClick={() => {
                  setFilters({
                    isImportant: filters.isImportant ? undefined : true,
                  });
                }}
              />
            </List>

            {/* Provider Sections (Collapsible + Draggable) */}
            {data?.providers && data.providers.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                {!collapsed && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    {t.email.accounts}
                  </Typography>
                )}

                {data.providers.map((provider: Provider) => {
                  const rawFolders = data.foldersByProvider[provider.id] || [];
                  const folderOrder = preferences?.folderOrders?.[provider.id];
                  const sortedFolders = sortFoldersByOrder(rawFolders, folderOrder);
                  const isProviderCollapsed = collapsedProviders.has(provider.id);

                  // Collapsed sidebar: show just account icon with tooltip
                  if (collapsed) {
                    return (
                      <Tooltip key={provider.id} title={provider.displayName || provider.email} placement="right">
                        <ListItemButton
                          sx={{
                            py: 1,
                            px: 1,
                            minHeight: 40,
                            justifyContent: 'center',
                            mx: 0.5,
                            borderRadius: 1,
                            '&:hover': {
                              backgroundColor: (theme) =>
                                alpha(theme.palette.primary.main, 0.08),
                            },
                          }}
                        >
                          <User size={18} />
                        </ListItemButton>
                      </Tooltip>
                    );
                  }

                  // Full sidebar: show expandable provider section
                  return (
                    <Box key={provider.id}>
                      {/* Provider Header */}
                      <ListItemButton
                        onClick={() => toggleProviderCollapse(provider.id)}
                        sx={{
                          py: 0.5,
                          px: 2,
                          minHeight: 36,
                          '&:hover': {
                            backgroundColor: (theme) =>
                              alpha(theme.palette.primary.main, 0.04),
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <User size={16} />
                        </ListItemIcon>
                        <ListItemText
                          primary={provider.displayName || provider.email}
                          slotProps={{
                            primary: {
                              variant: 'body2',
                              fontWeight: 500,
                              noWrap: true,
                              fontSize: '0.8125rem',
                            },
                          }}
                        />
                        {isProviderCollapsed ? (
                          <ChevronRight size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </ListItemButton>

                      {/* Provider Folders - Sortable */}
                      <Collapse in={!isProviderCollapsed} timeout="auto" unmountOnExit>
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={(e) => handleDragStart(e, provider.id)}
                          onDragEnd={(e) => handleDragEnd(e, provider.id, sortedFolders)}
                        >
                          <SortableContext
                            items={sortedFolders.map((f) => f.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <List disablePadding sx={{ pl: 2 }}>
                              {sortedFolders.map((folder) => {
                                const folderName = folder.specialUse
                                  ? getFolderLabel(folder.specialUse)
                                  : folder.name;

                                return (
                                  <SortableFolderItem
                                    key={folder.id}
                                    folder={folder}
                                    icon={getFolderIcon(folder)}
                                    label={folderName}
                                    selected={filters.folderId === folder.id}
                                    onClick={() => handleProviderFolderClick(provider.id, folder)}
                                  />
                                );
                              })}
                            </List>
                          </SortableContext>

                          {/* DragOverlay for smooth dragging */}
                          <DragOverlay>
                            {activeFolder && activeProviderId === provider.id ? (
                              <FolderItemDisplay
                                folder={activeFolder}
                                icon={getFolderIcon(activeFolder)}
                                label={
                                  activeFolder.specialUse
                                    ? getFolderLabel(activeFolder.specialUse)
                                    : activeFolder.name
                                }
                                isOverlay
                              />
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      </Collapse>
                    </Box>
                  );
                })}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

export default FolderSidebar;
