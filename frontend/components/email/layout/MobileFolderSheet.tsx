/**
 * Mobile Folder Sheet Component
 *
 * Bottom sheet drawer for folder selection on mobile.
 * Shows aggregated folders and provider-specific folders.
 *
 * Design: Follows Material Design 3 bottom sheet patterns
 * @see https://m3.material.io/components/bottom-sheets
 */

import React, { useMemo, useCallback } from 'react';
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
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Mail,
  Flag,
  Folder,
  User,
  ChevronDown,
  ChevronRight,
  X,
  Star,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders } from '@/hooks/queries/use-folders';
import { useEmailUIStore, type SpecialFolder } from '@/stores/email-ui-store';
import type { Folder as FolderType, Provider } from '@/lib/api/folders';

interface MobileFolderSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (folder: SpecialFolder, providerId?: string, folderId?: string) => void;
}

// Folder icons mapping
const FOLDER_ICONS: Record<string, React.ReactNode> = {
  INBOX: <Inbox size={20} />,
  SENT: <Send size={20} />,
  DRAFTS: <FileText size={20} />,
  TRASH: <Trash2 size={20} />,
  SPAM: <AlertOctagon size={20} />,
  JUNK: <AlertOctagon size={20} />,
  ARCHIVE: <Archive size={20} />,
  ALL: <Mail size={20} />,
  STARRED: <Star size={20} />,
  FLAGGED: <Flag size={20} />,
  IMPORTANT: <Flag size={20} />,
};

// Main folder order
const FOLDER_ORDER: SpecialFolder[] = [
  'INBOX',
  'SENT',
  'DRAFTS',
  'ARCHIVE',
  'SPAM',
  'TRASH',
  'ALL',
];

export function MobileFolderSheet({ open, onClose, onSelect }: MobileFolderSheetProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { data } = useFolders();

  const filters = useEmailUIStore((state) => state.filters);
  const collapsedProviders = useEmailUIStore((state) => state.sidebar.collapsedProviders);
  const toggleProviderCollapse = useEmailUIStore((state) => state.toggleProviderCollapse);

  // Get folder label from translations
  const getFolderLabel = useCallback((folder: string): string => {
    const upperFolder = folder.toUpperCase();
    const labels: Record<string, string> = {
      INBOX: t.folders.inbox,
      SENT: t.folders.sent,
      DRAFTS: t.folders.drafts,
      TRASH: t.folders.trash,
      SPAM: t.folders.spam,
      JUNK: t.folders.spam,
      ARCHIVE: t.folders.archive,
      ALL: t.folders.all,
      STARRED: t.folders.starred,
      FLAGGED: t.folders.starred,
      IMPORTANT: t.email?.quickFilters?.important || 'Important',
    };
    return labels[upperFolder] || folder;
  }, [t]);

  // Calculate folder counts
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

  // Get folder icon
  const getFolderIcon = (folder: FolderType): React.ReactNode => {
    if (folder.specialUse) {
      return FOLDER_ICONS[folder.specialUse.toUpperCase()] || <Folder size={20} />;
    }
    return <Folder size={20} />;
  };

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
          Cartelle
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
                      {FOLDER_ICONS[folder]}
                    </Badge>
                  ) : (
                    FOLDER_ICONS[folder]
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
              onClose();
              // Toggle important filter
              useEmailUIStore.getState().setFilters({
                isImportant: filters.isImportant ? undefined : true,
              });
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
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </ListItemButton>

                  {/* Provider Folders */}
                  <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
                    <List disablePadding sx={{ pl: 2 }}>
                      {providerFolders.map((folder) => {
                        const folderName = folder.specialUse
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
                                  {getFolderIcon(folder)}
                                </Badge>
                              ) : (
                                getFolderIcon(folder)
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
    </Drawer>
  );
}

export default MobileFolderSheet;
