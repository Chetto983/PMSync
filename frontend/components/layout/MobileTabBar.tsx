import React, { useMemo } from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  useTheme,
  alpha,
} from '@mui/material';
import { Settings } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useSidebarOrder } from '@/hooks/use-sidebar-order';
import { PILLAR_ITEMS, getActiveSidebarHref, type PillarItem } from './sidebar-navigation';

const DEFAULT_ORDER = PILLAR_ITEMS.map((p) => p.href);

export function MobileTabBar() {
  const theme = useTheme();
  const router = useRouter();
  const t = useTranslations();
  const { order } = useSidebarOrder(DEFAULT_ORDER);

  // Resolve current active path for BottomNavigation value
  const currentPath = router.asPath.split('?')[0].split('#')[0];
  const activeValue = getActiveSidebarHref(currentPath)
    ?? (currentPath === '/dashboard/settings' || currentPath.startsWith('/dashboard/settings/')
      ? '/dashboard/settings'
      : false);

  const orderedPillars = useMemo(() => {
    const pillarMap = new Map(PILLAR_ITEMS.map((p) => [p.href, p]));
    return order
      .map((href) => pillarMap.get(href))
      .filter(Boolean) as PillarItem[];
  }, [order]);

  return (
    <BottomNavigation
      value={activeValue}
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
