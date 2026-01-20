import React, { useCallback, useEffect, useState, useRef } from 'react';
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
  Button,
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
  Check,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/stores/auth-store';
import { useAuth } from '@/lib/hooks/use-auth';
// Email notifications disabled during rebuild
import { multiAgentApi, type PendingAction } from '@/lib/api/ai';
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
  const logout = useAuthStore((state: { logout: () => void }) => state.logout);
  const { user } = useAuth();
  const t = useTranslations();

  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
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

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const formatRelativeTime = useCallback((isoDate?: string) => {
    if (!isoDate) {
      return '';
    }
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return t.timeAgo.justNow;
    if (diffMinutes < 60) return t.timeAgo.minutesAgo.replace('{minutes}', diffMinutes.toString());
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t.timeAgo.hoursAgo.replace('{hours}', diffHours.toString());
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t.timeAgo.daysAgo.replace('{days}', diffDays.toString());
    return date.toLocaleDateString();
  }, [t.timeAgo]);

  // Notifications disabled during email rebuild - no-op function
  const fetchNotifications = useCallback(() => {
    // Disabled during rebuild - state already initialized to empty
  }, []);

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

  const handleAiActionsClose = () => {
    setAiActionsAnchor(null);
  };

  const handleApproveAction = async (executionId: string) => {
    setApprovingId(executionId);
    try {
      await multiAgentApi.approveAction(executionId);
      // Remove from list and update count
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
      // Remove from list and update count
      setPendingActionsList((prev) => prev.filter((a) => a.executionId !== executionId));
      setPendingAiActions((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    } finally {
      setRejectingId(null);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warning';
      default:
        return 'info';
    }
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

  // Fix race condition: use useRef instead of local variable for mounted check
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch with mount check
    const initFetch = async () => {
      fetchNotifications();
      try {
        const response = await multiAgentApi.getPendingActions({ status: 'PENDING' });
        if (mountedRef.current) {
          const data = response.data;
          setPendingAiActions(data?.total ?? data?.actions?.length ?? 0);
        }
      } catch {
        // Silently fail - AI stats are not critical
      }
    };

    initFetch();

    // Refresh AI actions periodically
    const interval = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const response = await multiAgentApi.getPendingActions({ status: 'PENDING' });
        if (mountedRef.current) {
          const data = response.data;
          setPendingAiActions(data?.total ?? data?.actions?.length ?? 0);
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
        // Glassmorphism effect
        backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.7),
        backdropFilter: 'blur(12px)',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: (theme) => alpha(theme.palette.divider, 0.1),
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
            maxWidth: isMobile ? 'calc(100% - 130px)' : 500,
            mx: isMobile ? 0.5 : 'auto',
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
          {/* AI Actions Quick Access - Shows pending HITL actions */}
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
                src={user?.avatarUrl || undefined}
                sx={{
                  width: 36,
                  height: 36,
                  background: (theme) =>
                    user?.avatarUrl ? 'transparent' : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
                src={user?.avatarUrl || undefined}
                sx={{
                  width: 40,
                  height: 40,
                  background: (theme) =>
                    user?.avatarUrl ? 'transparent' : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
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
          {isMobile && <Divider />}
          {isMobile && (
            <MenuItem onClick={handleLanguageOpen} sx={{ py: 1.25 }}>
              <ListItemIcon>
                <Languages size={18} />
              </ListItemIcon>
              <ListItemText>
                {t.nav.language}: {locale === 'en' ? 'EN' : 'IT'}
              </ListItemText>
            </MenuItem>
          )}
          {isMobile && (
            <MenuItem onClick={onThemeToggle} sx={{ py: 1.25 }}>
              <ListItemIcon>
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </ListItemIcon>
              <ListItemText>{isDarkMode ? t.nav.lightMode : t.nav.darkMode}</ListItemText>
            </MenuItem>
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
          {!notificationsLoading && notifications.length === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Mail size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography variant="body2" color="text.secondary">
                {t.common.allCaughtUp}
              </Typography>
            </Box>
          )}
          {!notificationsLoading &&
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
            {t.dashboard?.home?.sections?.viewAllEmails || 'View All Emails'}
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

        {/* AI Pending Actions Menu - HITL Review */}
        <Menu
          anchorEl={aiActionsAnchor}
          open={Boolean(aiActionsAnchor)}
          onClose={handleAiActionsClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 380,
              maxHeight: 480,
              borderRadius: 2,
              boxShadow: 3,
            },
          }}
        >
          {/* Header */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AlertTriangle size={18} color={theme.palette.warning.main} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t.ai?.needsReview || 'Needs Review'}
              </Typography>
            </Box>
            {pendingAiActions > 0 && (
              <Chip
                size="small"
                label={`${pendingAiActions} ${t.ai?.pending || 'pending'}`}
                color="warning"
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
            )}
          </Box>
          <Divider />

          {/* Content */}
          {actionsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!actionsLoading && pendingActionsList.length === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Sparkles size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography variant="body2" color="text.secondary">
                {t.ai?.noPendingActions || 'No pending actions'}
              </Typography>
            </Box>
          )}
          {!actionsLoading && pendingActionsList.slice(0, 5).map((action) => (
            <Box
              key={action.executionId}
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                '&:last-of-type': { borderBottom: 0 },
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                <Chip
                  size="small"
                  label={action.severity}
                  color={getSeverityColor(action.severity) as 'error' | 'warning' | 'info'}
                  sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {action.actionType.replace(/_/g, ' ')}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.4 }}>
                {action.summary.length > 100 ? action.summary.slice(0, 100) + '...' : action.summary}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<XCircle size={14} />}
                  onClick={() => handleRejectAction(action.executionId)}
                  disabled={rejectingId === action.executionId || approvingId === action.executionId}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
                >
                  {rejectingId === action.executionId ? <CircularProgress size={12} /> : (t.ai?.reject || 'Reject')}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<Check size={14} />}
                  onClick={() => handleApproveAction(action.executionId)}
                  disabled={approvingId === action.executionId || rejectingId === action.executionId}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
                >
                  {approvingId === action.executionId ? <CircularProgress size={12} color="inherit" /> : (t.ai?.approve || 'Approve')}
                </Button>
              </Box>
            </Box>
          ))}

          {/* Footer - View All */}
          {pendingActionsList.length > 0 && (
            <>
              <Divider />
              <MenuItem
                onClick={() => {
                  router.push('/dashboard/ai');
                  handleAiActionsClose();
                }}
                sx={{
                  justifyContent: 'center',
                  py: 1.5,
                  color: 'primary.main',
                  fontWeight: 600,
                }}
              >
                {t.ai?.viewAllActions || 'View All in AI Assistant'}
              </MenuItem>
            </>
          )}
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
