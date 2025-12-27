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
} from '@mui/material';
import { Inbox, Send, Archive, Trash2, Folder, Mail } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface FolderSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (folder: string) => void;
  selectedCount: number;
}

/**
 * FolderSelectorDialog - Dialog for selecting a folder to move emails to
 *
 * Features:
 * - Lists common email folders with translations
 * - Single selection
 */
export const FolderSelectorDialog: React.FC<FolderSelectorDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedCount,
}) => {
  const t = useTranslations();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Build folders list with translations
  const commonFolders = useMemo(() => [
    { id: 'INBOX', name: t.folders.inbox, icon: <Inbox size={20} /> },
    { id: 'SENT', name: t.folders.sent, icon: <Send size={20} /> },
    { id: 'ARCHIVE', name: t.folders.archive, icon: <Archive size={20} /> },
    { id: 'TRASH', name: t.folders.trash, icon: <Trash2 size={20} /> },
    { id: 'DRAFTS', name: t.folders.drafts, icon: <Mail size={20} /> },
    { id: 'SPAM', name: t.folders.spam, icon: <Folder size={20} /> },
  ], [t]);

  const handleSelect = (folderId: string) => {
    setSelectedFolder(folderId);
  };

  const handleApply = () => {
    if (selectedFolder) {
      onSelect(selectedFolder);
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
        <List>
          {commonFolders.map((folder) => (
            <ListItem key={folder.id} disablePadding>
              <ListItemButton
                selected={selectedFolder === folder.id}
                onClick={() => handleSelect(folder.id)}
              >
                <ListItemIcon>{folder.icon}</ListItemIcon>
                <ListItemText primary={folder.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.common.cancel}</Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={!selectedFolder}
        >
          {t.email.messages.move}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
