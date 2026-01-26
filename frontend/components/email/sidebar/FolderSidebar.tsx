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

import React from 'react';
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
// DragOverlay is centralized in EmailLayout
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
// useEmailDnd not needed - DragOverlay is in EmailLayout
import {
  RefreshCw,
  Flag,
  ChevronDown,
  ChevronRight,
  User,
  Plus,
  MoreHorizontal,
  RefreshCcw,
  Crown,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders, useSyncProviderComplete } from '@/hooks/queries/use-folders';
import { useUserPreferences } from '@/hooks/queries/use-settings';
import { useEmailUIStore, useEmailSidebar, type SpecialFolder } from '@/stores/email-ui-store';
import { useFoldersStore } from '@/stores/folders-store';
import { useToast } from '@/hooks/use-toast';
import { FolderItem } from './FolderItem';
import { SortableFolderItem } from './SortableFolderItem';
import { DroppableFolderItem } from './DroppableFolderItem';
import { LabelsSidebar } from './LabelsSidebar';
import {
  FolderDialog,
  FolderContextMenu,
  useFolderManagement,
  FOLDER_ORDER,
  getSpecialFolderIcon,
  getFolderIcon,
  getFolderDisplayName,
  sortFoldersByOrder,
} from '../folders';
import type { Folder as FolderType, Provider } from '@/lib/api/folders';

interface FolderSidebarProps {
  collapsed?: boolean;
  width?: number;
}

