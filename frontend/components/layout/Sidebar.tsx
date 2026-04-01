'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Box,
  Drawer,
  Tooltip,
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
  GripVertical,
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
  const t = useTranslations();
  const isDark = theme.palette.mode === 'dark';

  const defaultOrder = useMemo(() => PILLAR_ITEMS.map((pillar) => pillar.href), []);
  const { order, handleReorder } = useSidebarOrder(defaultOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isActive = (href: string) => (
    router.pathname === href || router.asPath.startsWith(`${href}/`)
  );

  const activeBg = isDark
    ? `linear-gradient(165deg, ${alpha('#14212b', 0.92)} 0%, ${alpha('#0e171f', 0.98)} 100%)`
    : `linear-gradient(165deg, ${alpha('#fbfeff', 0.96)} 0%, ${alpha('#eff6fb', 0.98)} 100%)`;
  const activeGlow = isDark
    ? `0 18px 34px ${alpha('#02050a', 0.42)}, 0 0 0 1px ${alpha('#55cae5', 0.18)}`
    : `0 18px 30px ${alpha('#c8dbe6', 0.28)}, 0 0 0 1px ${alpha('#99d8ef', 0.36)}`;
  const activeBorder = isDark ? alpha('#55cae5', 0.2) : alpha('#99d8ef', 0.84);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      handleReorder(active.id as string, over.id as string);
    }
  };

  const pillarMap = new Map(PILLAR_ITEMS.map((pillar) => [pillar.href, pillar]));
  const orderedPillars = order
    .map((href) => pillarMap.get(href))
    .filter(Boolean) as PillarItem[];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        display: 'block',
        '& .MuiDrawer-paper': {
          width: RAIL_WIDTH,
          boxSizing: 'border-box',
          position: 'relative',
          background: isDark
            ? `linear-gradient(180deg, ${alpha('#091018', 0.98)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 100%)`
            : `linear-gradient(180deg, ${alpha('#fbfdfe', 0.98)} 0%, ${alpha('#f2f7fa', 0.98)} 100%)`,
          borderRight: '1px solid',
          borderColor: alpha(theme.palette.divider, isDark ? 0.14 : 0.08),
          overflowX: 'hidden',
          boxShadow: isDark
            ? `inset -1px 0 0 ${alpha('#55cae5', 0.08)}, 18px 0 42px ${alpha('#02050a', 0.28)}`
            : `inset -1px 0 0 ${alpha('#ffffff', 0.72)}, 18px 0 38px ${alpha('#d5e1e8', 0.22)}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: isDark
              ? `radial-gradient(circle at top, ${alpha('#55cae5', 0.12)} 0%, transparent 30%), linear-gradient(180deg, transparent 0%, ${alpha('#55cae5', 0.04)} 100%)`
              : `radial-gradient(circle at top, ${alpha('#8dddf1', 0.26)} 0%, transparent 32%), linear-gradient(180deg, transparent 0%, ${alpha('#8bb8d2', 0.05)} 100%)`,
          },
        },
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          px: 1.25,
          py: 1.5,
          position: 'relative',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.1,
            pt: 1,
            pb: 2.25,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '14px',
              display: 'grid',
              placeItems: 'center',
              background: isDark
                ? `linear-gradient(180deg, ${alpha('#152433', 0.92)} 0%, ${alpha('#0b1219', 0.98)} 100%)`
                : `linear-gradient(180deg, ${alpha('#ffffff', 0.98)} 0%, ${alpha('#eef6fb', 0.98)} 100%)`,
              border: `1px solid ${alpha(theme.palette.divider, isDark ? 0.16 : 0.1)}`,
              boxShadow: isDark
                ? `0 16px 28px ${alpha('#02050a', 0.34)}, inset 0 1px 0 ${alpha('#8fe5ff', 0.14)}`
                : `0 16px 28px ${alpha('#c9dbe7', 0.32)}, inset 0 1px 0 ${alpha('#ffffff', 0.88)}`,
            }}
          >
            <Image
              src="/Logo PMSync.svg"
              alt={t.app.name}
              width={24}
              height={24}
              priority
              style={{ objectFit: 'contain' }}
            />
          </Box>
        </Box>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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

        <Box sx={{ mt: 'auto' }} />

        <Box
          sx={{
            mx: 0.75,
            mb: 1.25,
            height: '1px',
            background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.divider, isDark ? 0.34 : 0.16)}, transparent)`,
          }}
        />

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
    </Drawer>
  );
}

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

