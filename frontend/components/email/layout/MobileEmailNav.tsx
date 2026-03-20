/**
 * Mobile Email Navigation Component
 *
 * Bottom navigation bar for mobile email view.
 * Follows 2025 best practices:
 * - Bottom tab bar for 3-5 main destinations
 * - Floating Action Button (FAB) for compose
 * - Thumb-friendly touch targets (48px minimum)
 *
 * @see https://m3.material.io/components/bottom-app-bar
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Paper,
  Fab,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { safeArea } from '@/theme/appTheme';
import {
  Inbox,
  PenSquare,
  FolderOpen,
  Flag,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailUIStore, type SpecialFolder } from '@/stores/email-ui-store';
import { MobileFolderSheet } from './MobileFolderSheet';

export function MobileEmailNav() {
  const theme = useTheme();
  const router = useRouter();
  const t = useTranslations();
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);

  const filters = useEmailUIStore((state) => state.filters);
  const setFilters = useEmailUIStore((state) => state.setFilters);

  const handleInboxClick = () => {
    setFilters({ providerId: undefined, folderId: undefined, specialUse: 'INBOX' });
  };

  // Navigate to compose page
  const handleComposeClick = () => {
    router.push('/dashboard/email/compose');
  };

  const handleFoldersClick = () => {
    setFolderSheetOpen(true);
  };

  const handleFolderSelect = (folder: SpecialFolder, providerId?: string, folderId?: string) => {
    if (providerId && folderId) {
      setFilters({ providerId, folderId, specialUse: folder });
    } else {
      setFilters({ providerId: undefined, folderId: undefined, specialUse: folder });
    }
    setFolderSheetOpen(false);
  };

  const isInboxActive = filters.specialUse === 'INBOX' && !filters.providerId;

  return (
    <>
      {/* Bottom Navigation Bar */}
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: theme.zIndex.appBar,
          borderRadius: 0,
          borderTop: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          // Safe area for notched phones (bottom + landscape sides)
          paddingBottom: safeArea.bottom,
          paddingLeft: safeArea.left,
          paddingRight: safeArea.right,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            height: 56,
            px: 2,
          }}
        >
          {/* Inbox Button */}
          <NavButton
            icon={<Inbox size={22} />}
            label={t.folders.inbox}
            active={isInboxActive}
            onClick={handleInboxClick}
          />

          {/* Important Button */}
          <NavButton
            icon={<Flag size={22} />}
            label={t.email?.quickFilters?.important || 'Importanti'}
            active={filters.isImportant === true}
            onClick={() => {
              setFilters({
                isImportant: filters.isImportant ? undefined : true,
              });
            }}
          />

          {/* FAB Spacer */}
          <Box sx={{ width: 64 }} />

          {/* Folders Button */}
          <NavButton
            icon={<FolderOpen size={22} />}
            label={t.folders?.title || 'Folders'}
            onClick={handleFoldersClick}
          />
        </Box>

        {/* Floating Action Button for Compose */}
        <Fab
          color="primary"
          aria-label={t.common?.compose || 'Scrivi'}
          onClick={handleComposeClick}
          sx={{
            position: 'absolute',
            top: -28,
            left: '50%',
            transform: 'translateX(-50%)',
            boxShadow: 4,
          }}
        >
          <PenSquare size={24} />
        </Fab>
      </Paper>

      {/* Folder Selection Sheet */}
      <MobileFolderSheet
        open={folderSheetOpen}
        onClose={() => setFolderSheetOpen(false)}
        onSelect={handleFolderSelect}
      />

      {/* Bottom padding spacer to prevent content from being hidden */}
      <Box sx={{ height: 72 }} />
    </>
  );
}

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  const theme = useTheme();

  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.25,
        minWidth: 48,
        minHeight: 48,
        p: 0.5,
        border: 'none',
        backgroundColor: 'transparent',
        color: active ? 'primary.main' : 'text.secondary',
        cursor: 'pointer',
        borderRadius: 2,
        transition: 'all 0.15s ease',
        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.main, 0.08),
        },
        '&:active': {
          backgroundColor: alpha(theme.palette.primary.main, 0.12),
        },
      }}
    >
      {icon}
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.625rem',
          fontWeight: active ? 600 : 400,
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default MobileEmailNav;
