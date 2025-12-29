import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Container,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Avatar,
  useTheme,
  Divider,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Mail,
  Settings,
  LogOut,
  Moon,
  Sun,
  Calendar,
  Users,
} from 'lucide-react';
import { useTheme as useNextTheme } from 'next-themes';
import { useAuth } from '@/lib/hooks/use-auth';

const drawerWidth = 260;

const navItems = [
  { path: '/dashboard/email', label: 'Inbox', icon: Mail },
  { path: '/dashboard/contacts', label: 'Contacts', icon: Users },
  { path: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { path: '/dashboard/settings', label: 'Settings', icon: Settings },
];

interface MaterialDashboardLayoutProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onLogout?: () => void;
}

/**
 * Material Design 3 Dashboard Layout
 *
 * Features:
 * - Persistent drawer on desktop (>= md breakpoint)
 * - Temporary drawer on mobile
 * - Bottom navigation on mobile
 * - Responsive AppBar with theme toggle
 * - WCAG 2.1 AA compliant
 * - Touch targets >= 48px
 */
export function MaterialDashboardLayout({
  title,
  description,
  actions,
  children,
  onLogout,
}: MaterialDashboardLayoutProps) {
  const router = useRouter();
  const muiTheme = useTheme();
  const { theme, setTheme } = useNextTheme();
  const { user } = useAuth();
  const t = useTranslations();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Get user display name
  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const userInitials = user?.firstName
    ? user.firstName.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || 'U';

  const handleDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    setMobileDrawerOpen(false);
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
    handleProfileMenuClose();
  };

  const handleLogout = () => {
    handleProfileMenuClose();
    onLogout?.();
  };

  // Drawer content (shared between permanent and temporary)
  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ display: { md: 'none' } }}>
        <Image
          src="/Logo PMSync.svg"
          alt={t.app.name}
          width={200}
          height={100}
          priority
        />
      </Toolbar>
      <Divider sx={{ display: { md: 'none' } }} />

      <List sx={{ flex: 1, px: 2, pt: 2 }}>
        {navItems.map((item) => {
          const isActive =
            router.pathname === item.path ||
            (item.path === '/dashboard/index' && router.pathname === '/dashboard');

          return (
            <ListItemButton
              key={item.path}
              selected={isActive}
              onClick={() => handleNavigation(item.path)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 48, // Touch target
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: isActive ? 'primary.contrastText' : 'text.secondary',
                }}
              >
                <item.icon size={20} />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: isActive ? 600 : 400,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Divider />

      {/* User section in drawer (mobile only) */}
      <Box sx={{ p: 2, display: { md: 'none' } }}>
        <ListItemButton
          onClick={handleLogout}
          sx={{
            borderRadius: 2,
            minHeight: 48,
            color: 'error.main',
          }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
            <LogOut size={20} />
          </ListItemIcon>
          <ListItemText
            primary={t.nav.logout}
            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
          />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: muiTheme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar>
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{
              mr: 2,
              display: { md: 'none' },
              width: 48,
              height: 48,
            }}
            aria-label={t.nav.mail}
          >
            <MenuIcon size={24} />
          </IconButton>

          {/* Logo (Desktop only) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
            }}
          >
            <Image
              src="/Logo PMSync.svg"
              alt={t.app.name}
              width={100}
              height={100}
              priority
            />
          </Box>

          {/* Spacer */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Theme toggle (Desktop) */}
          <IconButton
            onClick={handleThemeToggle}
            sx={{
              mr: 1,
              display: { xs: 'none', md: 'flex' },
              width: 40,
              height: 40,
            }}
            aria-label={t.common.toggleTheme}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </IconButton>

          {/* Profile button */}
          <IconButton
            edge="end"
            onClick={handleProfileMenuOpen}
            sx={{ width: 48, height: 48 }}
            aria-label={t.nav.account}
            aria-controls="profile-menu"
            aria-haspopup="true"
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'secondary.main',
                color: 'secondary.contrastText',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {userInitials}
            </Avatar>
          </IconButton>

          {/* Profile menu */}
          <Menu
            id="profile-menu"
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleProfileMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            sx={{ mt: 1 }}
          >
            <Box sx={{ px: 2, py: 1.5, minWidth: 200 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {userName}
              </Typography>
              {user?.email && (
                <Typography variant="caption" color="text.secondary">
                  {user.email}
                </Typography>
              )}
            </Box>
            <Divider />
            <MenuItem onClick={() => handleNavigation('/dashboard/settings')}>
              <ListItemIcon>
                <Settings size={18} />
              </ListItemIcon>
              {t.nav.settings}
            </MenuItem>
            <MenuItem onClick={handleThemeToggle}>
              <ListItemIcon>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </ListItemIcon>
              {theme === 'dark' ? t.nav.lightMode : t.nav.darkMode}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
              <ListItemIcon sx={{ color: 'error.main' }}>
                <LogOut size={18} />
              </ListItemIcon>
              {t.nav.logout}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Desktop Permanent Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
          },
        }}
      >
        <Toolbar /> {/* Spacer for AppBar */}
        {drawerContent}
      </Drawer>

      {/* Mobile Temporary Drawer */}
      <Drawer
        variant="temporary"
        open={mobileDrawerOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }} // Better mobile performance
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          height: '100vh',
          minHeight: 0,
          overflow: 'auto',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Toolbar /> {/* Spacer for AppBar */}

        <Container
          maxWidth="xl"
          sx={{
            flex: 1,
            py: { xs: 2, md: 3 },
            px: { xs: 2, md: 3 },
            mb: { xs: 8, md: 0 }, // Space for bottom nav on mobile
          }}
        >
          {/* Page Header (if title provided) */}
          {(title || description || actions) && (
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, md: 3 },
                mb: 3,
                borderRadius: 2,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  alignItems: { xs: 'flex-start', md: 'center' },
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  {title && (
                    <Typography variant="h4" component="h1" gutterBottom>
                      {title}
                    </Typography>
                  )}
                  {description && (
                    <Typography variant="body1" color="text.secondary">
                      {description}
                    </Typography>
                  )}
                </Box>
                {actions && (
                  <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    {actions}
                  </Box>
                )}
              </Box>
            </Paper>
          )}

          {children}
        </Container>
      </Box>

      {/* Mobile Bottom Navigation */}
      <Paper
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: { md: 'none' },
          zIndex: muiTheme.zIndex.appBar,
          borderTop: 1,
          borderColor: 'divider',
        }}
        elevation={8}
      >
        <BottomNavigation
          value={router.pathname}
          onChange={(_event, newValue) => handleNavigation(newValue)}
          sx={{
            height: 64, // Increased for better touch targets
            '& .MuiBottomNavigationAction-root': {
              minWidth: 'auto',
              padding: '8px 12px',
            },
          }}
        >
          {navItems.map((item) => (
            <BottomNavigationAction
              key={item.path}
              label={item.label}
              value={item.path}
              icon={<item.icon size={20} />}
              sx={{
                '&.Mui-selected': {
                  color: 'primary.main',
                },
              }}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}

// Named export for backwards compatibility
export { MaterialDashboardLayout as DashboardLayout };

export default MaterialDashboardLayout;
