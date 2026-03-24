import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Box,
  Drawer,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
  alpha,
  Typography,
} from '@mui/material';
import {
  Home,
  Mail,
  Calendar,
  Users,
  Bell,
  AlarmClock,
  Sparkles,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';

const RAIL_WIDTH = 64;
const EXPANDED_WIDTH = 220;

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  section?: 'main' | 'ai';
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
  const isDark = theme.palette.mode === 'dark';

  const navItems: NavItem[] = [
    { label: t.nav.home, icon: <Home size={24} strokeWidth={1.7} />, href: '/dashboard', section: 'main' },
    { label: t.nav.mail, icon: <Mail size={24} strokeWidth={1.7} />, href: '/dashboard/email', section: 'main' },
    { label: t.nav.calendar, icon: <Calendar size={24} strokeWidth={1.7} />, href: '/dashboard/calendar', section: 'main' },
    { label: t.nav.contacts, icon: <Users size={24} strokeWidth={1.7} />, href: '/dashboard/contacts', section: 'main' },
    { label: t.ai.followUpTracker?.title || 'Follow-ups', icon: <Bell size={24} strokeWidth={1.7} />, href: '/dashboard/ai/follow-ups', section: 'ai' },
    { label: t.ai.reminders?.title || 'Reminders', icon: <AlarmClock size={24} strokeWidth={1.7} />, href: '/dashboard/reminders', section: 'ai' },
    { label: t.ai?.title || 'AI Assistant', icon: <Sparkles size={24} strokeWidth={1.7} />, href: '/dashboard/ai', section: 'ai' },
  ];

  const isActive = (href: string) => router.pathname === href;

  const drawerWidth = collapsed ? RAIL_WIDTH : EXPANDED_WIDTH;

  // Brand gradient for active pill
  const activeBg = isDark
    ? `linear-gradient(135deg, ${alpha('#55cae5', 0.15)} 0%, ${alpha('#7650ce', 0.12)} 100%)`
    : `linear-gradient(135deg, ${alpha('#00aced', 0.1)} 0%, ${alpha('#7650ce', 0.08)} 100%)`;
  const activeGlow = isDark
    ? `0 0 16px ${alpha('#55cae5', 0.2)}, 0 0 4px ${alpha('#55cae5', 0.1)}`
    : `0 0 12px ${alpha('#00aced', 0.12)}, 0 0 4px ${alpha('#00aced', 0.06)}`;
  const activeBorder = isDark
    ? alpha('#55cae5', 0.25)
    : alpha('#00aced', 0.2);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);

    const button = (
      <Box
        component={Link}
        href={item.href}
        onClick={() => { if (isMobile && onClose) onClose(); }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          position: 'relative',
          textDecoration: 'none',
          color: 'inherit',
          px: collapsed ? 0 : 1.5,
          py: 0,
          mx: collapsed ? 'auto' : 1,
          height: 44,
          width: collapsed ? 44 : 'auto',
          borderRadius: '12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          overflow: 'hidden',
          // Active pill
          background: active ? activeBg : 'transparent',
          border: '1px solid',
          borderColor: active ? activeBorder : 'transparent',
          boxShadow: active ? activeGlow : 'none',
          // Transitions
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: 'translateZ(0)',
          '&:hover': {
            background: active
              ? activeBg
              : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
            borderColor: active
              ? activeBorder
              : alpha(theme.palette.divider, 0.15),
            transform: 'translateZ(0) scale(1.02)',
          },
          '&:active': {
            transform: 'translateZ(0) scale(0.98)',
          },
        }}
      >
        {/* Active left accent — thin gradient bar */}
        {active && (
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: '20%',
              bottom: '20%',
              width: 3,
              borderRadius: '0 2px 2px 0',
              background: 'linear-gradient(180deg, #55cae5 0%, #7650ce 100%)',
            }}
          />
        )}

        {/* Icon */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: 24,
            height: 24,
            color: active ? 'primary.main' : 'text.secondary',
            transition: 'color 0.2s ease',
          }}
        >
          {item.icon}
        </Box>

        {/* Label */}
        {!collapsed && (
          <Typography
            variant="body2"
            noWrap
            sx={{
              fontSize: '0.8125rem',
              fontWeight: active ? 600 : 450,
              color: active ? 'text.primary' : 'text.secondary',
              letterSpacing: '-0.01em',
              transition: 'color 0.2s ease, font-weight 0.2s ease',
              lineHeight: 1,
            }}
          >
            {item.label}
          </Typography>
        )}
      </Box>
    );

    return collapsed ? (
      <Tooltip key={item.href} title={item.label} placement="right" arrow>
        {button}
      </Tooltip>
    ) : (
      <React.Fragment key={item.href}>{button}</React.Fragment>
    );
  };

  const mainItems = navItems.filter((i) => i.section === 'main');
  const aiItems = navItems.filter((i) => i.section === 'ai');

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        py: 1,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          px: collapsed ? 1 : 2,
          height: 56,
          flexShrink: 0,
          mb: 0.5,
        }}
      >
        <Image
          src="/Logo PMSync.svg"
          alt={t.app.name}
          width={collapsed ? 32 : 110}
          height={collapsed ? 32 : 44}
          priority
          style={{ objectFit: 'contain', objectPosition: 'left center' }}
        />
      </Box>

      {/* Section: Main */}
      {!collapsed && (
        <Typography
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'text.disabled',
            px: 2.5,
            pt: 1.5,
            pb: 0.75,
          }}
        >
          {t.nav.home ? 'Navigation' : 'Nav'}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {mainItems.map(renderNavItem)}
      </Box>

      {/* Section divider */}
      <Box
        sx={{
          mx: collapsed ? 2 : 2.5,
          my: 1.5,
          height: '1px',
          background: (th) =>
            `linear-gradient(90deg, transparent, ${alpha(th.palette.divider, 0.4)}, transparent)`,
        }}
      />

      {/* Section: AI & Productivity */}
      {!collapsed && (
        <Typography
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'text.disabled',
            px: 2.5,
            pb: 0.75,
          }}
        >
          AI
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {aiItems.map(renderNavItem)}
      </Box>

      {/* Spacer */}
      <Box sx={{ flex: 1, minHeight: 16 }} />

      {/* Bottom: Settings */}
      <Box
        sx={{
          mx: collapsed ? 2 : 2.5,
          mb: 1,
          height: '1px',
          background: (th) =>
            `linear-gradient(90deg, transparent, ${alpha(th.palette.divider, 0.3)}, transparent)`,
        }}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mb: 0.5 }}>
        {renderNavItem({
          label: t.nav.settings,
          icon: <Settings size={24} strokeWidth={1.7} />,
          href: '/dashboard/settings',
          section: 'main',
        })}
      </Box>

      {/* Collapse toggle */}
      {!isMobile && onToggleCollapse && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            px: collapsed ? 0 : 1.5,
            pb: 0.5,
          }}
        >
          <IconButton
            size="small"
            onClick={onToggleCollapse}
            sx={{
              width: 28,
              height: 28,
              color: 'text.disabled',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              '&:hover': {
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.text.primary, 0.06),
              },
            }}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </IconButton>
        </Box>
      )}
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: EXPANDED_WIDTH,
            backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.85 : 0.92),
            backdropFilter: 'blur(24px)',
            borderRight: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.08),
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

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
          backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.6 : 0.85),
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.06),
          overflowX: 'hidden',
          transition: theme.transitions.create('width', {
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            duration: 250,
          }),
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
