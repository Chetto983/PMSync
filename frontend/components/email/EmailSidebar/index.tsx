/**
 * EmailSidebar - Sidebar component for email navigation
 *
 * Modular architecture following 2025 best practices:
 * - Extracted sections (SmartFilters, Labels, Folders)
 * - Hooks for state management
 * - Max ~300 lines per file
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
import React from 'react';
import { Box, Button, Paper, List } from '@mui/material';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';

// Hooks
import { useFolderManagement, useEmailSidebarPreferences } from './hooks';

// Components
import { SmartFiltersSection } from './SmartFiltersSection';
import { LabelsSection } from './LabelsSection';
import { FoldersList } from './FoldersList';
import { FolderContextMenu } from '../FolderContextMenu';
import { FolderManagementDialog } from '../FolderManagementDialog';

// Types
import type { EmailSidebarProps } from './types';

// Re-export types for consumers
export type { FolderItem, FolderGroup, SmartFilter, EmailSidebarProps } from './types';

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

  // Folder management hook
  const folderManagement = useFolderManagement({ onFoldersRefresh });

  // Preferences hook
  const {
    folderOrders,
    setFolderOrders,
    smartFiltersExpanded,
    setSmartFiltersExpanded,
    labelsExpanded,
    setLabelsExpanded,
  } = useEmailSidebarPreferences();

  // Default compose handler
  const handleCompose = () => {
    if (onCompose) {
      onCompose();
    } else {
      router.push('/dashboard/email?compose=new');
    }
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
            data-testid="email-compose-button"
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
      {showSmartFilters && (
        <SmartFiltersSection
          filters={smartFilters}
          selectedFolderId={selectedFolderId}
          onFolderSelect={onFolderSelect}
          expanded={smartFiltersExpanded}
          onExpandChange={setSmartFiltersExpanded}
          t={t}
        />
      )}

      {/* Labels Section */}
      {showLabels && (
        <LabelsSection
          selectedFolderId={selectedFolderId}
          onFolderSelect={onFolderSelect}
          expanded={labelsExpanded}
          onExpandChange={setLabelsExpanded}
          onManageLabels={onManageLabels}
        />
      )}

      {/* Folders List */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#bdbdbd transparent',
          '&::-webkit-scrollbar': { width: '8px' },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: '#bdbdbd',
            borderRadius: '4px',
            '&:hover': { bgcolor: '#9e9e9e' },
          },
        }}
      >
        <List sx={{ px: 1, pb: 1 }}>
          <FoldersList
            folderGroups={folderGroups}
            selectedFolderId={selectedFolderId}
            onFolderSelect={onFolderSelect}
            loading={loading}
            isEmailDragging={isEmailDragging}
            folderOrders={folderOrders}
            setFolderOrders={setFolderOrders}
            onFolderContextMenu={folderManagement.handleFolderContextMenu}
            onCreateFolderForProvider={folderManagement.handleCreateFolderForProvider}
            t={t}
          />
        </List>
      </Box>

      {/* Folder Context Menu */}
      <FolderContextMenu
        anchorEl={folderManagement.contextMenuAnchor}
        folder={folderManagement.contextFolder}
        providerId={folderManagement.contextProviderId}
        providerEmail={folderManagement.contextProviderEmail}
        onClose={folderManagement.handleContextMenuClose}
        onCreateFolder={folderManagement.handleCreateFolder}
        onRenameFolder={folderManagement.handleRenameFolder}
        onDeleteFolder={folderManagement.handleDeleteFolder}
      />

      {/* Folder Management Dialog */}
      <FolderManagementDialog
        open={folderManagement.dialogOpen}
        mode={folderManagement.dialogMode}
        folder={folderManagement.dialogFolder}
        providerId={folderManagement.dialogProviderId}
        providerEmail={folderManagement.dialogProviderEmail}
        parentPath={folderManagement.dialogParentPath}
        onClose={folderManagement.handleDialogClose}
        onSuccess={folderManagement.handleDialogSuccess}
      />
    </Paper>
  );
};
