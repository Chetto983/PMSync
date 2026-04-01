import React, { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Box,
  Drawer,
  Tooltip,
  useMediaQuery,
  useTheme,
  alpha,
  type Theme,
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSidebarOrder } from '@/hooks/use-sidebar-order';

const RAIL_WIDTH = 64;

interface PillarItem {
  href: string;
  icon: typeof Home;
  labelKey: 'home' | 'mail' | 'calendar' | 'contacts' | 'tasks';
}

const PILLAR_ITEMS: PillarItem[] = [
  { href: '/dashboard', icon: Home, labelKey: 'home' },
  { href: '/dashboard/email', icon: Mail, labelKey: 'mail' },
  { href: '/dashboard/calendar', icon: Calendar, labelKey: 'calendar' },
  { href: '/dashboard/contacts', icon: Users, labelKey: 'contacts' },
  { href: '/dashboard/tasks', icon: CheckSquare, labelKey: 'tasks' },
];

export interface PmSyncSidebarProps {}

export function Sidebar(_props: PmSyncSidebarProps) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const t = useTranslations();
  const isDark = theme.palette.mode === 'dark';

  const defaultOrder = useMemo(() => PILLAR_ITEMS.map((p) => p.href), []);
  const { order, handleReorder } = useSidebarOrder(defaultOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isActive = (href: string) =>
    router.pathname === href || router.asPath.startsWith(href + '/');

  const activeBg = isDark
    ? `linear-gradient(135deg, ${alpha('#55cae5', 0.15)} 0%, ${alpha('#7650ce', 0.12)} 100%)`
    : `linear-gradient(135deg, ${alpha('#00aced', 0.1)} 0%, ${alpha('#7650ce', 0.08)} 100%)`;
  const activeGlow = isDark
    ? `0 0 16px ${alpha('#55cae5', 0.2)}, 0 0 4px ${alpha('#55cae5', 0.1)}`
    : `0 0 12px ${alpha('#00aced', 0.12)}, 0 0 4px ${alpha('#00aced', 0.06)}`;
  const activeBorder = isDark
    ? alpha('#55cae5', 0.25)
    : alpha('#00aced', 0.2);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      handleReorder(active.id as string, over.id as string);
    }
  };

  // Mobile renders nothing — MobileTabBar handles navigation (Plan 02)
  if (isMobile) return null;

  const pillarMap = new Map(PILLAR_ITEMS.map((p) => [p.href, p]));
  const orderedPillars = order.map((href) => pillarMap.get(href)).filter(Boolean) as PillarItem[];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        display: { xs: 'none', md: 'block' },
        '& .MuiDrawer-paper': {
          width: RAIL_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.6 : 0.85),
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.06),
          overflowX: 'hidden',
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', py: 1 }}>
        {/* Logo */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, pb: 1.5, flexShrink: 0 }}>
          <Image src="/Logo PMSync.svg" alt={t.app.name} width={32} height={32} priority style={{ objectFit: 'contain' }} />
        </Box>

        {/* Pillar icons with DnD */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: '10px' }}>
              {orderedPillars.map((pillar) => (
                <SortableItem
                  key={pillar.href}
                  pillar={pillar}
                  active={isActive(pillar.href)}
                  label={t.nav[pillar.labelKey]}
                  dragLabel={t.nav.dragToReorder ?? 'Drag to reorder'}
                  activeBg={activeBg}
                  activeGlow={activeGlow}
                  activeBorder={activeBorder}
                  isDark={isDark}
                  theme={theme}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>

        {/* Spacer pushes Settings to bottom */}
        <Box sx={{ mt: 'auto' }} />

        {/* Divider */}
        <Box
          sx={{
            mx: 2,
            mb: 1,
            height: '1px',
            background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.divider, 0.3)}, transparent)`,
          }}
        />

        {/* Settings — pinned at bottom, not draggable */}
        <Box sx={{ px: '10px', mb: 1 }}>
          <SettingsItem
            active={isActive('/dashboard/settings')}
            label={t.nav.settings}
            activeBg={activeBg}
            activeGlow={activeGlow}
            activeBorder={activeBorder}
            isDark={isDark}
            theme={theme}
          />
        </Box>
      </Box>
    </Drawer>
  );
}

// ---- Sortable Pillar Item ----

interface SortableItemProps {
  pillar: PillarItem;
  active: boolean;
  label: string;
  dragLabel: string;
  activeBg: string;
  activeGlow: string;
  activeBorder: string;
  isDark: boolean;
  theme: Theme;
}

function SortableItem({ pillar, active, label, dragLabel, activeBg, activeGlow, activeBorder, isDark, theme }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pillar.href });
  const Icon = pillar.icon;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Tooltip title={label} placement="right" arrow>
      <Box
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        aria-label={`${dragLabel} ${label}`}
        sx={{
          opacity: isDragging ? 0.5 : 1,
          cursor: 'grab',
          touchAction: 'none',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <IconLink
          href={pillar.href}
          active={active}
          label={label}
          icon={<Icon size={24} strokeWidth={1.7} />}
          activeBg={activeBg}
          activeGlow={activeGlow}
          activeBorder={activeBorder}
          isDark={isDark}
          theme={theme}
        />
      </Box>
    </Tooltip>
  );
}

// ---- Settings Item (not draggable) ----

interface SettingsItemProps {
  active: boolean;
  label: string;
  activeBg: string;
  activeGlow: string;
  activeBorder: string;
  isDark: boolean;
  theme: Theme;
}

function SettingsItem({ active, label, activeBg, activeGlow, activeBorder, isDark, theme }: SettingsItemProps) {
  return (
    <Tooltip title={label} placement="right" arrow>
      <Box>
        <IconLink
          href="/dashboard/settings"
          active={active}
          label={label}
          icon={<Settings size={24} strokeWidth={1.7} />}
          activeBg={activeBg}
          activeGlow={activeGlow}
          activeBorder={activeBorder}
          isDark={isDark}
          theme={theme}
        />
      </Box>
    </Tooltip>
  );
}

// ---- Shared Icon Link ----

interface IconLinkProps {
  href: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  activeBg: string;
  activeGlow: string;
  activeBorder: string;
  isDark: boolean;
  theme: Theme;
}

function IconLink({ href, active, label, icon, activeBg, activeGlow, activeBorder, isDark, theme }: IconLinkProps) {
  return (
    <Box
      component={Link}
      href={href}
      draggable={false}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: 44,
        height: 44,
        borderRadius: '12px',
        textDecoration: 'none',
        color: 'inherit',
        background: active ? activeBg : 'transparent',
        border: '1px solid',
        borderColor: active ? activeBorder : 'transparent',
        boxShadow: active ? activeGlow : 'none',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: 'translateZ(0)',
        '&:hover': {
          background: active ? activeBg : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
          borderColor: active ? activeBorder : alpha(theme.palette.divider, 0.15),
          transform: 'translateZ(0) scale(1.02)',
        },
        '&:active': {
          transform: 'translateZ(0) scale(0.98)',
        },
      }}
    >
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
      <Box sx={{ display: 'flex', color: active ? 'primary.main' : 'text.secondary', transition: 'color 0.2s ease' }}>
        {icon}
      </Box>
    </Box>
  );
}
