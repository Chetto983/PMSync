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
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/stores/auth-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { emailApi } from '@/lib/api/email';
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
  const logout = useAuthStore((state: any) => state.logout);
  const { user } = useAuth();
  const t = useTranslations();

  const [searchValue, setSearchValue] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const [languageAnchor, setLanguageAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const { locale, changeLocale } = useLocale();

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
    }
  };

  useEffect(() => {
    fetchNotifications();
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
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: 'background.paper',
        color: 'text.primary',
      }}
    >
      <Toolbar sx={{ minHeight: '64px !important' }}>
        {/* Mobile Menu Button */}
        {isMobile && (
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            onClick={onMenuClick}
            sx={{ mr: 2 }}
          >
            <MenuIcon size={24} />
          </IconButton>
        )}

        {/* Search Bar */}
        <Box
          component="form"
          onSubmit={handleSearch}
          sx={{
            flexGrow: 1,
            display: 'flex',
            justifyContent: 'center',
            maxWidth: isMobile ? '100%' : 600,
            mx: 'auto',
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder={t.nav.searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'background.default',
              },
            }}
          />
        </Box>

        {/* Right Side Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
          {/* Language Selector */}
          {!isMobile && (
            <Tooltip title={t.nav.language}>
              <IconButton onClick={handleLanguageOpen} color="inherit">
                <Languages size={20} />
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
              >
                <Bell size={20} />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          <Tooltip title={t.nav.account}>
            <IconButton onClick={handleUserMenuOpen} sx={{ p: 0.5 }}>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: 'primary.main',
                  fontSize: '0.875rem',
                }}
              >
                {avatarInitials}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>

        {/* User Menu Dropdown */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleUserMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 200,
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {displayName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {displayEmail}
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              router.push('/dashboard/profile');
              handleUserMenuClose();
            }}
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
          >
            <ListItemIcon>
              <Settings size={18} />
            </ListItemIcon>
            <ListItemText>{t.nav.settings}</ListItemText>
          </MenuItem>
          {isMobile && (
            <>
              <MenuItem onClick={handleLanguageOpen}>
                <ListItemIcon>
                  <Languages size={18} />
                </ListItemIcon>
                <ListItemText>{t.nav.language}: {locale === 'en' ? 'EN' : 'IT'}</ListItemText>
              </MenuItem>
              <MenuItem onClick={onThemeToggle}>
                <ListItemIcon>
                  {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                </ListItemIcon>
                <ListItemText>{isDarkMode ? t.nav.lightMode : t.nav.darkMode}</ListItemText>
              </MenuItem>
            </>
          )}
          <Divider />
          <MenuItem onClick={handleLogout}>
            <ListItemIcon>
              <LogOut size={18} />
            </ListItemIcon>
            <ListItemText>{t.nav.logout}</ListItemText>
          </MenuItem>
        </Menu>

        {/* Notifications Menu */}
        <Menu
          anchorEl={notificationAnchor}
          open={Boolean(notificationAnchor)}
          onClose={handleNotificationClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 320,
              maxHeight: 400,
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t.nav.notifications}
            </Typography>
          </Box>
          <Divider />
          {notificationsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={20} />
            </Box>
          )}
          {!notificationsLoading && notificationsError && (
            <Box sx={{ px: 2, py: 2 }}>
              <Typography variant="body2" color="error">
                {notificationsError}
              </Typography>
            </Box>
          )}
          {!notificationsLoading && !notificationsError && notifications.length === 0 && (
            <Box sx={{ px: 2, py: 2 }}>
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
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {notification.subject}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {notification.sender}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {formatRelativeTime(notification.receivedAt)}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          <Divider />
          <MenuItem
            onClick={() => {
              router.push('/dashboard/email');
              handleNotificationClose();
            }}
            sx={{ justifyContent: 'center', color: 'primary.main' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t.dashboard.home.sections.viewAllEmails}
            </Typography>
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
              minWidth: 150,
            },
          }}
        >
          <MenuItem
            onClick={() => handleLanguageChange('en')}
            selected={locale === 'en'}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              <Typography>English</Typography>
            </Box>
          </MenuItem>
          <MenuItem
            onClick={() => handleLanguageChange('it')}
            selected={locale === 'it'}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 24,
                  height: 16,
                  borderRadius: 0.5,
                  background: 'linear-gradient(to right, #009246 0%, #009246 33.33%, white 33.33%, white 66.67%, #CE2B37 66.67%, #CE2B37 100%)',
                }}
              />
              <Typography>Italiano</Typography>
            </Box>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
