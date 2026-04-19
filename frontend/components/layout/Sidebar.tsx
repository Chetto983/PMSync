'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useMediaQuery,
  useTheme,
  alpha,
  type Theme,
} from '@mui/material';
import {
  Settings,
  GripVertical,
  X,
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
import { PILLAR_ITEMS, getActiveSidebarHref, type PillarItem } from './sidebar-navigation';
import { PinnedViewsPopover } from '../dashboard/tasks/PinnedViewsPopover';
import { useSmartViews } from '@/hooks/queries/use-tasks';

const SIDEBAR_WIDTH = 216;

export interface PmSyncSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: PmSyncSidebarProps) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const t = useTranslations();
  const isDark = theme.palette.mode === 'dark';
  const currentPath = router.asPath.split('?')[0].split('#')[0];

  const defaultOrder = useMemo(() => PILLAR_ITEMS.map((pillar) => pillar.href), []);
  const { order, handleReorder } = useSidebarOrder(defaultOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeHref = useMemo(() => getActiveSidebarHref(currentPath), [currentPath]);

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

  const { data: smartViews } = useSmartViews();
  const pinnedViews = useMemo(() => smartViews?.filter((v) => v.isPinned) ?? [], [smartViews]);
  const [tasksPopoverAnchor, setTasksPopoverAnchor] = useState<HTMLElement | null>(null);

  if (isMobile) {
    return (
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={onMobileClose}
        variant="temporary"
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: 280,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: alpha(theme.palette.divider, isDark ? 0.16 : 0.1),
            background: isDark
              ? `linear-gradient(180deg, ${alpha('#081018', 0.98)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 100%)`
              : `linear-gradient(180deg, ${alpha('#fbfdfe', 0.99)} 0%, ${alpha('#eef6fb', 0.99)} 100%)`,
          },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
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
                }}
              >
                <Image
                  src="/Logo PMSync.svg"
                  alt={t.app.name}
                  width={22}
                  height={22}
                  priority
                  style={{ objectFit: 'contain' }}
                />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  {t.app.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.nav.openSidebar}
                </Typography>
              </Box>
            </Box>

            <IconButton aria-label={t.common.close} onClick={onMobileClose} edge="end">
              <X size={18} />
            </IconButton>
          </Box>

          <Divider />

          <List sx={{ px: 1.25, py: 1.5 }}>
            {orderedPillars.map((pillar) => (
              <MobileNavItem
                key={pillar.href}
                pillar={pillar}
                active={activeHref === pillar.href}
                label={t.nav[pillar.labelKey]}
                activeBg={activeBg}
                activeBorder={activeBorder}
                isDark={isDark}
                theme={theme}
                onClick={() => {
                  onMobileClose?.();
                  void router.push(pillar.href);
                }}
              />
            ))}
          </List>

          <Box sx={{ mt: 'auto', px: 1.25, py: 1.5 }}>
            <Divider sx={{ mb: 1.25 }} />
            <MobileSettingsItem
              active={currentPath === '/dashboard/settings' || currentPath.startsWith('/dashboard/settings/')}
              label={t.nav.settings}
              activeBg={activeBg}
              activeBorder={activeBorder}
              isDark={isDark}
              theme={theme}
              onClick={() => {
                onMobileClose?.();
                void router.push('/dashboard/settings');
              }}
            />
          </Box>
        </Box>
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        display: { xs: 'none', md: 'block' },
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
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
            alignItems: 'center',
            gap: 1.25,
            pt: 1,
            pb: 2.25,
            flexShrink: 0,
            px: 0.75,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}>
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
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                {t.app.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {t.dashboard.title}
              </Typography>
            </Box>
          </Box>
        </Box>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {orderedPillars.map((pillar) => {
                const isTasksPillar = pillar.href === '/dashboard/tasks';
                const hasPinnedViews = isTasksPillar && pinnedViews.length > 0;

                if (hasPinnedViews) {
                  return (
                    <Box
                      key={pillar.href}
                      onClick={(e: React.MouseEvent<HTMLElement>) => {
                        e.preventDefault();
                        setTasksPopoverAnchor(e.currentTarget);
                      }}
                    >
                      <SortableItem
                        pillar={pillar}
                        active={activeHref === pillar.href}
                        label={t.tasks.smartViews.pinnedViews}
                        dragLabel={t.nav.dragToReorder ?? 'Drag to reorder'}
                        activeBg={activeBg}
                        activeGlow={activeGlow}
                        activeBorder={activeBorder}
                        isDark={isDark}
                        theme={theme}
                      />
                    </Box>
                  );
                }

                return (
                  <SortableItem
                    key={pillar.href}
                    pillar={pillar}
                    active={activeHref === pillar.href}
                    label={t.nav[pillar.labelKey]}
                    dragLabel={t.nav.dragToReorder ?? 'Drag to reorder'}
                    activeBg={activeBg}
                    activeGlow={activeGlow}
                    activeBorder={activeBorder}
                    isDark={isDark}
                    theme={theme}
                  />
                );
              })}
            </Box>
          </SortableContext>
        </DndContext>

        <PinnedViewsPopover
          anchorEl={tasksPopoverAnchor}
          open={Boolean(tasksPopoverAnchor)}
          onClose={() => setTasksPopoverAnchor(null)}
        />

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
          active={currentPath === '/dashboard/settings' || currentPath.startsWith('/dashboard/settings/')}
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

interface MobileNavItemProps {
  pillar: PillarItem;
  active: boolean;
  label: string;
  activeBg: string;
  activeBorder: string;
  isDark: boolean;
  theme: Theme;
  onClick: () => void;
}

function MobileNavItem({
  pillar,
  active,
  label,
  activeBg,
  activeBorder,
  isDark,
  theme,
  onClick,
}: MobileNavItemProps) {
  const Icon = pillar.icon;

  return (
    <ListItemButton
      onClick={onClick}
      selected={active}
      aria-current={active ? 'page' : undefined}
      sx={{
        mb: 0.75,
        borderRadius: 3,
        minHeight: 48,
        background: active ? activeBg : 'transparent',
        border: '1px solid',
        borderColor: active ? activeBorder : alpha(theme.palette.divider, isDark ? 0.1 : 0.08),
        boxShadow: active
          ? isDark
            ? `0 18px 30px ${alpha('#02050a', 0.28)}`
            : `0 18px 26px ${alpha('#d6e3eb', 0.28)}`
          : 'none',
        '&.Mui-selected, &.Mui-selected:hover': {
          background: activeBg,
        },
        '&:hover': {
          backgroundColor: active ? undefined : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
        },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 40,
          color: active ? 'primary.main' : 'text.secondary',
        }}
      >
        <Icon size={19} strokeWidth={1.9} />
      </ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          fontWeight: active ? 700 : 600,
          color: active ? 'text.primary' : 'text.secondary',
        }}
      />
    </ListItemButton>
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
            top: '50%',
            right: 8,
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
            transform: 'translateY(-50%)',
            transition: 'opacity 0.18s ease, transform 0.18s ease, background-color 0.18s ease',
            '&:hover': {
              transform: 'translateY(-50%) scale(1.04)',
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

interface MobileSettingsItemProps {
  active: boolean;
  label: string;
  activeBg: string;
  activeBorder: string;
  isDark: boolean;
  theme: Theme;
  onClick: () => void;
}

function MobileSettingsItem({
  active,
  label,
  activeBg,
  activeBorder,
  isDark,
  theme,
  onClick,
}: MobileSettingsItemProps) {
  return (
    <ListItemButton
      onClick={onClick}
      selected={active}
      aria-current={active ? 'page' : undefined}
      sx={{
        borderRadius: 3,
        minHeight: 48,
        background: active ? activeBg : 'transparent',
        border: '1px solid',
        borderColor: active ? activeBorder : alpha(theme.palette.divider, isDark ? 0.1 : 0.08),
        '&.Mui-selected, &.Mui-selected:hover': {
          background: activeBg,
        },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 40,
          color: active ? 'primary.main' : 'text.secondary',
        }}
      >
        <Settings size={19} strokeWidth={1.9} />
      </ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          fontWeight: active ? 700 : 600,
          color: active ? 'text.primary' : 'text.secondary',
        }}
      />
    </ListItemButton>
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
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        width: '100%',
        minHeight: 48,
        px: 1.5,
        pr: 4,
        position: 'relative',
        borderRadius: '14px',
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
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: '0 999px 999px 0',
            background: 'linear-gradient(180deg, #55cae5 0%, #7650ce 100%)',
          }}
        />
      ) : null}

      <Box
        sx={{
          width: 20,
          height: 20,
          color: active ? 'primary.main' : 'text.secondary',
          transition: 'color 0.2s ease',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="body2"
        sx={{
          fontWeight: active ? 700 : 600,
          color: active ? 'text.primary' : 'text.secondary',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
