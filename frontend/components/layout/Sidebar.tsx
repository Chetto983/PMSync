import React from 'react';
import Image from 'next/image';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Divider,
  Typography,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Home,
  Mail,
  Calendar,
  Users,
  Settings,
  Sparkles,
  Brain,
  Bell,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useTranslations } from '@/lib/hooks/use-translations';

const DRAWER_WIDTH_EXPANDED = 240;
const DRAWER_WIDTH_COLLAPSED = 72;

interface NavigationItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
}

export interface PmSyncSidebarProps {
  open?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  mobileOpen?: boolean;
}

export function Sidebar({
  open = true,
  collapsed = false,
  onToggleCollapse,
  onClose,
  mobileOpen = false,
}: PmSyncSidebarProps) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const t = useTranslations();

  const navigationItems: NavigationItem[] = [
    {
      label: t.nav.home,
      icon: <Home size={20} />,
      href: '/dashboard',
    },
    {
      label: t.nav.mail,
      icon: <Mail size={20} />,
      href: '/dashboard/email',
    },
    {
      label: t.nav.calendar,
      icon: <Calendar size={20} />,
      href: '/dashboard/calendar',
    },
    {
      label: t.nav.contacts,
      icon: <Users size={20} />,
      href: '/dashboard/contacts',
    },
    {
      label: t.ai.memoryBrowser?.title || 'AI Memory',
      icon: <Brain size={20} />,
      href: '/dashboard/ai/memories',
    },
    {
      label: t.ai.followUpTracker?.title || 'Follow-ups',
      icon: <Bell size={20} />,
      href: '/dashboard/ai/follow-ups',
    },
  ];

  const isActive = (href: string) => {
    return router.pathname === href;
  };

  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED;

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
      }}
    >
      {/* Logo and Brand */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Image
              src="/Logo PMSync.svg"
              alt={t.app.name}
              width={32}
              height={32}
            />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #55cae5 0%, #7650ce 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.app.name}
            </Typography>
          </Box>
        )}
        {collapsed && (
          <Image
            src="/Logo PMSync.svg"
            alt={t.app.name}
            width={32}
            height={32}
          />
        )}
        {!isMobile && onToggleCollapse && (
          <IconButton
            size="small"
            onClick={onToggleCollapse}
            sx={{
              display: collapsed ? 'none' : 'flex',
            }}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </IconButton>
        )}
      </Box>

      <Divider />

      {/* Navigation Items */}
      <List sx={{ pt: 2, px: 1 }}>
        {navigationItems.map((item) => (
          <Tooltip
            key={item.href}
            title={collapsed ? item.label : ''}
            placement="right"
            arrow
          >
            <ListItemButton
              component={Link}
              href={item.href}
              selected={isActive(item.href)}
              sx={{
                mb: 0.5,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1.5 : 2,
              }}
              onClick={() => {
                if (isMobile && onClose) {
                  onClose();
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed ? 'auto' : 40,
                  color: isActive(item.href) ? 'primary.contrastText' : 'text.secondary',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isActive(item.href) ? 600 : 500,
                  }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        ))}
      </List>

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* AI Assistant Button */}
      <Box sx={{ px: 1, pb: 2 }}>
        <Tooltip title={collapsed ? t.nav.ai : ''} placement="right" arrow>
          <Button
            fullWidth
            variant="contained"
            startIcon={!collapsed && <Sparkles size={18} />}
            sx={{
              mb: 1,
              justifyContent: collapsed ? 'center' : 'flex-start',
              minWidth: collapsed ? 48 : 'auto',
              px: collapsed ? 0 : 2,
            }}
            onClick={() => router.push('/dashboard/ai')}
          >
            {collapsed ? <Sparkles size={18} /> : t.nav.ai}
          </Button>
        </Tooltip>
      </Box>

      <Divider />

      {/* Settings */}
      <Box sx={{ p: 1 }}>
        <Tooltip title={collapsed ? t.nav.settings : ''} placement="right" arrow>
          <ListItemButton
            component={Link}
            href="/dashboard/settings"
            selected={isActive('/dashboard/settings')}
            sx={{
              justifyContent: collapsed ? 'center' : 'flex-start',
              px: collapsed ? 1.5 : 2,
            }}
            onClick={() => {
              if (isMobile && onClose) {
                onClose();
              }
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: collapsed ? 'auto' : 40,
                color: isActive('/dashboard/settings')
                  ? 'primary.contrastText'
                  : 'text.secondary',
              }}
            >
              <Settings size={20} />
            </ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary={t.nav.settings}
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  fontWeight: isActive('/dashboard/settings') ? 600 : 500,
                }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );

  // Mobile Drawer
  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{
          keepMounted: true, // Better mobile performance
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH_EXPANDED,
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  // Desktop Drawer
  return (
    <Drawer
      variant="permanent"
      open={open}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        display: { xs: 'none', md: 'block' },
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
