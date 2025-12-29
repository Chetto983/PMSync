import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import { Inbox, Send, Archive, Trash2, Folder, FileEdit, Star, AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { FolderItem } from '@/lib/api/folders';

interface FolderSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (folder: string) => void;
  selectedCount: number;
  /** Actual folders from the user's email providers */
  folders?: FolderItem[];
  /** Current provider ID for filtering folders (optional) */
  currentProviderId?: string;
}

/**
 * Get icon for folder based on specialUse type
 */
function getFolderIcon(specialUse?: string) {
  const type = specialUse?.toUpperCase();
  switch (type) {
    case 'INBOX':
      return <Inbox size={20} />;
    case 'SENT':
      return <Send size={20} />;
    case 'ARCHIVE':
      return <Archive size={20} />;
    case 'TRASH':
      return <Trash2 size={20} />;
    case 'DRAFTS':
      return <FileEdit size={20} />;
    case 'SPAM':
    case 'JUNK':
      return <AlertTriangle size={20} />;
    case 'STARRED':
    case 'IMPORTANT':
      return <Star size={20} />;
    default:
      return <Folder size={20} />;
  }
}

/**
 * FolderSelectorDialog - Dialog for selecting a folder to move emails to
 *
 * Features:
 * - Uses actual folders from user's email providers when available
 * - Falls back to common RFC 6154 folders if no folders provided
 * - Groups folders by provider if multiple providers exist
 * - Single selection with apply button
 */
export const FolderSelectorDialog: React.FC<FolderSelectorDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedCount,
  folders,
  currentProviderId,
}) => {
  const t = useTranslations();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Filter and organize folders
  const displayFolders = useMemo(() => {
    // If we have actual folders from providers, use them
    if (folders && folders.length > 0) {
      // Filter to only show relevant folders for moving
      // Exclude smart filters (smart:*) and aggregate folders (all:*)
      return folders.filter((folder) => {
        // Skip smart filters and aggregates
        if (folder.id.startsWith('smart:') || folder.id.startsWith('all:')) {
          return false;
        }
        // Skip label folders for move operation
        if (folder.id.startsWith('label:')) {
          return false;
        }
        // If currentProviderId is set, only show folders from that provider
        if (currentProviderId && folder.providerId && folder.providerId !== currentProviderId) {
          return false;
        }
        return true;
      });
    }

    // Fallback: common RFC 6154 folders with translations
    return [
      { id: 'INBOX', label: t.folders.inbox, specialUse: 'INBOX' },
      { id: 'SENT', label: t.folders.sent, specialUse: 'SENT' },
      { id: 'ARCHIVE', label: t.folders.archive, specialUse: 'ARCHIVE' },
      { id: 'TRASH', label: t.folders.trash, specialUse: 'TRASH' },
      { id: 'DRAFTS', label: t.folders.drafts, specialUse: 'DRAFTS' },
    ] as FolderItem[];
  }, [folders, currentProviderId, t]);

  // Group folders by provider if multiple providers exist
  const foldersByProvider = useMemo(() => {
    const providers = new Map<string, FolderItem[]>();

    displayFolders.forEach((folder) => {
      const providerId = folder.providerId || 'default';
      if (!providers.has(providerId)) {
        providers.set(providerId, []);
      }
      providers.get(providerId)!.push(folder);
    });

    return providers;
  }, [displayFolders]);

  const hasMultipleProviders = foldersByProvider.size > 1;

  const handleSelect = (folderId: string) => {
    setSelectedFolder(folderId);
  };

  const handleApply = () => {
    if (selectedFolder) {
      // Find the selected folder to get its specialUse for the move operation
      const folder = displayFolders.find((f) => f.id === selectedFolder);
      // Use specialUse (canonical folder type) if available, otherwise use the folder ID
      const folderValue = folder?.specialUse || folder?.path || selectedFolder;
      onSelect(folderValue);
      onClose();
      setSelectedFolder(null);
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedFolder(null);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t.email.bulkBar.moveToFolder} ({t.email.messages.selectedCount.replace('{count}', selectedCount.toString())})
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {hasMultipleProviders ? (
          // Show folders grouped by provider
          Array.from(foldersByProvider.entries()).map(([providerId, providerFolders], index) => {
            const firstFolder = providerFolders[0];
            const providerLabel = firstFolder?.providerEmail || providerId;

            return (
              <Box key={providerId}>
                {index > 0 && <Divider />}
                <Typography
                  variant="caption"
                  sx={{ px: 2, py: 1, display: 'block', color: 'text.secondary', fontWeight: 500 }}
                >
                  {providerLabel}
                </Typography>
                <List dense disablePadding>
                  {providerFolders.map((folder) => (
                    <ListItem key={folder.id} disablePadding>
                      <ListItemButton
                        selected={selectedFolder === folder.id}
                        onClick={() => handleSelect(folder.id)}
                      >
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          {folder.icon || getFolderIcon(folder.specialUse)}
                        </ListItemIcon>
                        <ListItemText primary={folder.label} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Box>
            );
          })
        ) : (
          // Single provider or fallback - show simple list
          <List>
            {displayFolders.map((folder) => (
              <ListItem key={folder.id} disablePadding>
                <ListItemButton
                  selected={selectedFolder === folder.id}
                  onClick={() => handleSelect(folder.id)}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {folder.icon || getFolderIcon(folder.specialUse)}
                  </ListItemIcon>
                  <ListItemText primary={folder.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.common.cancel}</Button>
        <Button onClick={handleApply} variant="contained" disabled={!selectedFolder}>
          {t.email.messages.move}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