function SortableItem({
  pillar,
  active,
  label,
  dragLabel,
  activeBg,
  activeGlow,
  activeBorder,
  isDark,
  theme,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pillar.href });
  const Icon = pillar.icon;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        opacity: isDragging ? 0.72 : 1,
        filter: isDragging
          ? `drop-shadow(0 18px 24px ${alpha(theme.palette.common.black, isDark ? 0.24 : 0.16)})`
          : 'none',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          '&:hover .sidebar-drag-handle, &:focus-within .sidebar-drag-handle': {
            opacity: 1,
          },
        }}
      >
        <Tooltip title={label} placement="right" arrow>
          <Box>
            <IconLink
              href={pillar.href}
              active={active}
              label={label}
              icon={<Icon size={20} strokeWidth={1.9} />}
              activeBg={activeBg}
              activeGlow={activeGlow}
              activeBorder={activeBorder}
              isDark={isDark}
              theme={theme}
            />
          </Box>
        </Tooltip>

        <Box
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="sidebar-drag-handle"
          aria-label={`${dragLabel} ${label}`}
          role="button"
          tabIndex={0}
          sx={{
            position: 'absolute',
            top: 2,
            right: -4,
            width: 18,
            height: 18,
            borderRadius: '999px',
            display: 'grid',
            placeItems: 'center',
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            color: active ? 'primary.main' : 'text.disabled',
            backgroundColor: active
              ? alpha(theme.palette.primary.main, isDark ? 0.12 : 0.08)
              : alpha(theme.palette.background.paper, isDark ? 0.32 : 0.72),
            border: `1px solid ${alpha(theme.palette.divider, isDark ? 0.18 : 0.12)}`,
            boxShadow: isDark
              ? `0 8px 18px ${alpha(theme.palette.common.black, 0.18)}`
              : `0 6px 16px ${alpha('#cad6df', 0.16)}`,
            opacity: isDragging ? 1 : 0,
            transition: 'opacity 0.18s ease, transform 0.18s ease, background-color 0.18s ease',
            '&:hover': {
              transform: 'scale(1.04)',
              backgroundColor: active
                ? alpha(theme.palette.primary.main, isDark ? 0.18 : 0.12)
                : alpha(theme.palette.text.primary, isDark ? 0.08 : 0.04),
            },
            '&:focus-visible': {
              opacity: 1,
              outline: `2px solid ${alpha(theme.palette.primary.main, 0.45)}`,
              outlineOffset: 2,
            },
          }}
        >
          <GripVertical size={12} />
        </Box>
      </Box>
    </Box>
  );
}

interface SettingsItemProps {
  active: boolean;
  label: string;
  activeBg: string;
  activeGlow: string;
  activeBorder: string;
  isDark: boolean;
  theme: Theme;
}

function SettingsItem({
  active,
  label,
  activeBg,
  activeGlow,
  activeBorder,
  isDark,
  theme,
}: SettingsItemProps) {
  return (
    <Tooltip title={label} placement="right" arrow>
      <Box>
        <IconLink
          href="/dashboard/settings"
          active={active}
          label={label}
          icon={<Settings size={20} strokeWidth={1.9} />}
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

function IconLink({
  href,
  active,
  label,
  icon,
  activeBg,
  activeGlow,
  activeBorder,
  isDark,
  theme,
}: IconLinkProps) {
  return (
    <Box
      component={Link}
      href={href}
      draggable={false}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      sx={{
        display: 'grid',
        placeItems: 'center',
        width: 44,
        height: 44,
        mx: 'auto',
        position: 'relative',
        borderRadius: '12px',
        textDecoration: 'none',
        color: 'inherit',
        overflow: 'hidden',
        background: active ? activeBg : 'transparent',
        border: '1px solid',
        borderColor: active ? activeBorder : alpha(theme.palette.divider, isDark ? 0.1 : 0.08),
        boxShadow: active
          ? activeGlow
          : isDark
            ? `inset 0 1px 0 ${alpha('#9ce5ff', 0.02)}`
            : `inset 0 1px 0 ${alpha('#ffffff', 0.72)}`,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: 'translateZ(0)',
        '&:hover': {
          background: active ? activeBg : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
          borderColor: active ? activeBorder : alpha(theme.palette.divider, isDark ? 0.18 : 0.14),
          transform: 'translateZ(0) scale(1.02)',
        },
        '&:active': {
          transform: 'translateZ(0) scale(0.98)',
        },
      }}
    >
      {active ? (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: '0 999px 999px 0',
            background: 'linear-gradient(180deg, #55cae5 0%, #7650ce 100%)',
          }}
        />
      ) : null}

      <Box
        sx={{
          color: active ? 'primary.main' : 'text.secondary',
          transition: 'color 0.2s ease',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </Box>
    </Box>
  );
}
