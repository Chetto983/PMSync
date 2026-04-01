import React, { useMemo } from 'react';
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
  Building2,
  GitBranch,
  Handshake,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Ticket,
  Headset,
  BookOpen,
  BarChart3,
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
  type DraggableSyntheticListeners,
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
const EXPANDED_WIDTH = 220;

interface SortableProps {
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  section?: 'main' | 'crm' | 'ai';
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

  const navItemsMap: Record<string, NavItem> = useMemo(() => ({
    '/dashboard': { label: t.nav.home, icon: <Home size={24} strokeWidth={1.7} />, href: '/dashboard', section: 'main' },
    '/dashboard/email': { label: t.nav.mail, icon: <Mail size={24} strokeWidth={1.7} />, href: '/dashboard/email', section: 'main' },
    '/dashboard/calendar': { label: t.nav.calendar, icon: <Calendar size={24} strokeWidth={1.7} />, href: '/dashboard/calendar', section: 'main' },
    '/dashboard/contacts': { label: t.nav.contacts, icon: <Users size={24} strokeWidth={1.7} />, href: '/dashboard/contacts', section: 'main' },
    '/dashboard/crm/accounts': { label: t.nav.crmAccounts, icon: <Building2 size={24} strokeWidth={1.7} />, href: '/dashboard/crm/accounts', section: 'crm' },
    '/dashboard/crm/pipelines': { label: t.nav.crmPipelines, icon: <GitBranch size={24} strokeWidth={1.7} />, href: '/dashboard/crm/pipelines', section: 'crm' },
    '/dashboard/crm/deals': { label: t.nav.crmDeals, icon: <Handshake size={24} strokeWidth={1.7} />, href: '/dashboard/crm/deals', section: 'crm' },
    '/dashboard/crm/forecast': { label: t.nav.crmForecast, icon: <TrendingUp size={24} strokeWidth={1.7} />, href: '/dashboard/crm/forecast', section: 'crm' },
    '/dashboard/crm/churn': { label: t.nav.crmChurn, icon: <AlertTriangle size={24} strokeWidth={1.7} />, href: '/dashboard/crm/churn', section: 'crm' },
    '/dashboard/crm/ai-governance': { label: t.nav.crmGovernance, icon: <ShieldCheck size={24} strokeWidth={1.7} />, href: '/dashboard/crm/ai-governance', section: 'crm' },
    '/dashboard/crm/tickets': { label: t.nav.crmTickets, icon: <Ticket size={24} strokeWidth={1.7} />, href: '/dashboard/crm/tickets', section: 'crm' },
    '/dashboard/crm/kb': { label: t.nav.kb || 'Knowledge Base', icon: <BookOpen size={24} strokeWidth={1.7} />, href: '/dashboard/crm/kb', section: 'crm' },
    '/dashboard/crm/service-analytics': { label: t.serviceAnalytics?.title || 'Service Analytics', icon: <BarChart3 size={24} strokeWidth={1.7} />, href: '/dashboard/crm/service-analytics', section: 'crm' },
    '/dashboard/agent': { label: t.agentDashboard?.title || 'Agent Dashboard', icon: <Headset size={24} strokeWidth={1.7} />, href: '/dashboard/agent', section: 'crm' },
    '/dashboard/ai/follow-ups': { label: t.ai.followUpTracker?.title || 'Follow-ups', icon: <Bell size={24} strokeWidth={1.7} />, href: '/dashboard/ai/follow-ups', section: 'ai' },
    '/dashboard/reminders': { label: t.ai.reminders?.title || 'Reminders', icon: <AlarmClock size={24} strokeWidth={1.7} />, href: '/dashboard/reminders', section: 'ai' },
    '/dashboard/ai': { label: t.ai?.title || 'AI Assistant', icon: <Sparkles size={24} strokeWidth={1.7} />, href: '/dashboard/ai', section: 'ai' },
  }), [t]);

