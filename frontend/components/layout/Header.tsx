import React, { useCallback, useEffect, useState, useRef } from 'react';
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
import { useRouter } from 'next/router';

import { authClient } from '@/lib/auth-client';
import { multiAgentApi, type PendingAction } from '@/lib/api/ai';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ThemeToggle } from './ThemeToggle';
import { throttledGetPendingActions } from './header/header-utils';
import { UserMenu } from './header/UserMenu';
import { NotificationBell } from './header/NotificationBell';
import { AiActionsBell } from './header/AiActionsBell';
import { LanguageMenu } from './header/LanguageMenu';

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
  const [aiActionsAnchor, setAiActionsAnchor] = useState<null | HTMLElement>(null);
  // Notifications disabled during email rebuild - static empty state
  const notifications: HeaderNotification[] = [];
  const notificationsLoading = false;
  const [pendingAiActions, setPendingAiActions] = useState(0);
  const [pendingActionsList, setPendingActionsList] = useState<PendingAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const { locale, changeLocale } = useLocale();

  // Notifications disabled during email rebuild - no-op function
  const fetchNotifications = useCallback(() => {
    // Disabled during rebuild - state already initialized to empty
  }, []);

  // AI Actions Menu handlers
  const handleAiActionsOpen = async (event: React.MouseEvent<HTMLElement>) => {
    setAiActionsAnchor(event.currentTarget);
    setActionsLoading(true);
    try {
      const response = await multiAgentApi.getPendingActions({ status: 'PENDING' });
      const data = response.data;
      setPendingActionsList(data?.actions || []);
      setPendingAiActions(data?.total ?? data?.actions?.length ?? 0);
    } catch {
      // Silently fail
    } finally {
      setActionsLoading(false);
    }
  };

  const handleApproveAction = async (executionId: string) => {
    setApprovingId(executionId);
    try {
      await multiAgentApi.approveAction(executionId);
      setPendingActionsList((prev) => prev.filter((a) => a.executionId !== executionId));
      setPendingAiActions((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectAction = async (executionId: string) => {
    setRejectingId(executionId);
    try {
      await multiAgentApi.rejectAction(executionId);
      setPendingActionsList((prev) => prev.filter((a) => a.executionId !== executionId));
      setPendingAiActions((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    } finally {
      setRejectingId(null);
    }
  };

  const handleLogout = () => {
    authClient.signOut();
    router.push('/auth/login');
    setAnchorEl(null);
  };

  const handleLanguageChange = (newLocale: string) => {
    changeLocale(newLocale);
    setLanguageAnchor(null);
  };

  // Fix race condition: use useRef instead of local variable for mounted check
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const initFetch = async () => {
      fetchNotifications();
      try {
        const result = await throttledGetPendingActions();
        if (mountedRef.current && result.total >= 0) {
          setPendingAiActions(result.total);
        }
      } catch {
        // Silently fail - AI stats are not critical
      }
    };

    initFetch();

    const interval = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const result = await throttledGetPendingActions();
        if (mountedRef.current && result.total >= 0) {
          setPendingAiActions(result.total);
        }
      } catch {
        // Silently fail
      }
    }, 60000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchNotifications]);

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

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Right Side Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* AI Actions Quick Access */}
          <Tooltip title={pendingAiActions > 0 ? (t.ai?.pendingActions || 'Pending Actions') : (t.ai?.title || 'AI Assistant')}>
            <IconButton
              onClick={pendingAiActions > 0 ? handleAiActionsOpen : () => router.push('/dashboard/ai')}
              sx={{
                position: 'relative',
                background: pendingAiActions > 0
                  ? (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`
                  : 'transparent',
                color: pendingAiActions > 0 ? 'white' : 'inherit',
                '&:hover': {
                  background: (theme) =>
                    pendingAiActions > 0
                      ? `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, #6d28d9 100%)`
                      : alpha(theme.palette.primary.main, 0.1),
                },
              }}
            >
              <Badge
                badgeContent={pendingAiActions}
                color="warning"
                invisible={pendingAiActions === 0}
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '0.65rem',
                    height: 16,
                    minWidth: 16,
                  },
                }}
              >
                <Sparkles size={20} />
              </Badge>
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
            <IconButton color="inherit" onClick={(e) => { setNotificationAnchor(e.currentTarget); fetchNotifications(); }}>
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
          onProfile={() => router.push('/dashboard/profile')}
          onSettings={() => router.push('/dashboard/settings')}
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

        <AiActionsBell
          anchorEl={aiActionsAnchor}
          onClose={() => setAiActionsAnchor(null)}
          pendingAiActions={pendingAiActions}
          pendingActionsList={pendingActionsList}
          actionsLoading={actionsLoading}
          approvingId={approvingId}
          rejectingId={rejectingId}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          onViewAll={() => router.push('/dashboard/ai')}
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
