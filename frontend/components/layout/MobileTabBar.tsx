import React, { useMemo } from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Home,
  Mail,
  Calendar,
  Users,
  CheckSquare,
  Settings,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useSidebarOrder } from '@/hooks/use-sidebar-order';

interface PillarItem {
  href: string;
  icon: React.ElementType;
  labelKey: 'home' | 'mail' | 'calendar' | 'contacts' | 'tasks';
}

const PILLAR_ITEMS: PillarItem[] = [
  { href: '/dashboard', icon: Home, labelKey: 'home' },
  { href: '/dashboard/email', icon: Mail, labelKey: 'mail' },
  { href: '/dashboard/calendar', icon: Calendar, labelKey: 'calendar' },
  { href: '/dashboard/contacts', icon: Users, labelKey: 'contacts' },
  { href: '/dashboard/tasks', icon: CheckSquare, labelKey: 'tasks' },
];

const DEFAULT_ORDER = PILLAR_ITEMS.map((p) => p.href);

export function MobileTabBar() {
  const theme = useTheme();
  const router = useRouter();
  const t = useTranslations();
  const { order } = useSidebarOrder(DEFAULT_ORDER);

  // Resolve current active path for BottomNavigation value
  const currentPath =
    PILLAR_ITEMS.find((p) => router.pathname === p.href)?.href ??
    (router.pathname === '/dashboard/settings' ? '/dashboard/settings' : false);

  const orderedPillars = useMemo(() => {
    const pillarMap = new Map(PILLAR_ITEMS.map((p) => [p.href, p]));
    return order
      .map((href) => pillarMap.get(href))
      .filter(Boolean) as PillarItem[];
  }, [order]);

  return (
    <BottomNavigation
      value={currentPath}
      onChange={(_, newValue) => router.push(newValue)}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: theme.zIndex.appBar,
        borderTop: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.1),
        height: 56,
        bgcolor: 'background.paper',
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {orderedPillars.map((item) => {
        const IconComp = item.icon;
        return (
          <BottomNavigationAction
            key={item.href}
            value={item.href}
            icon={<IconComp size={24} strokeWidth={1.7} />}
            label={t.nav[item.labelKey]}
            showLabel={false}
            aria-label={t.nav[item.labelKey]}
          />
        );
      })}
      <BottomNavigationAction
        value="/dashboard/settings"
        icon={<Settings size={24} strokeWidth={1.7} />}
        label={t.nav.settings}
        showLabel={false}
        aria-label={t.nav.settings}
      />
    </BottomNavigation>
  );
}
