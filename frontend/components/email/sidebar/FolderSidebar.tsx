/**
 * Folder Sidebar Component
 *
 * Displays the folder navigation for the email module.
 * Uses TanStack Query for data, Zustand for UI state.
 *
 * Design: Clean TailAdmin-inspired sidebar with icons
 */

import React, { useMemo } from 'react';
import {
  Box,
  List,
  Divider,
  Typography,
  Skeleton,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Star,
  Mail,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders } from '@/hooks/queries/use-folders';
import { useEmailUIStore, type SpecialFolder } from '@/stores/email-ui-store';
import { FolderItem } from './FolderItem';

interface FolderSidebarProps {
  collapsed?: boolean;
}

// Map special folder types to icons
const FOLDER_ICONS: Record<SpecialFolder, React.ReactNode> = {
  INBOX: <Inbox size={18} />,
  SENT: <Send size={18} />,
  DRAFTS: <FileText size={18} />,
  TRASH: <Trash2 size={18} />,
  SPAM: <AlertOctagon size={18} />,
  ARCHIVE: <Archive size={18} />,
  ALL: <Mail size={18} />,
};

// Order of special folders in sidebar
const FOLDER_ORDER: SpecialFolder[] = [
  'INBOX',
  'SENT',
  'DRAFTS',
  'ARCHIVE',
  'SPAM',
  'TRASH',
  'ALL',
];

export function FolderSidebar({ collapsed = false }: FolderSidebarProps) {
  const t = useTranslations();
  const { data, isLoading, refetch, isFetching } = useFolders();

  const filters = useEmailUIStore((state) => state.filters);
  const setFolder = useEmailUIStore((state) => state.setFolder);

  // Get folder labels from translations
  const getFolderLabel = (folder: SpecialFolder): string => {
    const labels: Record<SpecialFolder, string> = {
      INBOX: t.folders.inbox,
      SENT: t.folders.sent,
      DRAFTS: t.folders.drafts,
      TRASH: t.folders.trash,
      SPAM: t.folders.spam,
      ARCHIVE: t.folders.archive,
      ALL: t.folders.all,
    };
    return labels[folder];
  };

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

  // Handle folder selection
  const handleFolderClick = (folder: SpecialFolder) => {
    setFolder(folder);
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
  };

  const sidebarWidth = collapsed ? 64 : 220;

  return (
    <Box
      sx={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        transition: 'width 0.2s ease',
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
        </Tooltip>
      </Box>

      {/* Folder List */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {isLoading ? (
          // Loading skeletons
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
          <List disablePadding>
            {FOLDER_ORDER.map((folder) => (
              <FolderItem
                key={folder}
                icon={FOLDER_ICONS[folder]}
                label={getFolderLabel(folder)}
                count={folderCounts[folder]}
                selected={filters.specialUse === folder}
                collapsed={collapsed}
                onClick={() => handleFolderClick(folder)}
              />
            ))}
          </List>
        )}

        {/* Starred - special filter */}
        <Divider sx={{ my: 1 }} />
        <List disablePadding>
          <FolderItem
            icon={<Star size={18} />}
            label={t.folders.starred}
            collapsed={collapsed}
            onClick={() => {
              // TODO: Implement starred filter
            }}
          />
        </List>
      </Box>

      {/* Provider Info (optional) */}
      {!collapsed && data?.providers && data.providers.length > 0 && (
        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {data.providers.length} {data.providers.length === 1 ? 'account' : 'accounts'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default FolderSidebar;
