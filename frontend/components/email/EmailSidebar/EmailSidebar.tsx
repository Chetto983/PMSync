import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  Skeleton,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Mail,
  ChevronDown,
  Filter,
  Tag,
  Settings,
  FolderPlus,
} from 'lucide-react';
import {
  useDndMonitor,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useRouter } from 'next/router';
import { useFoldersStore } from '@/stores/folders-store';
import { useLabelStore } from '@/stores/label-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { labelColorToHex } from '@/lib/api/labels';
import { FolderContextMenu } from '../FolderContextMenu';
import { FolderManagementDialog, type FolderDialogMode } from '../FolderManagementDialog';
import type { Folder } from '@/lib/api/folders';
import { DroppableFolderItem } from './DroppableFolderItem';
import { useEmailSidebarPreferences } from './use-email-sidebar-preferences';

/**
 * Folder item with provider info
 */
export interface FolderItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
  providerId?: string;
  providerEmail?: string;
  specialUse?: string;
  /** Folder path for folder operations */
  path?: string;
  /** Full folder data for context menu operations */
  folderData?: Folder;
}

/**
 * Group of folders by provider
 */
export interface FolderGroup {
  providerId: string;
  providerEmail: string;
  folders: FolderItem[];
}

/**
 * Smart filter definition
 */
export interface SmartFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
}

/**
 * Props for EmailSidebar component
 */
interface EmailSidebarProps {
  /**
   * Folders grouped by provider
   */
  folderGroups: FolderGroup[];

  /**
   * Currently selected folder ID
   */
  selectedFolderId?: string | null;

  /**
   * Callback when a folder is selected
   */
  onFolderSelect: (folderId: string) => void;

  /**
   * Loading state
   */
  loading?: boolean;

  /**
   * Show compose button
   */
  showComposeButton?: boolean;

  /**
   * Custom compose button handler
   */
  onCompose?: () => void;

  /**
   * Smart filters to display
   */
  smartFilters?: SmartFilter[];

  /**
   * Show smart filters section
   */
  showSmartFilters?: boolean;

  /**
   * Show labels section
   */
  showLabels?: boolean;

  /**
   * Callback to open label manager
   */
  onManageLabels?: () => void;

  /**
   * Whether an email is currently being dragged (for drop zone visuals)
   */
  isEmailDragging?: boolean;

  /**
   * Callback to refresh folders after CRUD operations
   */
  onFoldersRefresh?: () => void;
}

// Folder items are rendered by `DroppableFolderItem` (see `./DroppableFolderItem.tsx`).

/**
 * EmailSidebar - Sidebar component for email navigation
 *
 * Displays:
 * - Compose button
 * - Folders grouped by provider (with accordions)
 * - Unread counts per folder
 *
 * @example
 * ```tsx
 * <EmailSidebar
 *   folderGroups={foldersByProvider}
 *   selectedFolderId={selectedFolderId}
 *   onFolderSelect={(id) => setSelectedFolderId(id)}
 *   loading={foldersLoading}
 * />
 * ```
 */