  const defaultMainOrder = useMemo(() => ['/dashboard', '/dashboard/email', '/dashboard/calendar', '/dashboard/contacts'], []);
  const defaultCrmOrder = useMemo(() => [
    '/dashboard/crm/accounts', '/dashboard/crm/pipelines', '/dashboard/crm/deals',
    '/dashboard/crm/forecast', '/dashboard/crm/churn', '/dashboard/crm/ai-governance',
    '/dashboard/crm/tickets', '/dashboard/crm/kb', '/dashboard/crm/service-analytics',
    '/dashboard/agent',
  ], []);
  const defaultAiOrder = useMemo(() => ['/dashboard/ai/follow-ups', '/dashboard/reminders', '/dashboard/ai'], []);

  const { order: mainOrder, handleReorder: reorderMain } = useSidebarOrder('main', defaultMainOrder);
  const { order: crmOrder, handleReorder: reorderCrm } = useSidebarOrder('crm', defaultCrmOrder);
  const { order: aiOrder, handleReorder: reorderAi } = useSidebarOrder('ai', defaultAiOrder);

  const defaultSectionOrder = useMemo(() => ['main', 'crm', 'ai'], []);
  const { order: sectionOrder, handleReorder: reorderSections } = useSidebarOrder('sections', defaultSectionOrder);

  const dndEnabled = !collapsed && !isMobile;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isActive = (href: string) =>
    router.pathname === href || router.asPath.startsWith(href + '/');

  // AI feature discovery: track which AI items the user has visited
  const AI_SEEN_KEY = 'pmsync:ai-features-seen';
  const [aiSeen, setAiSeen] = React.useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(AI_SEEN_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const markAiSeen = React.useCallback((href: string) => {
    setAiSeen((prev) => {
      if (prev.has(href)) return prev;
      const next = new Set(prev);
      next.add(href);
      localStorage.setItem(AI_SEEN_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

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

  const renderNavItem = (item: NavItem, sortableProps?: SortableProps) => {
    const active = isActive(item.href);

    const button = (
      <Box
        ref={sortableProps?.setNodeRef}
        style={sortableProps?.style}
        {...(dndEnabled && sortableProps ? sortableProps.attributes : {})}
        {...(dndEnabled && sortableProps ? sortableProps.listeners : {})}
        aria-label={dndEnabled && sortableProps ? `${t.nav.dragToReorder ?? 'Drag to reorder'} ${item.label}` : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          height: 44,
          mx: collapsed ? 'auto' : 1,
          width: collapsed ? 44 : 'auto',
          opacity: sortableProps?.isDragging ? 0.5 : 1,
          cursor: dndEnabled && sortableProps ? 'grab' : undefined,
          touchAction: dndEnabled && sortableProps ? 'none' : undefined,
          '&:active': dndEnabled && sortableProps ? { cursor: 'grabbing' } : {},
          '&:hover .sidebar-drag-handle': {
            opacity: 1,
          },
        }}
      >
        {/* Drag indicator icon — only in expanded + desktop mode */}
        {dndEnabled && sortableProps && (
          <Box
            className="sidebar-drag-handle"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              flexShrink: 0,
              color: 'text.disabled',
              opacity: 0,
              transition: 'opacity 0.15s ease',
              pointerEvents: 'none',
            }}
          >
            <GripVertical size={14} />
          </Box>
        )}

        <Box
          component={Link}
          href={item.href}
          draggable={false}
          onClick={(e: React.MouseEvent) => {
            // Prevent navigation if a drag just completed
            if (sortableProps?.isDragging) { e.preventDefault(); return; }
            if (item.section === 'ai') markAiSeen(item.href);
            if (isMobile && onClose) onClose();
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flex: 1,
            textDecoration: 'none',
            color: 'inherit',
            px: collapsed ? 0 : 1.5,
            py: 0,
            height: '100%',
            borderRadius: '12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            overflow: 'hidden',
            background: active ? activeBg : 'transparent',
            border: '1px solid',
            borderColor: active ? activeBorder : 'transparent',
            boxShadow: active ? activeGlow : 'none',
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
          {active && (
            <Box
              sx={{
                position: 'absolute',
                left: dndEnabled ? 20 : 0,
                top: '20%',
                bottom: '20%',
                width: 3,
                borderRadius: '0 2px 2px 0',
                background: 'linear-gradient(180deg, #55cae5 0%, #7650ce 100%)',
              }}
            />
          )}

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

          {!collapsed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
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
              {item.section === 'ai' && !aiSeen.has(item.href) && (
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    flexShrink: 0,
                  }}
                />
              )}
            </Box>
          )}
        </Box>
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

  const mainItems = mainOrder.map((href) => navItemsMap[href]).filter(Boolean);
  const crmItems = crmOrder.map((href) => navItemsMap[href]).filter(Boolean);
  const aiItems = aiOrder.map((href) => navItemsMap[href]).filter(Boolean);

  const makeDragEndHandler = (reorder: (activeId: string, overId: string) => void) =>
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorder(String(active.id), String(over.id));
    };

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

      {/* Sortable sections */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={makeDragEndHandler(reorderSections)}
      >
        <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
          {sectionOrder.map((sectionKey, idx) => (
            <SortableSectionBlock
              key={sectionKey}
              sectionKey={sectionKey}
              isFirst={idx === 0}
              collapsed={collapsed}
              dndEnabled={dndEnabled}
              sectionLabel={
                sectionKey === 'main' ? (t.nav.home ? 'Navigation' : 'Nav')
                : sectionKey === 'crm' ? 'CRM'
                : 'AI'
              }
              items={
                sectionKey === 'main' ? mainItems
                : sectionKey === 'crm' ? crmItems
                : aiItems
              }
              order={
                sectionKey === 'main' ? mainOrder
                : sectionKey === 'crm' ? crmOrder
                : aiOrder
              }
              reorder={
                sectionKey === 'main' ? reorderMain
                : sectionKey === 'crm' ? reorderCrm
                : reorderAi
              }
              sensors={sensors}
              renderNavItem={renderNavItem}
            />
          ))}
        </SortableContext>
      </DndContext>

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

// ---- Sortable Nav Item (extracted to avoid hook-in-callback) ----

interface SortableNavItemProps {
  item: NavItem;
  renderNavItem: (item: NavItem, sortableProps?: SortableProps) => React.ReactNode;
}

function SortableNavItem({ item, renderNavItem }: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.href });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return <>{renderNavItem(item, { setNodeRef, style, attributes, listeners, isDragging })}</>;
}

// ---- Sortable Section Block (entire section is a sortable unit) ----

interface SortableSectionBlockProps {
  sectionKey: string;
  isFirst: boolean;
  collapsed: boolean;
  dndEnabled: boolean;
  sectionLabel: string;
  items: NavItem[];
  order: string[];
  reorder: (activeId: string, overId: string) => void;
  sensors: ReturnType<typeof useSensors>;
  renderNavItem: (item: NavItem, sortableProps?: SortableProps) => React.ReactNode;
}

function SortableSectionBlock({
  sectionKey,
  isFirst,
  collapsed,
  dndEnabled,
  sectionLabel,
  items,
  order,
  reorder,
  sensors,
  renderNavItem,
}: SortableSectionBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionKey });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const makeDragEndHandler = (reorderFn: (a: string, b: string) => void) =>
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderFn(String(active.id), String(over.id));
    };

