/**
 * Mobile Folder Sheet Component
 *
 * Bottom sheet drawer for folder selection on mobile.
 * Shows aggregated folders and provider-specific folders.
 *
 * Design: Follows Material Design 3 bottom sheet patterns
 * @see https://m3.material.io/components/bottom-sheets
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Divider,
  IconButton,
  Collapse,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Flag,
  User,
  ChevronDown,
  ChevronRight,
  X,
  Tag,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders, useLabels } from '@/hooks/queries';
import { useEmailUIStore, type SpecialFolder } from '@/stores/email-ui-store';
import { LabelDialog } from '../labels/LabelDialog';
import { LabelContextMenu } from '../labels/LabelContextMenu';
import {
  FolderDialog,
  FolderContextMenu,
  useFolderManagement,
  FOLDER_ORDER,
  getSpecialFolderIcon,
  getFolderIcon,
} from '../folders';
import type { Provider } from '@/lib/api/folders';
import type { Label } from '@/lib/api/labels';

interface MobileFolderSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (folder: SpecialFolder, providerId?: string, folderId?: string) => void;
}

export function MobileFolderSheet({ open, onClose, onSelect }: MobileFolderSheetProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { data } = useFolders();
  const { data: labels } = useLabels();

  const filters = useEmailUIStore((state) => state.filters);
  const setFilters = useEmailUIStore((state) => state.setFilters);
  const collapsedProviders = useEmailUIStore((state) => state.sidebar.collapsedProviders);
  const toggleProviderCollapse = useEmailUIStore((state) => state.toggleProviderCollapse);

  // Labels section state
  const [labelsExpanded, setLabelsExpanded] = useState(true);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);

  // Label context menu state
  const [labelMenuAnchor, setLabelMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

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

  // Filter to show only USER labels
  const userLabels = useMemo(() =>
    labels?.filter((l) => l.type === 'USER') || [],
    [labels]
  );

  // Handle label selection
  const handleLabelClick = useCallback((labelId: string) => {
    setFilters({
      labelId,
      providerId: undefined,
      folderId: undefined,
      specialUse: undefined,
    });
    onClose();
  }, [setFilters, onClose]);

  // Handle label context menu
  const handleLabelMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, label: Label) => {
      event.preventDefault();
      event.stopPropagation();
      setLabelMenuAnchor(event.currentTarget);
      setSelectedLabel(label);
    },
    []
  );

  const handleLabelMenuClose = useCallback(() => {
    setLabelMenuAnchor(null);
  }, []);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '85vh',
          // Safe area for notched phones
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
      }}
    >
      {/* Handle bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          pt: 1,
          pb: 0.5,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'action.disabled',
          }}
        />
      </Box>

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          {t.folders?.title || 'Cartelle'}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <X size={20} />
        </IconButton>
      </Box>

      <Divider />

      {/* Folder List */}
      <Box sx={{ overflow: 'auto', maxHeight: 'calc(85vh - 80px)' }}>
        {/* Aggregated Folders */}
        <List disablePadding sx={{ px: 1, pt: 1 }}>
          {FOLDER_ORDER.map((folder) => {
            const count = folderCounts[folder];
            const isSelected = filters.specialUse === folder && !filters.providerId;

            return (
              <ListItemButton
                key={folder}
                selected={isSelected}
                onClick={() => onSelect(folder)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  minHeight: 48,
                  '&.Mui-selected': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {count && count > 0 ? (
                    <Badge
                      badgeContent={count > 99 ? '99+' : count}
                      color="primary"
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.65rem',
                          height: 16,
                          minWidth: 16,
                        },
                      }}
                    >
                      {getSpecialFolderIcon(folder, 20)}
                    </Badge>
                  ) : (
                    getSpecialFolderIcon(folder, 20)
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={getFolderLabel(folder)}
                  slotProps={{
                    primary: {
                      fontWeight: isSelected ? 600 : 400,
                    },
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>

        {/* Quick Filters */}
        <Divider sx={{ my: 1 }} />
        <List disablePadding sx={{ px: 1 }}>
          <ListItemButton
            selected={filters.isImportant === true}
            onClick={() => {
              // Toggle important filter
              setFilters({
                isImportant: filters.isImportant ? undefined : true,
              });
              onClose();
            }}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              minHeight: 48,
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Flag size={20} />
            </ListItemIcon>
            <ListItemText primary={t.email?.quickFilters?.important || 'Importanti'} />
          </ListItemButton>
        </List>

        {/* Labels Section */}
        <Divider sx={{ my: 1 }} />
        <Box sx={{ px: 1 }}>
          {/* Labels Header */}
          <ListItemButton
            onClick={() => setLabelsExpanded((prev) => !prev)}
            sx={{
              borderRadius: 2,
              minHeight: 44,
              py: 0.5,
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Tag size={18} />
            </ListItemIcon>
            <ListItemText
              primary={t.email?.labels?.title || 'Etichette'}
              slotProps={{
                primary: {
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.5,
                },
              }}
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setLabelDialogOpen(true);
              }}
              sx={{ mr: 0.5 }}
            >
              <Plus size={16} />
            </IconButton>
            {labelsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </ListItemButton>

          {/* Labels List */}
          <Collapse in={labelsExpanded} timeout="auto" unmountOnExit>
            <List disablePadding sx={{ pl: 2 }}>
              {userLabels.length === 0 ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ px: 2, py: 1, display: 'block' }}
                >
                  {t.email?.labels?.noLabels || 'Nessuna etichetta'}
                </Typography>
              ) : (
                userLabels.map((label) => {
                  const isSelected = filters.labelId === label.id;
                  return (
                    <ListItemButton
                      key={label.id}
                      selected={isSelected}
                      onClick={() => handleLabelClick(label.id)}
                      sx={{
                        borderRadius: 2,
                        minHeight: 40,
                        py: 0.25,
                        '&.Mui-selected': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Tag
                          size={16}
                          color={label.color?.backgroundColor || '#9e9e9e'}
                          fill={label.color?.backgroundColor || '#9e9e9e'}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={label.name}
                        slotProps={{
                          primary: {
                            fontSize: '0.8125rem',
                            noWrap: true,
                            fontWeight: isSelected ? 500 : 400,
                          },
                        }}
                      />
                      {label._count?.emailLabels !== undefined &&
                        label._count.emailLabels > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mr: 0.5 }}
                          >
                            {label._count.emailLabels}
                          </Typography>
                        )}
                      <IconButton
                        size="small"
                        onClick={(e) => handleLabelMenu(e, label)}
                        sx={{ p: 0.5 }}
                      >
                        <MoreHorizontal size={14} />
                      </IconButton>
                    </ListItemButton>
                  );
                })
              )}
            </List>
          </Collapse>
        </Box>

        {/* Provider Sections */}
        {data?.providers && data.providers.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                px: 2,
                py: 0.5,
                display: 'block',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t.email?.accounts || 'Account'}
            </Typography>

            {data.providers.map((provider: Provider) => {
              const providerFolders = data.foldersByProvider[provider.id] || [];
              const isCollapsed = collapsedProviders.has(provider.id);

              return (
                <Box key={provider.id} sx={{ px: 1 }}>
                  {/* Provider Header */}
                  <ListItemButton
                    onClick={() => toggleProviderCollapse(provider.id)}
                    sx={{
                      borderRadius: 2,
                      minHeight: 44,
                      py: 0.5,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <User size={18} />
                    </ListItemIcon>
                    <ListItemText
                      primary={provider.displayName || provider.email}
                      slotProps={{
                        primary: {
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          noWrap: true,
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateFolder(provider.id);
                      }}
                      sx={{ mr: 0.5 }}
                      title={t.folders?.createFolder || 'Create folder'}
                    >
                      <Plus size={16} />
                    </IconButton>
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </ListItemButton>

                  {/* Provider Folders */}
                  <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
                    <List disablePadding sx={{ pl: 2 }}>
                      {providerFolders.map((folder) => {
                        // For system folders, translate specialUse. For custom folders, use name directly.
                        const folderName = folder.isSystem && folder.specialUse
                          ? getFolderLabel(folder.specialUse)
                          : folder.name;
                        const isSelected = filters.folderId === folder.id;

                        return (
                          <ListItemButton
                            key={folder.id}
                            selected={isSelected}
                            onClick={() =>
                              onSelect(
                                (folder.specialUse?.toUpperCase() as SpecialFolder) || 'INBOX',
                                provider.id,
                                folder.id
                              )
                            }
                            sx={{
                              borderRadius: 2,
                              minHeight: 40,
                              py: 0.25,
                              '&.Mui-selected': {
                                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              {(folder.unreadCount ?? 0) > 0 ? (
                                <Badge
                                  badgeContent={folder.unreadCount > 99 ? '99+' : folder.unreadCount}
                                  color="primary"
                                  sx={{
                                    '& .MuiBadge-badge': {
                                      fontSize: '0.6rem',
                                      height: 14,
                                      minWidth: 14,
                                    },
                                  }}
                                >
                                  {getFolderIcon(folder, 20)}
                                </Badge>
                              ) : (
                                getFolderIcon(folder, 20)
                              )}
                            </ListItemIcon>
                            <ListItemText
                              primary={folderName}
                              slotProps={{
                                primary: {
                                  fontSize: '0.8125rem',
                                  noWrap: true,
                                },
                              }}
                            />
                            {/* Show menu for custom folders only (not system folders) */}
                            {!folder.isSystem && (
                              <IconButton
                                size="small"
                                onClick={(e) => handleFolderMenu(e, folder)}
                                sx={{ p: 0.5 }}
                              >
                                <MoreHorizontal size={14} />
                              </IconButton>
                            )}
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Collapse>
                </Box>
              );
            })}
          </>
        )}

        {/* Bottom padding */}
        <Box sx={{ height: 16 }} />
      </Box>

      {/* Create Label Dialog */}
      <LabelDialog
        open={labelDialogOpen}
        onClose={() => setLabelDialogOpen(false)}
      />

      {/* Label Context Menu */}
      <LabelContextMenu
        anchorEl={labelMenuAnchor}
        open={Boolean(labelMenuAnchor)}
        onClose={handleLabelMenuClose}
        label={selectedLabel}
      />

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
    </Drawer>
  );
}

export default MobileFolderSheet;