export const EmailSidebar: React.FC<EmailSidebarProps> = ({
  folderGroups,
  selectedFolderId,
  onFolderSelect,
  loading = false,
  showComposeButton = true,
  onCompose,
  smartFilters = [],
  showSmartFilters = true,
  showLabels = true,
  onManageLabels,
  isEmailDragging = false,
  onFoldersRefresh,
}) => {
  const router = useRouter();
  const t = useTranslations();
  const countsByFolderId = useFoldersStore((state) => state.countsByFolderId);
  // Use explicit selectors for better re-render reliability
  const labels = useLabelStore((state) => state.labels);
  const fetchLabels = useLabelStore((state) => state.fetchLabels);
  const labelsLoading = useLabelStore((state) => state.isLoading);

  // ============ FOLDER MANAGEMENT STATE ============
  // Context menu state
  const [contextMenuAnchor, setContextMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextFolder, setContextFolder] = useState<Folder | null>(null);
  const [contextProviderId, setContextProviderId] = useState<string | undefined>();
  const [contextProviderEmail, setContextProviderEmail] = useState<string | undefined>();

  // Folder dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<FolderDialogMode>('create');
  const [dialogFolder, setDialogFolder] = useState<Folder | null>(null);
  const [dialogProviderId, setDialogProviderId] = useState<string | undefined>();
  const [dialogProviderEmail, setDialogProviderEmail] = useState<string | undefined>();
  const [dialogParentPath, setDialogParentPath] = useState<string | undefined>();

  // ============ FOLDER MANAGEMENT HANDLERS ============
  // Handle folder context menu
  const handleFolderContextMenu = useCallback((
    event: React.MouseEvent<HTMLElement>,
    folder: FolderItem
  ) => {
    setContextMenuAnchor(event.currentTarget);
    setContextFolder(folder.folderData || null);
    setContextProviderId(folder.providerId);
    setContextProviderEmail(folder.providerEmail);
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenuAnchor(null);
    setContextFolder(null);
  }, []);

  // Handle create folder
  const handleCreateFolder = useCallback((parentPath?: string) => {
    setDialogMode('create');
    setDialogFolder(null);
    setDialogProviderId(contextProviderId);
    setDialogProviderEmail(contextProviderEmail);
    setDialogParentPath(parentPath);
    setDialogOpen(true);
  }, [contextProviderId, contextProviderEmail]);

  // Handle create folder from provider header "+" button
  const handleCreateFolderForProvider = useCallback((providerId: string, providerEmail: string) => {
    setDialogMode('create');
    setDialogFolder(null);
    setDialogProviderId(providerId);
    setDialogProviderEmail(providerEmail);
    setDialogParentPath(undefined);
    setDialogOpen(true);
  }, []);

  // Handle rename folder
  const handleRenameFolder = useCallback((folder: Folder) => {
    setDialogMode('rename');
    setDialogFolder(folder);
    setDialogProviderId(contextProviderId);
    setDialogProviderEmail(contextProviderEmail);
    setDialogParentPath(undefined);
    setDialogOpen(true);
  }, [contextProviderId, contextProviderEmail]);

  // Handle delete folder
  const handleDeleteFolder = useCallback((folder: Folder) => {
    setDialogMode('delete');
    setDialogFolder(folder);
    setDialogProviderId(contextProviderId);
    setDialogProviderEmail(contextProviderEmail);
    setDialogParentPath(undefined);
    setDialogOpen(true);
  }, [contextProviderId, contextProviderEmail]);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
    setDialogFolder(null);
  }, []);

  // Handle dialog success
  const handleDialogSuccess = useCallback(() => {
    setDialogOpen(false);
    setDialogFolder(null);
    // Refresh folders
    if (onFoldersRefresh) {
      onFoldersRefresh();
    }
  }, [onFoldersRefresh]);


  // Load labels on mount
  useEffect(() => {
    if (showLabels && labels.length === 0) {
      fetchLabels();
    }
  }, [showLabels, labels.length, fetchLabels]);

  const {
    folderOrders,
    setFolderOrders,
    smartFiltersExpanded,
    setSmartFiltersExpanded,
    labelsExpanded,
    setLabelsExpanded,
  } = useEmailSidebarPreferences();

  // Track which providers are expanded
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    // Auto-expand all providers by default
    return new Set(folderGroups.map((g) => g.providerId));
  });

  // Listen for folder reorder drag events from parent DndContext
  useDndMonitor({
    onDragEnd: (event) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      // Only handle folder reordering (type: 'folder-reorder')
      if (active.data.current?.type !== 'folder-reorder') return;

      // Get folder IDs (useSortable uses folder.id directly)
      const activeFolderId = active.id.toString();
      const overFolderId = over.id.toString().replace('droppable-', '');

      // Find which provider group these folders belong to
      const providerGroup = folderGroups.find((g) =>
        g.folders.some((f) => f.id === activeFolderId)
      );

      if (!providerGroup) return;

      // Get current order for this provider
      const currentOrder = folderOrders[providerGroup.providerId] || providerGroup.folders.map((f) => f.id);

      // Find indexes
      const activeIndex = currentOrder.indexOf(activeFolderId);
      const overIndex = currentOrder.indexOf(overFolderId);

      if (activeIndex === -1 || overIndex === -1) return;

      // Use arrayMove utility from @dnd-kit/sortable for cleaner reordering
      const newOrder = arrayMove(currentOrder, activeIndex, overIndex);

      // Update state
      setFolderOrders((prev) => ({
        ...prev,
        [providerGroup.providerId]: newOrder,
      }));

    },
  });

  // Default compose handler - uses query param if onCompose not provided
  const handleCompose = () => {
    if (onCompose) {
      onCompose();
    } else {
      router.push('/dashboard/email?compose=new');
    }
  };

  // Toggle provider expansion
  const toggleProvider = (providerId: string) => {
    const newExpanded = new Set(expandedProviders);
    if (expandedProviders.has(providerId)) {
      newExpanded.delete(providerId);
    } else {
      newExpanded.add(providerId);
    }
    setExpandedProviders(newExpanded);
  };

  // Get live count for a folder
  const getFolderCount = (folderId: string, providerId?: string): number | undefined => {
    // If providerId is provided, use it to construct the composite key
    // The store saves counts with key: `${providerId}:${folderId}`
    const key = providerId ? `${providerId}:${folderId}` : folderId;
    const liveCounts = countsByFolderId[key];
    return liveCounts?.unreadCount;
  };

  // Apply custom folder order for a provider
  const getSortedFolders = (group: FolderGroup): FolderItem[] => {
    const savedOrder = folderOrders[group.providerId];

    // If no custom order, return original
    if (!savedOrder || savedOrder.length === 0) {
      return group.folders;
    }

    // Sort folders according to saved order
    const sorted = [...group.folders].sort((a, b) => {
      const aIndex = savedOrder.indexOf(a.id);
      const bIndex = savedOrder.indexOf(b.id);

      // If both are in saved order, sort by their saved positions
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // If only a is in saved order, it comes first
      if (aIndex !== -1) return -1;

      // If only b is in saved order, it comes first
      if (bIndex !== -1) return 1;

      // Neither in saved order, maintain original order
      return 0;
    });

    return sorted;
  };

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        p: 0,
      }}
    >
      {/* Compose Button */}
      {showComposeButton && (
        <Box
          sx={{
            p: 2,
            flexShrink: 0,
            minHeight: 60,
            display: 'flex',
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={<Mail size={20} />}
            onClick={handleCompose}
            sx={{
              minHeight: 48,
              height: 48,
              display: 'flex !important',
              py: 1.5,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            {t.common.compose}
          </Button>
        </Box>
      )}

      {/* Smart Filters */}
      {showSmartFilters && smartFilters.length > 0 && (
        <>
          <Accordion
            expanded={smartFiltersExpanded}
            onChange={() => setSmartFiltersExpanded(!smartFiltersExpanded)}
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
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Filter size={14} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, textTransform: 'uppercase' }}
                >
                  {t.email.quickFilters.title}
                </Typography>
              </Stack>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
              <List sx={{ px: 1, pb: 1 }}>
                {smartFilters.map((filter) => {
                  const isSelected = selectedFolderId === filter.id;
                  return (
                    <ListItemButton
                      key={filter.id}
                      selected={isSelected}
                      onClick={() => onFolderSelect(filter.id)}
                      sx={{
                        borderRadius: 1.5,
                        mb: 0.25,
                        mx: 0.5,
                        py: { xs: 1, sm: 0.75 },
                        px: 1.5,
                        minHeight: { xs: 44, sm: 36 },
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 32,
                          color: filter.color || 'inherit',
                        }}
                      >
                        {filter.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={filter.label}
                        primaryTypographyProps={{
                          fontSize: '0.8125rem',
                          fontWeight: isSelected ? 600 : 500,
                        }}
                      />
                      {filter.count != null && filter.count > 0 && (
                        <Chip
                          label={filter.count}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}
                        />
                      )}
                    </ListItemButton>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>

          <Divider sx={{ mx: 2, mb: 1 }} />
        </>
      )}

      {/* Labels Section */}
      {showLabels && (
        <>
          <Accordion
            expanded={labelsExpanded}
            onChange={() => setLabelsExpanded(!labelsExpanded)}
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
                <Tag size={14} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, textTransform: 'uppercase' }}
                >
                  Labels
                </Typography>
                <Box sx={{ flex: 1 }} />
                {onManageLabels && (
                  <Box
                    component="span"
                    role="button"
                    tabIndex={0}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onManageLabels();
                    }}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        onManageLabels();
                      }
                    }}
                    sx={{
                      width: 28,
                      height: 28,
                      mr: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <Settings size={14} />
                  </Box>
                )}
              </Stack>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
              <List sx={{ px: 1, pb: 1 }}>
                {labelsLoading ? (
                  <Box sx={{ px: 2, py: 1 }}>
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="50%" />
                  </Box>
                ) : labels.length === 0 ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 3, py: 1, display: 'block' }}
                  >
                    No labels yet
                  </Typography>
                ) : (
                  labels.slice(0, 10).map((label) => {
                    const labelId = `label:${label.id}`;
                    const isSelected = selectedFolderId === labelId;
                    return (
                      <ListItemButton
                        key={label.id}
                        selected={isSelected}
                        onClick={() => onFolderSelect(labelId)}
                        sx={{
                          borderRadius: 1.5,
                          mb: 0.25,
                          mx: 0.5,
                          py: 0.75,
                          px: 1.5,
                          minHeight: 36,
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 32,
                          }}
                        >
                          <Tag size={16} color={labelColorToHex(label.color)} />
                        </ListItemIcon>
                        <Chip
                          label={label.name}
                          size="small"
                          sx={{
                            bgcolor: labelColorToHex(label.color),
                            color: '#fff',
                            fontWeight: 500,
                            fontSize: '0.7rem',
                            height: 18,
                          }}
                        />
                        <Box sx={{ flex: 1 }} />
                      </ListItemButton>
                    );
                  })
                )}
                {labels.length > 10 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 3, py: 0.5, display: 'block' }}
                  >
                    +{labels.length - 10} more
                  </Typography>
                )}
              </List>
            </AccordionDetails>
          </Accordion>

          <Divider sx={{ mx: 2, mb: 1 }} />
        </>
      )}

      {/* Folders List */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          // Scrollbar per Firefox
          scrollbarWidth: 'thin',
          scrollbarColor: '#bdbdbd transparent',
          // Scrollbar per Chrome, Safari, Edge
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: '#bdbdbd',
            borderRadius: '4px',
            '&:hover': {
              bgcolor: '#9e9e9e',
            },
          },
        }}
      >
        <List sx={{ px: 1, pb: 1 }}>
          {loading ? (
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
        ) : folderGroups.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {t.email.noProviders}
            </Typography>
          </Box>
        ) : (
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
                    sx={{ fontWeight: 600, textTransform: 'uppercase' }}
                  >
                    {group.providerEmail}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title={t.folders?.createFolder || 'Create Folder'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateFolderForProvider(group.providerId, group.providerEmail);
                      }}
                      sx={{
                        width: 24,
                        height: 24,
                        mr: 0.5,
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      <FolderPlus size={14} />
                    </IconButton>
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
                      const displayCount = getFolderCount(folder.id, folder.providerId) ?? folder.count;
                      const isSelected = selectedFolderId === folder.id;

                      return (
                        <DroppableFolderItem
                          key={folder.id}
                          folder={folder}
                          isSelected={isSelected}
                          count={displayCount}
                          onSelect={() => onFolderSelect(folder.id)}
                          isEmailDragging={isEmailDragging}
                          onContextMenu={handleFolderContextMenu}
                        />
                      );
                    })}
                  </List>
                </SortableContext>
              </AccordionDetails>
            </Accordion>
          ))}
          </>
        )}
        </List>
      </Box>

      {/* Folder Context Menu */}
      <FolderContextMenu
        anchorEl={contextMenuAnchor}
        folder={contextFolder}
        providerId={contextProviderId}
        providerEmail={contextProviderEmail}
        onClose={handleContextMenuClose}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
      />

      {/* Folder Management Dialog */}
      <FolderManagementDialog
        open={dialogOpen}
        mode={dialogMode}
        folder={dialogFolder}
        providerId={dialogProviderId}
        providerEmail={dialogProviderEmail}
        parentPath={dialogParentPath}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
      />
    </Paper>
  );
};
