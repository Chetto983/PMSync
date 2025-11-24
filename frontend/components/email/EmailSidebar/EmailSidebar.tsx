import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Mail,
  ChevronDown,
  Filter,
  Tag,
  Settings,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { useRouter } from 'next/router';
import { useFoldersStore } from '@/stores/folders-store';
import { useLabelStore } from '@/stores/label-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { labelColorToHex } from '@/lib/api/labels';

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
}

/**
 * Draggable & Droppable Folder Item Component
 */
interface DroppableFolderItemProps {
  folder: FolderItem;
  isSelected: boolean;
  count: number | undefined;
  onSelect: () => void;
}

const DroppableFolderItem: React.FC<DroppableFolderItemProps> = ({
  folder,
  isSelected,
  count,
  onSelect,
}) => {
  // Make it droppable (for dropping emails into folder)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${folder.id}`,
    data: {
      type: 'folder',
      folder,
    },
  });

  // Make it draggable (for reordering folders)
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `draggable-${folder.id}`,
    data: {
      type: 'folder-reorder',
      folder,
    },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <ListItemButton
      ref={(node) => {
        setDroppableRef(node);
        setDraggableRef(node);
      }}
      selected={isSelected}
      onClick={onSelect}
      sx={{
        borderRadius: 1.5,
        mb: 0.25,
        mx: 0.5,
        py: 0.75,
        px: 1.5,
        bgcolor: isOver ? 'action.hover' : 'transparent',
        borderLeft: isOver ? 4 : 0,
        borderColor: isOver ? 'primary.main' : 'transparent',
        transition: 'all 0.2s ease',
        minHeight: 36,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        ...style,
      }}
      {...attributes}
      {...listeners}
    >
      <ListItemIcon
        sx={{
          minWidth: 32,
          color: folder.color || 'inherit',
        }}
      >
        {folder.icon}
      </ListItemIcon>
      <ListItemText
        primary={folder.label}
        primaryTypographyProps={{
          fontSize: '0.8125rem',
          fontWeight: isSelected ? 600 : 500,
        }}
      />
      {count != null && count > 0 && (
        <Chip
          label={count}
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
};

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
}) => {
  const router = useRouter();
  const t = useTranslations();
  const countsByFolderId = useFoldersStore((state) => state.countsByFolderId);
  // Use explicit selectors for better re-render reliability
  const labels = useLabelStore((state) => state.labels);
  const fetchLabels = useLabelStore((state) => state.fetchLabels);
  const labelsLoading = useLabelStore((state) => state.isLoading);

  // Debug: Track label changes
  useEffect(() => {
    console.log('[EmailSidebar] Labels changed:', labels.length, labels);
  }, [labels]);

  // Load labels on mount
  useEffect(() => {
    if (showLabels && labels.length === 0) {
      fetchLabels();
    }
  }, [showLabels, labels.length, fetchLabels]);

  // Track which providers are expanded
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    // Auto-expand all providers by default
    return new Set(folderGroups.map((g) => g.providerId));
  });

  // Track which sections are expanded (Smart Filters, Labels)
  const [smartFiltersExpanded, setSmartFiltersExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebar-smart-filters-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [labelsExpanded, setLabelsExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebar-labels-expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Save expansion states to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-smart-filters-expanded', JSON.stringify(smartFiltersExpanded));
  }, [smartFiltersExpanded]);

  useEffect(() => {
    localStorage.setItem('sidebar-labels-expanded', JSON.stringify(labelsExpanded));
  }, [labelsExpanded]);

  // Default compose handler
  const handleCompose = () => {
    if (onCompose) {
      onCompose();
    } else {
      router.push('/dashboard/email/compose');
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

  // Setup drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before dragging starts
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag end for folder reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Only handle folder reordering (not email dropping)
    if (active.data.current?.type !== 'folder-reorder') return;

    console.log('[EmailSidebar] Folder reordered:', { from: active.id, to: over.id });
    // TODO: Implement folder reordering logic
    // This would require storing custom folder order in state/localStorage
  };

  // Get live count for a folder
  const getFolderCount = (folderId: string, providerId?: string): number | undefined => {
    // If providerId is provided, use it to construct the composite key
    // The store saves counts with key: `${providerId}:${folderId}`
    const key = providerId ? `${providerId}:${folderId}` : folderId;
    const liveCounts = countsByFolderId[key];
    return liveCounts?.unreadCount;
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
                  {t.dashboard.email.quickFilters.title}
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
                        py: 0.75,
                        px: 1.5,
                        minHeight: 36,
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
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onManageLabels();
                    }}
                    sx={{
                      width: 28,
                      height: 28,
                      mr: 1,
                    }}
                  >
                    <Settings size={14} />
                  </IconButton>
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
              {t.dashboard.email.noProviders}
            </Typography>
          </Box>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, textTransform: 'uppercase' }}
                >
                  {group.providerEmail}
                </Typography>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 0 }}>
                <List sx={{ py: 0 }}>
                  {group.folders.map((folder) => {
                    const displayCount = getFolderCount(folder.id, folder.providerId) ?? folder.count;
                    const isSelected = selectedFolderId === folder.id;

                    return (
                      <DroppableFolderItem
                        key={folder.id}
                        folder={folder}
                        isSelected={isSelected}
                        count={displayCount}
                        onSelect={() => onFolderSelect(folder.id)}
                      />
                    );
                  })}
                </List>
              </AccordionDetails>
            </Accordion>
          ))}
          </DndContext>
        )}
        </List>
      </Box>
    </Paper>
  );
};
