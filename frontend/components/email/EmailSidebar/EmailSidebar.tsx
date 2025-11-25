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
import { debounce } from 'lodash-es';
import { useRouter } from 'next/router';
import { useFoldersStore } from '@/stores/folders-store';
import { useLabelStore } from '@/stores/label-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { labelColorToHex } from '@/lib/api/labels';
import { usersApi } from '@/lib/api/users';

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

  /**
   * Whether an email is currently being dragged (for drop zone visuals)
   */
  isEmailDragging?: boolean;

  /**
   * Callback when email is dropped on a folder
   */
  onEmailDropToFolder?: (emailIds: string[], folderId: string, folderName: string) => void;
}

/**
 * Draggable & Droppable Folder Item Component
 */
interface DroppableFolderItemProps {
  folder: FolderItem;
  isSelected: boolean;
  count: number | undefined;
  onSelect: () => void;
  /** Whether an email is currently being dragged (for visual hints) */
  isEmailDragging?: boolean;
}

const DroppableFolderItem: React.FC<DroppableFolderItemProps> = ({
  folder,
  isSelected,
  count,
  onSelect,
  isEmailDragging = false,
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

  // Determine visual state based on drag context
  const isValidDropTarget = isEmailDragging && !isDragging;
  const isActiveDropTarget = isOver && isValidDropTarget;

  return (
    <ListItemButton
      ref={(node) => {
        setDroppableRef(node);
        setDraggableRef(node);
      }}
      selected={isSelected}
      onClick={onSelect}
      sx={{
        borderRadius: 2,
        mb: 0.5,
        mx: 0.5,
        // EXPANDED size when dragging emails - much easier to hit
        py: isValidDropTarget ? 1.5 : 0.75,
        px: isValidDropTarget ? 2 : 1.5,
        minHeight: isValidDropTarget ? 52 : 36,
        position: 'relative',
        overflow: 'visible',
        // Base styling with enhanced active state
        bgcolor: isActiveDropTarget
          ? 'primary.main'
          : isValidDropTarget
            ? 'action.hover'
            : isOver
              ? 'action.hover'
              : 'transparent',
        // Enhanced border for drop target - thicker and more visible
        border: isActiveDropTarget
          ? '2px solid'
          : isValidDropTarget
            ? '2px dashed'
            : '2px solid transparent',
        borderColor: isActiveDropTarget
          ? 'primary.main'
          : isValidDropTarget
            ? 'primary.light'
            : 'transparent',
        // Glow effect when actively hovering
        '&::before': isActiveDropTarget ? {
          content: '""',
          position: 'absolute',
          inset: -4,
          borderRadius: 3,
          background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.15) 0%, rgba(25, 118, 210, 0.05) 100%)',
          zIndex: -1,
          animation: 'glowPulse 0.8s ease-in-out infinite',
        } : {},
        // Magnetic snap indicator
        '&::after': isActiveDropTarget ? {
          content: '"Drop here"',
          position: 'absolute',
          top: '50%',
          right: 12,
          transform: 'translateY(-50%)',
          fontSize: '0.7rem',
          fontWeight: 700,
          color: 'white',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          opacity: 0.9,
        } : {},
        // Smooth spring-like transitions
        transition: isValidDropTarget
          ? 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
          : 'all 0.2s ease-out',
        // Visual states
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : isValidDropTarget ? 'copy' : 'grab',
        // Breathe animation for valid drop targets
        ...(isValidDropTarget && !isActiveDropTarget && {
          animation: 'breathe 1.5s ease-in-out infinite',
        }),
        // Scale up when actively hovering - magnetic effect
        transform: isActiveDropTarget
          ? 'scale(1.05) translateX(4px)'
          : isValidDropTarget
            ? 'scale(1.02)'
            : undefined,
        // Enhanced shadow for depth
        boxShadow: isActiveDropTarget
          ? '0 8px 24px rgba(25, 118, 210, 0.35), 0 0 0 3px rgba(25, 118, 210, 0.2)'
          : isValidDropTarget
            ? '0 2px 8px rgba(0, 0, 0, 0.08)'
            : 'none',
        // Z-index to pop above siblings
        zIndex: isActiveDropTarget ? 10 : isValidDropTarget ? 5 : 'auto',
        // Animations
        '@keyframes breathe': {
          '0%, 100%': {
            borderColor: 'rgba(25, 118, 210, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          },
          '50%': {
            borderColor: 'rgba(25, 118, 210, 0.5)',
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)',
          },
        },
        '@keyframes glowPulse': {
          '0%, 100%': {
            opacity: 0.8,
            transform: 'scale(1)',
          },
          '50%': {
            opacity: 1,
            transform: 'scale(1.02)',
          },
        },
        ...style,
      }}
      {...attributes}
      {...listeners}
    >
      <ListItemIcon
        sx={{
          minWidth: isValidDropTarget ? 36 : 32,
          color: isActiveDropTarget
            ? 'white'
            : isValidDropTarget
              ? 'primary.main'
              : folder.color || 'inherit',
          transition: 'all 0.2s ease',
          // Icon bounce on active
          transform: isActiveDropTarget ? 'scale(1.2)' : 'scale(1)',
        }}
      >
        {folder.icon}
      </ListItemIcon>
      <ListItemText
        primary={folder.label}
        primaryTypographyProps={{
          fontSize: isValidDropTarget ? '0.875rem' : '0.8125rem',
          fontWeight: isSelected || isActiveDropTarget ? 700 : 500,
          color: isActiveDropTarget ? 'white' : 'inherit',
        }}
        sx={{
          '& .MuiTypography-root': {
            transition: 'all 0.2s ease',
          },
        }}
      />
      {count != null && count > 0 && !isActiveDropTarget && (
        <Chip
          label={count}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.7rem',
            fontWeight: 600,
            transition: 'opacity 0.2s ease',
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
  isEmailDragging = false,
  onEmailDropToFolder: _onEmailDropToFolder,
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

  // Track custom folder order per provider
  const [folderOrders, setFolderOrders] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('sidebar-folder-orders');
    return saved !== null ? JSON.parse(saved) : {};
  });

  // Load preferences from API on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const preferences = await usersApi.getPreferences();

        // Update folder orders if available from server
        if (preferences.folderOrders) {
          setFolderOrders(preferences.folderOrders as Record<string, string[]>);
          localStorage.setItem('sidebar-folder-orders', JSON.stringify(preferences.folderOrders));
        }

        // Update other preferences
        if (preferences.sidebarSmartFiltersExpanded !== undefined) {
          setSmartFiltersExpanded(preferences.sidebarSmartFiltersExpanded);
          localStorage.setItem('sidebar-smart-filters-expanded', JSON.stringify(preferences.sidebarSmartFiltersExpanded));
        }

        if (preferences.sidebarLabelsExpanded !== undefined) {
          setLabelsExpanded(preferences.sidebarLabelsExpanded);
          localStorage.setItem('sidebar-labels-expanded', JSON.stringify(preferences.sidebarLabelsExpanded));
        }
      } catch (error) {
        console.error('[EmailSidebar] Failed to load preferences from server:', error);
        // Fall back to localStorage values already loaded in state
      }
    };

    loadPreferences();
  }, []);

  // Debounced function to save preferences to API
  const savePreferencesToAPI = useCallback(
    debounce(async (data: {
      folderOrders?: Record<string, string[]>;
      sidebarSmartFiltersExpanded?: boolean;
      sidebarLabelsExpanded?: boolean;
    }) => {
      try {
        await usersApi.updatePreferences(data);
        console.log('[EmailSidebar] Preferences saved to server');
      } catch (error) {
        console.error('[EmailSidebar] Failed to save preferences to server:', error);
      }
    }, 1000),
    []
  );

  // Save expansion states to localStorage and API
  useEffect(() => {
    localStorage.setItem('sidebar-smart-filters-expanded', JSON.stringify(smartFiltersExpanded));
    savePreferencesToAPI({ sidebarSmartFiltersExpanded: smartFiltersExpanded });
  }, [smartFiltersExpanded, savePreferencesToAPI]);

  useEffect(() => {
    localStorage.setItem('sidebar-labels-expanded', JSON.stringify(labelsExpanded));
    savePreferencesToAPI({ sidebarLabelsExpanded: labelsExpanded });
  }, [labelsExpanded, savePreferencesToAPI]);

  // Save folder orders to localStorage and API
  useEffect(() => {
    localStorage.setItem('sidebar-folder-orders', JSON.stringify(folderOrders));
    savePreferencesToAPI({ folderOrders });
  }, [folderOrders, savePreferencesToAPI]);

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

    // Extract folder IDs from draggable IDs (format: "draggable-{folderId}")
    const activeFolderId = active.id.toString().replace('draggable-', '');
    const overFolderId = over.id.toString().replace('draggable-', '').replace('droppable-', '');

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

    // Create new order by moving the active item to over position
    const newOrder = [...currentOrder];
    newOrder.splice(activeIndex, 1);
    newOrder.splice(overIndex, 0, activeFolderId);

    // Update state
    setFolderOrders({
      ...folderOrders,
      [providerGroup.providerId]: newOrder,
    });

    console.log('[EmailSidebar] Folder reordered:', {
      provider: providerGroup.providerEmail,
      from: activeFolderId,
      to: overFolderId,
      newOrder,
    });
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