  return (
    <Box ref={setNodeRef} style={style}>
      {/* Divider (skip for first section) */}
      {!isFirst && (
        <Box
          sx={{
            mx: collapsed ? 2 : 2.5,
            my: 1.5,
            height: '1px',
            background: (th) =>
              `linear-gradient(90deg, transparent, ${alpha(th.palette.divider, 0.4)}, transparent)`,
          }}
        />
      )}

      {/* Section header — drag handle for entire section */}
      {!collapsed && (
        <Typography
          {...(dndEnabled ? attributes : {})}
          {...(dndEnabled ? listeners : {})}
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'text.disabled',
            px: 2.5,
            pt: isFirst ? 1.5 : 0,
            pb: 0.75,
            cursor: dndEnabled ? 'grab' : undefined,
            '&:active': dndEnabled ? { cursor: 'grabbing' } : {},
            '&:hover': dndEnabled ? { color: 'text.secondary' } : {},
            userSelect: 'none',
          }}
        >
          {sectionLabel}
        </Typography>
      )}

      {/* Items within this section — their own DndContext for item-level reorder */}
      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={makeDragEndHandler(reorder)}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {items.map((item) => (
                <SortableNavItem key={item.href} item={item} renderNavItem={renderNavItem} />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {items.map((item) => renderNavItem(item))}
        </Box>
      )}
    </Box>
  );
}
