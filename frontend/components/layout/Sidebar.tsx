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
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Home,
  Mail,
  Calendar,
  Users,
  Bell,
  AlarmClock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';

const DRAWER_WIDTH_EXPANDED = 240;
const DRAWER_WIDTH_COLLAPSED = 56;

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
      label: t.ai.followUpTracker?.title || 'Follow-ups',
      icon: <Bell size={20} />,
      href: '/dashboard/ai/follow-ups',
    },
    {
      label: t.ai.reminders?.title || 'Reminders',
      icon: <AlarmClock size={20} />,
      href: '/dashboard/reminders',
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
        backgroundColor: 'transparent', // Transparent to let glass effect show
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
        <Image
          src="/Logo PMSync.svg"
          alt={t.app.name}
          width={collapsed ? 48 : 120}
          height={collapsed ? 48 : 56}
          priority
        />
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
              selected={isActive(item.href)}
              sx={{
                mb: 0.5,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1.5 : 2,
              }}
              onClick={() => {
                router.push(item.href);
                if (isMobile && onClose) {
                  onClose();
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed ? 'auto' : 40,
                  color: isActive(item.href) ? 'primary.main' : 'text.secondary',
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

      {/* Spacer — Settings & AI Chat are in the Header */}
      <Box sx={{ flex: 1 }} />
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
          backgroundColor: alpha(theme.palette.background.paper, 0.7),
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
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
