import React, { useCallback, useEffect, useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  IconButton,
  TextField,
  InputAdornment,
  Badge,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Typography,
  ListItemIcon,
  ListItemText,
  Tooltip,
  useTheme,
  useMediaQuery,
  CircularProgress,
  alpha,
  Chip,
} from '@mui/material';
import {
  Search,
  Bell,
  Moon,
  Sun,
  User,
  LogOut,
  Settings,
  Menu as MenuIcon,
  Languages,
  Sparkles,
  Mail,
  Calendar,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/stores/auth-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { emailApi } from '@/lib/api/email';
import { multiAgentApi } from '@/lib/api/ai';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';

interface HeaderNotification {
  id: string;
  subject: string;
  sender: string;
  receivedAt?: string;
}

export interface PmSyncHeaderProps {
  onMenuClick?: () => void;
  onThemeToggle?: () => void;
  isDarkMode?: boolean;
}

export function Header({
  onMenuClick,
  onThemeToggle,
  isDarkMode = true,
}: PmSyncHeaderProps) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
  const logout = useAuthStore((state: any) => state.logout);
  const { user } = useAuth();
  const t = useTranslations();

  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const [languageAnchor, setLanguageAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [pendingAiActions, setPendingAiActions] = useState(0);
  const { locale, changeLocale } = useLocale();

  // Fetch AI pending actions count - API returns { actions: [], total, limit, offset }
  const fetchAiPendingActions = useCallback(async () => {
    try {
      const response = await multiAgentApi.getPendingActions({ status: 'PENDING' });
      const data = response.data;
      setPendingAiActions(data?.total ?? data?.actions?.length ?? 0);
    } catch {
      // Silently fail - AI stats are not critical
    }
  }, []);

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const parseSender = (from: string) => {
    if (!from) return '';
    const match = from.match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
      return match[1];
    }
    return from;
  };

  const formatRelativeTime = (isoDate?: string) => {
    if (!isoDate) {
      return '';
    }
    const date = new Date(isoDate);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return t.timeAgo.justNow;
    if (diffMinutes < 60) return t.timeAgo.minutesAgo.replace('{minutes}', diffMinutes.toString());
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t.timeAgo.hoursAgo.replace('{hours}', diffHours.toString());
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t.timeAgo.daysAgo.replace('{days}', diffDays.toString());
    return date.toLocaleDateString();
  };

  const fetchNotifications = useCallback(async () => {
    try {
      setNotificationsLoading(true);
      setNotificationsError(null);
      const response = await emailApi.listEmails({
        page: 1,
        limit: 5,
        isRead: false,
      });

      const items = response.data.emails || [];
      const mapped: HeaderNotification[] = items.map((email) => ({
        id: email.id,
        subject: email.subject || t.common.noSubject,
        sender: parseSender(email.from),
        receivedAt: email.receivedAt || email.sentAt || email.createdAt,
      }));
      setNotifications(mapped);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      setNotifications([]);
      setNotificationsError(t.dashboard.settings.mailAccountsPanel.loadError);
    } finally {
      setNotificationsLoading(false);
    }
  }, [t]);

  const handleNotificationOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchor(event.currentTarget);
    fetchNotifications();
  };

  const handleNotificationClose = () => {
    setNotificationAnchor(null);
  };

  const handleLanguageOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLanguageAnchor(event.currentTarget);
  };

  const handleLanguageClose = () => {
    setLanguageAnchor(null);
  };

  const handleLanguageChange = (newLocale: string) => {
    changeLocale(newLocale);
    handleLanguageClose();
  };

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
    handleUserMenuClose();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/dashboard/email?search=${encodeURIComponent(searchValue)}`);
      setSearchFocused(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchAiPendingActions();
    // Refresh AI actions periodically
    const interval = setInterval(fetchAiPendingActions, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchAiPendingActions]);

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

  // Quick navigation items for search suggestions
  const quickNavItems = [
    { icon: <Mail size={16} />, label: t.nav?.mail || 'Email', path: '/dashboard/email' },
    { icon: <Calendar size={16} />, label: t.nav?.calendar || 'Calendar', path: '/dashboard/calendar' },
    { icon: <Users size={16} />, label: t.nav?.contacts || 'Contacts', path: '/dashboard/contacts' },
    { icon: <Sparkles size={16} />, label: t.ai?.title || 'AI Assistant', path: '/dashboard/ai' },
  ];

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: 'background.paper',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ minHeight: '64px !important', gap: 1 }}>
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

        {/* Search Bar - Modern Design */}
        <Box
          component="form"
          onSubmit={handleSearch}
          sx={{
            flexGrow: 1,
            display: 'flex',
            justifyContent: 'center',
            maxWidth: isMobile ? '100%' : 500,
            mx: 'auto',
            position: 'relative',
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder={t.nav.searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} style={{ opacity: 0.5 }} />
                </InputAdornment>
              ),
              endAdornment: searchValue && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchValue('')}>
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: (theme) => alpha(theme.palette.action.hover, 0.5),
                borderRadius: 2,
                transition: 'all 0.2s',
                border: '1px solid transparent',
                '&:hover': {
                  backgroundColor: (theme) => alpha(theme.palette.action.hover, 0.8),
                },
                '&.Mui-focused': {
                  backgroundColor: 'background.paper',
                  borderColor: 'primary.main',
                  boxShadow: (theme) => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
                },
                '& fieldset': {
                  border: 'none',
                },
              },
            }}
          />

          {/* Search Suggestions Dropdown */}
          {searchFocused && !searchValue && (
            <Box
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                mt: 1,
                bgcolor: 'background.paper',
                borderRadius: 2,
                boxShadow: 3,
                border: 1,
                borderColor: 'divider',
                p: 1,
                zIndex: 1000,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, mb: 1, display: 'block' }}>
                Quick navigation
              </Typography>
              {quickNavItems.map((item) => (
                <Box
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {item.icon}
                  <Typography variant="body2">{item.label}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Right Side Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* AI Assistant Quick Access - New Feature */}
          <Tooltip title={t.ai?.title || 'AI Assistant'}>
            <IconButton
              onClick={() => router.push('/dashboard/ai')}
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
          {!isTablet && (
            <Tooltip title={t.nav.language}>
              <IconButton onClick={handleLanguageOpen} color="inherit" size="small">
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
          {!isMobile && (
            <Tooltip title={isDarkMode ? t.nav.lightMode : t.nav.darkMode}>
              <IconButton onClick={onThemeToggle} color="inherit">
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </IconButton>
            </Tooltip>
          )}

          {/* Notifications */}
          <Tooltip title={t.nav.notifications}>
            <IconButton color="inherit" onClick={handleNotificationOpen}>
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
            <IconButton onClick={handleUserMenuOpen} sx={{ p: 0.5, ml: 0.5 }}>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                {avatarInitials}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>

        {/* User Menu Dropdown - Modern Design */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleUserMenuClose}
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
                sx={{
                  width: 40,
                  height: 40,
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
              router.push('/dashboard/profile');
              handleUserMenuClose();
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
              router.push('/dashboard/settings');
              handleUserMenuClose();
            }}
            sx={{ py: 1.25 }}
          >
            <ListItemIcon>
              <Settings size={18} />
            </ListItemIcon>
            <ListItemText>{t.nav.settings}</ListItemText>
          </MenuItem>

          {/* Mobile-only options */}
          {isMobile && (
            <>
              <Divider />
              <MenuItem onClick={handleLanguageOpen} sx={{ py: 1.25 }}>
                <ListItemIcon>
                  <Languages size={18} />
                </ListItemIcon>
                <ListItemText>
                  {t.nav.language}: {locale === 'en' ? 'EN' : 'IT'}
                </ListItemText>
              </MenuItem>
              <MenuItem onClick={onThemeToggle} sx={{ py: 1.25 }}>
                <ListItemIcon>
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                </ListItemIcon>
                <ListItemText>{isDarkMode ? t.nav.lightMode : t.nav.darkMode}</ListItemText>
              </MenuItem>
            </>
          )}

          <Divider />
          <MenuItem onClick={handleLogout} sx={{ py: 1.25, color: 'error.main' }}>
            <ListItemIcon>
              <LogOut size={18} color="currentColor" />
            </ListItemIcon>
            <ListItemText>{t.nav.logout}</ListItemText>
          </MenuItem>
        </Menu>

        {/* Notifications Menu - Modern Design */}
        <Menu
          anchorEl={notificationAnchor}
          open={Boolean(notificationAnchor)}
          onClose={handleNotificationClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 340,
              maxHeight: 420,
              borderRadius: 2,
              boxShadow: 3,
            },
          }}
        >
          {/* Header */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t.nav.notifications}
            </Typography>
            {unreadCount > 0 && (
              <Chip
                size="small"
                label={`${unreadCount} ${t.ai?.unread || 'new'}`}
                color="primary"
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
            )}
          </Box>
          <Divider />

          {/* Content */}
          {notificationsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!notificationsLoading && notificationsError && (
            <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="error">
                {notificationsError}
              </Typography>
            </Box>
          )}
          {!notificationsLoading && !notificationsError && notifications.length === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography variant="body2" color="text.secondary">
                {t.common.allCaughtUp}
              </Typography>
            </Box>
          )}
          {!notificationsLoading &&
            !notificationsError &&
            notifications.map((notification) => (
              <MenuItem
                key={notification.id}
                onClick={() => {
                  handleNotificationClose();
                  router.push('/dashboard/email');
                }}
                sx={{
                  py: 1.5,
                  px: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 0 },
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, mr: 1 }} noWrap>
                      {notification.sender}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatRelativeTime(notification.receivedAt)}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {notification.subject}
                  </Typography>
                </Box>
              </MenuItem>
            ))}

          {/* Footer */}
          <Divider />
          <MenuItem
            onClick={() => {
              router.push('/dashboard/email');
              handleNotificationClose();
            }}
            sx={{
              justifyContent: 'center',
              py: 1.5,
              color: 'primary.main',
              fontWeight: 600,
            }}
          >
            {t.dashboard.home.sections.viewAllEmails}
          </MenuItem>
        </Menu>

        {/* Language Menu */}
        <Menu
          anchorEl={languageAnchor}
          open={Boolean(languageAnchor)}
          onClose={handleLanguageClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 160,
              borderRadius: 2,
              boxShadow: 3,
            },
          }}
        >
          <MenuItem
            onClick={() => handleLanguageChange('en')}
            selected={locale === 'en'}
            sx={{ py: 1.25 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 24,
                  height: 16,
                  borderRadius: 0.5,
                  bgcolor: '#012169',
                  backgroundImage: `
                    linear-gradient(to bottom right, transparent 0%, transparent 49.9%, white 50%, transparent 50.1%),
                    linear-gradient(to top right, transparent 0%, transparent 49.9%, white 50%, transparent 50.1%),
                    linear-gradient(to bottom right, transparent 0%, transparent 49.5%, #C8102E 50%, transparent 50.5%),
                    linear-gradient(to top right, transparent 0%, transparent 49.5%, #C8102E 50%, transparent 50.5%),
                    linear-gradient(white, white),
                    linear-gradient(#C8102E, #C8102E)
                  `,
                  backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 20% 100%, 100% 20%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <Typography variant="body2">English</Typography>
            </Box>
          </MenuItem>
          <MenuItem
            onClick={() => handleLanguageChange('it')}
            selected={locale === 'it'}
            sx={{ py: 1.25 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 24,
                  height: 16,
                  borderRadius: 0.5,
                  background: 'linear-gradient(to right, #009246 0%, #009246 33.33%, white 33.33%, white 66.67%, #CE2B37 66.67%, #CE2B37 100%)',
                }}
              />
              <Typography variant="body2">Italiano</Typography>
            </Box>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