export function FolderSidebar({ collapsed = false, width }: FolderSidebarProps) {
  const t = useTranslations();
  const { data, isLoading, refetch, isFetching } = useFolders();
  const { data: preferences } = useUserPreferences();
  const syncComplete = useSyncProviderComplete();
  const toast = useToast();
  const { syncingProviders, setSyncing, setLastSync } = useFoldersStore();

  const filters = useEmailUIStore((state) => state.filters);
  const setFolder = useEmailUIStore((state) => state.setFolder);
  const setFilters = useEmailUIStore((state) => state.setFilters);
  const toggleProviderCollapse = useEmailUIStore((state) => state.toggleProviderCollapse);

  const { collapsedProviders } = useEmailSidebar();

  // DnD state and DragOverlay are managed by EmailLayout's shared DndContext

  // Folder management (shared hook)
  const {
    folderDialogOpen,
    createFolderProviderId,
    folderMenuAnchor,
    selectedFolder,
    openCreateDialog: handleCreateFolder,
    closeDialog: handleCloseDialog,
    openContextMenu: handleFolderMenu,
    closeContextMenu: handleFolderMenuClose,
    getFolderLabel,
    folderCounts,
  } = useFolderManagement();

  // Note: DnD sensors are now in EmailLayout's shared DndContext

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

  // Handle refresh (basic refetch without sync)
  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success(t.folders.refreshSuccess);
    } catch {
      toast.error(t.folders.refreshFailed);
    }
  };

  // Handle sync for specific provider (syncs BOTH folders AND emails)
  const handleSyncProvider = (providerId: string, providerEmail: string) => {
    // Prevent duplicate sync requests
    if (syncingProviders.has(providerId)) {
      toast.warning(t.folders.syncInProgress);
      return;
    }

    setSyncing(providerId, true);

    syncComplete.mutate(providerId, {
      onSuccess: (data: { foldersCount: number; emailsSynced: boolean; message: string }) => {
        setSyncing(providerId, false);
        setLastSync(providerId, new Date().toISOString());
        toast.success(
          t.folders.syncSuccessComplete
            .replace('{count}', data.foldersCount.toString())
            .replace('{provider}', providerEmail)
        );
      },
      onError: () => {
        setSyncing(providerId, false);
        toast.error(t.folders.syncFailedProvider.replace('{provider}', providerEmail));
      },
    });
  };

  // Note: handleSyncAll is available via syncAllFolders hook but not currently used in UI
  // To add "Sync All" button, use: syncAllFolders.mutate() with similar pattern as handleSyncProvider

  // Note: Drag handlers and DragOverlay are now in EmailLayout's shared DndContext

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
                  icon={getSpecialFolderIcon(folder, 18)}
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

            {/* Quick Filters - Important & VIP */}
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
                    fromVip: undefined,
                  });
                }}
              />
              <FolderItem
                icon={<Crown size={18} />}
                label={t.email.quickFilters.vip}
                collapsed={collapsed}
                selected={filters.fromVip === true}
                onClick={() => {
                  setFilters({
                    fromVip: filters.fromVip ? undefined : true,
                    isImportant: undefined,
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
                        <Tooltip title={t.folders.syncFolder}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSyncProvider(provider.id, provider.displayName || provider.email);
                              }}
                              disabled={syncingProviders.has(provider.id)}
                              sx={{
                                mr: 0.5,
                                p: 0.25,
                                animation: syncingProviders.has(provider.id) ? 'spin 1s linear infinite' : 'none',
                                '@keyframes spin': {
                                  '0%': { transform: 'rotate(0deg)' },
                                  '100%': { transform: 'rotate(360deg)' },
                                },
                              }}
                            >
                              <RefreshCcw size={14} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={t.folders?.createFolder || 'Create folder'}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateFolder(provider.id);
                            }}
                            sx={{ mr: 0.5, p: 0.25 }}
                          >
                            <Plus size={14} />
                          </IconButton>
                        </Tooltip>
                        {isProviderCollapsed ? (
                          <ChevronRight size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </ListItemButton>

                      {/* Provider Folders - Sortable (uses shared DndContext from EmailLayout) */}
                      <Collapse in={!isProviderCollapsed} timeout="auto" unmountOnExit>
                        <SortableContext
                          items={sortedFolders.map((f) => f.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <List disablePadding sx={{ pl: 2 }}>
                            {sortedFolders.map((folder) => {
                              const folderName = getFolderDisplayName(folder, getFolderLabel);

                              return (
                                <DroppableFolderItem
                                  key={folder.id}
                                  folderId={folder.id}
                                  providerId={provider.id}
                                >
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      '&:hover .folder-menu-btn': {
                                        opacity: 1,
                                      },
                                    }}
                                  >
                                    <SortableFolderItem
                                      folder={folder}
                                      providerId={provider.id}
                                      icon={getFolderIcon(folder)}
                                      label={folderName}
                                      selected={filters.folderId === folder.id}
                                      onClick={() => handleProviderFolderClick(provider.id, folder)}
                                    />
                                    {/* Show menu for custom folders only (not system folders) */}
                                    {!folder.isSystem && (
                                      <IconButton
                                        size="small"
                                        className="folder-menu-btn"
                                        onClick={(e) => handleFolderMenu(e, folder)}
                                        sx={{
                                          p: 0.25,
                                          opacity: 0,
                                          transition: 'opacity 0.15s',
                                          mr: 0.5,
                                        }}
                                      >
                                        <MoreHorizontal size={14} />
                                      </IconButton>
                                    )}
                                  </Box>
                                </DroppableFolderItem>
                              );
                            })}
                          </List>
                        </SortableContext>

                        {/* DragOverlay is centralized in EmailLayout */}
                      </Collapse>
                    </Box>
                  );
                })}
              </>
            )}
          </>
        )}
      </Box>

      {/* Folder Context Menu */}
      <FolderContextMenu
        anchorEl={folderMenuAnchor}
        open={Boolean(folderMenuAnchor)}
        onClose={handleFolderMenuClose}
        folder={selectedFolder}
      />

      {/* Create Folder Dialog */}
      <FolderDialog
        open={folderDialogOpen}
        onClose={handleCloseDialog}
        providerId={createFolderProviderId}
      />

      {/* Toast Container - must be rendered for toast notifications to work */}
      <toast.ToastContainer />
    </Box>
  );
}

export default FolderSidebar;
