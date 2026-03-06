import React from 'react';
import {
  Box,
  Menu,
  MenuItem,
  Divider,
  Typography,
  ListItemIcon,
  ListItemText,
  Avatar,
} from '@mui/material';
import { User, LogOut, Settings, Languages } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThemeToggle } from '../ThemeToggle';

export interface UserMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  displayName: string;
  displayEmail: string;
  avatarInitials: string;
  avatarUrl?: string | null;
  isMobile: boolean;
  locale: string;
  onProfile: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onLanguageOpen: (event: React.MouseEvent<HTMLElement>) => void;
}

export function UserMenu({
  anchorEl,
  onClose,
  displayName,
  displayEmail,
  avatarInitials,
  avatarUrl,
  isMobile,
  locale,
  onProfile,
  onSettings,
  onLogout,
  onLanguageOpen,
}: UserMenuProps) {
  const t = useTranslations();

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 220,
          borderRadius: 2,
          boxShadow: 3,
        },
      }}
    >
      {/* User Info Header */}
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            src={avatarUrl || undefined}
            sx={{
              width: 40,
              height: 40,
              background: (theme) =>
                avatarUrl ? 'transparent' : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            }}
          >
            {avatarInitials}
          </Avatar>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {displayName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {displayEmail}
            </Typography>
          </Box>
        </Box>
      </Box>
      <Divider />

      <MenuItem
        onClick={() => {
          onProfile();
          onClose();
        }}
        sx={{ py: 1.25 }}
      >
        <ListItemIcon>
          <User size={18} />
        </ListItemIcon>
        <ListItemText>{t.nav.profile}</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          onSettings();
          onClose();
        }}
        sx={{ py: 1.25 }}
      >
        <ListItemIcon>
          <Settings size={18} />
        </ListItemIcon>
        <ListItemText>{t.nav.settings}</ListItemText>
      </MenuItem>

      {/* Mobile-only options */}
      {isMobile && <Divider />}
      {isMobile && (
        <MenuItem onClick={onLanguageOpen} sx={{ py: 1.25 }}>
          <ListItemIcon>
            <Languages size={18} />
          </ListItemIcon>
          <ListItemText>
            {t.nav.language}: {locale === 'en' ? 'EN' : 'IT'}
          </ListItemText>
        </MenuItem>
      )}
      {/* Mobile Theme Toggle - Three-way selector (light/dark/system) */}
      {isMobile && (
        <Box sx={{ px: 2, py: 1 }}>
          <ThemeToggle />
        </Box>
      )}

      <Divider />
      <MenuItem onClick={onLogout} sx={{ py: 1.25, color: 'error.main' }}>
        <ListItemIcon>
          <LogOut size={18} color="currentColor" />
        </ListItemIcon>
        <ListItemText>{t.nav.logout}</ListItemText>
      </MenuItem>
    </Menu>
  );
}
