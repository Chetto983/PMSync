import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  IconButton,
  Badge,
  Avatar,
  Tooltip,
  useTheme,
  useMediaQuery,
  Chip,
  alpha,
} from '@mui/material';
import {
  Bell,
  Menu as MenuIcon,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { authClient } from '@/lib/auth-client';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './header/UserMenu';
import { NotificationBell } from './header/NotificationBell';
import { LanguageMenu } from './header/LanguageMenu';
import { OrgSwitcher } from '@/components/organizations/OrgSwitcher';

interface HeaderNotification {
  id: string;
  subject: string;
  sender: string;
  receivedAt?: string;
}

export interface PmSyncHeaderProps {
  onMenuClick?: () => void;
  /** @deprecated Use ThemeToggle component directly - kept for backwards compat */
  onThemeToggle?: () => void;
  /** @deprecated Use ThemeToggle component directly - kept for backwards compat */
  isDarkMode?: boolean;
}

export function Header({
  onMenuClick,
}: PmSyncHeaderProps) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
  const { data: session } = authClient.useSession();
  const user = session?.user as import('@/lib/auth-client').SessionUser | undefined;
  const t = useTranslations();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const [languageAnchor, setLanguageAnchor] = useState<null | HTMLElement>(null);
  // Notifications disabled during email rebuild - static empty state
  const notifications: HeaderNotification[] = [];
  const notificationsLoading = false;
  const { locale, changeLocale } = useLocale();

  const handleLogout = async () => {
    setAnchorEl(null);
    await authClient.signOut();
    await router.replace('/auth/login');
  };

  const handleLanguageChange = (newLocale: string) => {
    changeLocale(newLocale);
    setLanguageAnchor(null);
  };

  const unreadCount = notifications.length;
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.email ||
    t.nav.account;
  const displayEmail = user?.email || '';
  const avatarInitials =
    displayName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2) || 'A';

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.7),
        backdropFilter: 'blur(12px)',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: (theme) => alpha(theme.palette.divider, 0.1),
      }}
    >
      <Toolbar sx={{ minHeight: 64, gap: 1 }}>
        {/* Mobile Menu Button */}
        {isMobile && (
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            onClick={onMenuClick}
            sx={{ mr: 1 }}
          >
            <MenuIcon size={24} />
          </IconButton>
        )}

        {/* Org Switcher -- only visible for multi-org users */}
        <OrgSwitcher />

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Right Side Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* AI Assistant entry point. HITL approvals are handled inline in chat. */}
          <Tooltip title={t.ai?.title || 'AI Assistant'}>
            <IconButton
              component={Link}
              href="/dashboard/ai"
              sx={{
                position: 'relative',
                color: 'inherit',
                '&:hover': {
                  background: (theme) => alpha(theme.palette.primary.main, 0.1),
                },
              }}
            >
              <Sparkles size={20} />
            </IconButton>
          </Tooltip>

          {/* Language Selector */}
          {!isTablet && !isMobile && (
            <Tooltip title={t.nav.language}>
              <IconButton onClick={(e) => setLanguageAnchor(e.currentTarget)} color="inherit" size="small">
                <Chip
                  size="small"
                  label={locale.toUpperCase()}
                  sx={{
                    height: 24,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                />
              </IconButton>
            </Tooltip>
          )}

          {/* Theme Toggle */}
          {!isMobile && <ThemeToggle />}

          {/* Notifications */}
          <Tooltip title={t.nav.notifications}>
            <IconButton color="inherit" onClick={(e) => setNotificationAnchor(e.currentTarget)}>
              <Badge
                badgeContent={Math.min(99, unreadCount)}
                color="error"
                invisible={unreadCount === 0}
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '0.65rem',
                    height: 16,
                    minWidth: 16,
                  },
                }}
              >
                <Bell size={20} />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          <Tooltip title={t.nav.account}>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.5, ml: 0.5 }}>
              <Avatar
                src={user?.image || undefined}
                sx={{
                  width: 36,
                  height: 36,
                  background: (theme) =>
                    user?.image ? 'transparent' : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                {avatarInitials}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>

        {/* Dropdown Menus */}
        <UserMenu
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          displayName={displayName}
          displayEmail={displayEmail}
          avatarInitials={avatarInitials}
          avatarUrl={user?.image}
          isMobile={isMobile}
          locale={locale}
          onProfile={() => void router.push('/dashboard/profile')}
          onSettings={() => void router.push('/dashboard/settings')}
          onLogout={handleLogout}
          onLanguageOpen={(e) => setLanguageAnchor(e.currentTarget)}
        />

        <NotificationBell
          anchorEl={notificationAnchor}
          onClose={() => setNotificationAnchor(null)}
          notifications={notifications}
          notificationsLoading={notificationsLoading}
          unreadCount={unreadCount}
          onViewAll={() => router.push('/dashboard/email')}
          onNotificationClick={() => router.push('/dashboard/email')}
        />

        <LanguageMenu
          anchorEl={languageAnchor}
          onClose={() => setLanguageAnchor(null)}
          locale={locale}
          onLanguageChange={handleLanguageChange}
        />
      </Toolbar>
    </AppBar>
  );
}
