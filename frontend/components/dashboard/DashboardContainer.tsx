/**
 * DashboardContainer - Main dashboard with modern 2025 design
 *
 * Features:
 * - Clean 2-column responsive grid
 * - Glassmorphism card styling
 * - Full-width briefing at top
 * - 2x2 grid for smaller widgets
 * - Personalization drawer
 */

'use client';

import React, { Suspense, lazy, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  alpha,
  useTheme,
  useMediaQuery,
  Button,
  Drawer,
  IconButton,
  Switch,
  Stack,
} from '@mui/material';
import {
  LayoutDashboard,
  Sparkles,
  Settings,
  X,
  Mail,
  Calendar,
  Clock,
  Bell,
  CheckCircle2,
  RotateCcw,
  Star,
  TrendingUp,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ALL_WIDGETS } from '@/stores/dashboard-store';

// Lazy loaded widgets for better performance
const BriefingWidget = lazy(() =>
  import('./widgets/BriefingWidget').then((m) => ({ default: m.BriefingWidget }))
);
const UnreadEmailsWidget = lazy(() =>
  import('./widgets/UnreadEmailsWidget').then((m) => ({ default: m.UnreadEmailsWidget }))
);
const DeadlinesWidget = lazy(() =>
  import('./widgets/DeadlinesWidget').then((m) => ({ default: m.DeadlinesWidget }))
);
const FollowUpWidget = lazy(() =>
  import('./widgets/FollowUpWidget').then((m) => ({ default: m.FollowUpWidget }))
);
const TodayEventsWidget = lazy(() =>
  import('./widgets/TodayEventsWidget').then((m) => ({ default: m.TodayEventsWidget }))
);
const PredictiveInsightsWidget = lazy(() =>
  import('./widgets/PredictiveInsightsWidget').then((m) => ({ default: m.PredictiveInsightsWidget }))
);
const PriorityInboxWidget = lazy(() =>
  import('./widgets/PriorityInboxWidget').then((m) => ({ default: m.PriorityInboxWidget }))
);
const TrendChartsWidget = lazy(() =>
  import('./widgets/TrendChartsWidget').then((m) => ({ default: m.TrendChartsWidget }))
);

// ============================================================================
// Widget Registry
// ============================================================================

type WidgetId = 'briefing' | 'insights' | 'events' | 'emails' | 'deadlines' | 'followups' | 'priority' | 'trends';

interface WidgetConfig {
  id: WidgetId;
  icon: React.ReactNode;
  component: React.LazyExoticComponent<() => React.JSX.Element>;
  fullWidth?: boolean;
}

const WIDGETS: WidgetConfig[] = [
  {
    id: 'briefing',
    icon: <Sparkles size={20} />,
    component: BriefingWidget,
    fullWidth: true,
  },
  {
    id: 'insights',
    icon: <Sparkles size={20} />,
    component: PredictiveInsightsWidget,
  },
  {
    id: 'events',
    icon: <Calendar size={20} />,
    component: TodayEventsWidget,
  },
  {
    id: 'emails',
    icon: <Mail size={20} />,
    component: UnreadEmailsWidget,
  },
  {
    id: 'deadlines',
    icon: <Clock size={20} />,
    component: DeadlinesWidget,
  },
  {
    id: 'followups',
    icon: <Bell size={20} />,
    component: FollowUpWidget,
  },
  {
    id: 'priority',
    icon: <Star size={20} />,
    component: PriorityInboxWidget,
  },
  {
    id: 'trends',
    icon: <TrendingUp size={20} />,
    component: TrendChartsWidget,
  },
];

// Widget names for display
const getWidgetName = (id: WidgetId, t: ReturnType<typeof useTranslations>): string => {
  const names: Record<WidgetId, string> = {
    briefing: t.dashboard?.widgets?.briefing?.title || 'Daily Briefing',
    insights: t.dashboard?.widgets?.insights?.title || 'AI Insights',
    events: t.calendar?.title || "Today's Events",
    emails: t.email?.title || 'Unread Emails',
    deadlines: t.dashboard?.widgets?.deadlines?.title || 'Deadlines',
    followups: t.dashboard?.widgets?.followUps?.title || 'Follow-ups',
    priority: t.dashboard?.widgets?.priorityInbox?.title || 'Priority Inbox',
    trends: t.dashboard?.widgets?.trendCharts?.title || 'Email Activity',
  };
  return names[id];
};

const getWidgetDescription = (id: WidgetId): string => {
  const descriptions: Record<WidgetId, string> = {
    briefing: 'AI-powered summary of your day',
    insights: 'Proactive action items and alerts',
    events: 'Calendar events for today',
    emails: 'Your unread email count',
    deadlines: 'Upcoming deadlines',
    followups: 'Pending follow-ups',
    priority: 'Starred and important emails',
    trends: 'Email activity trends',
  };
  return descriptions[id];
};

// ============================================================================
// Widget Card Skeleton
// ============================================================================

function WidgetSkeleton() {

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: 2.5 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="40%" height={24} />
          <Skeleton width="60%" height={16} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
    </Box>
  );
}

// ============================================================================
// Glassmorphism Widget Card
// ============================================================================

interface WidgetCardProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

function WidgetCard({ children, fullWidth = false }: WidgetCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      elevation={0}
      sx={{
        gridColumn: fullWidth ? '1 / -1' : 'auto',
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, isDark ? 0.15 : 0.1),
        bgcolor: alpha(theme.palette.background.paper, isDark ? 0.8 : 0.95),
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isDark
          ? `0 4px 30px ${alpha('#000', 0.15)}`
          : `0 4px 30px ${alpha(theme.palette.grey[500], 0.08)}`,
        overflow: 'hidden',
        minHeight: 200,
        transition: 'all 0.25s ease',
        '&:hover': {
          boxShadow: isDark
            ? `0 8px 40px ${alpha('#000', 0.25)}`
            : `0 8px 40px ${alpha(theme.palette.primary.main, 0.12)}`,
          borderColor: alpha(theme.palette.primary.main, 0.25),
        },
      }}
    >
      {children}
    </Paper>
  );
}

// ============================================================================
// Customization Drawer
// ============================================================================

interface CustomizeDrawerProps {
  open: boolean;
  onClose: () => void;
  visibleWidgets: WidgetId[];
  onToggleWidget: (id: WidgetId) => void;
  onReset: () => void;
}

function CustomizeDrawer({ open, onClose, visibleWidgets, onToggleWidget, onReset }: CustomizeDrawerProps) {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 380 },
          bgcolor: 'background.default',
          borderTopLeftRadius: { sm: 24 },
          borderBottomLeftRadius: { sm: 24 },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            <Settings size={24} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {t.dashboard?.actions?.customize || 'Customize'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t.dashboard?.customize?.description || 'Choose your widgets'}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            bgcolor: alpha(theme.palette.action.active, 0.08),
            '&:hover': { bgcolor: alpha(theme.palette.action.active, 0.15) },
          }}
        >
          <X size={20} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
        <Stack spacing={2}>
          {WIDGETS.map((widget) => {
            const isVisible = visibleWidgets.includes(widget.id);
            return (
              <Paper
                key={widget.id}
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  border: '2px solid',
                  borderColor: isVisible
                    ? theme.palette.primary.main
                    : alpha(theme.palette.divider, 0.15),
                  bgcolor: isVisible
                    ? alpha(theme.palette.primary.main, 0.08)
                    : alpha(theme.palette.background.paper, 0.5),
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: isVisible
                      ? theme.palette.primary.main
                      : alpha(theme.palette.primary.main, 0.5),
                  },
                }}
                onClick={() => onToggleWidget(widget.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 3,
                      bgcolor: isVisible
                        ? alpha(theme.palette.primary.main, 0.15)
                        : alpha(theme.palette.action.active, 0.08),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isVisible ? 'primary.main' : 'text.secondary',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {widget.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {getWidgetName(widget.id, t)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getWidgetDescription(widget.id)}
                    </Typography>
                  </Box>
                  <Switch
                    checked={isVisible}
                    color="primary"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleWidget(widget.id)}
                  />
                </Box>
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          p: 3,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
          display: 'flex',
          gap: 2,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<RotateCcw size={18} />}
          onClick={onReset}
          sx={{ borderRadius: 3, flex: 1 }}
        >
          {t.dashboard?.actions?.reset || 'Reset'}
        </Button>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{ borderRadius: 3, flex: 1 }}
        >
          {t.common?.done || 'Done'}
        </Button>
      </Box>
    </Drawer>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ onCustomize }: { onCustomize: () => void }) {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 4, md: 6 },
        textAlign: 'center',
        borderRadius: 4,
        border: '2px dashed',
        borderColor: alpha(theme.palette.divider, 0.2),
        bgcolor: alpha(theme.palette.background.paper, 0.5),
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: 4,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 3,
        }}
      >
        <LayoutDashboard size={40} color={theme.palette.primary.main} />
      </Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        {t.dashboard?.empty?.title || 'No widgets selected'}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400, mx: 'auto' }}>
        {t.dashboard?.empty?.description || 'Customize your dashboard by selecting the widgets you want to see'}
      </Typography>
      <Button
        variant="contained"
        size="large"
        startIcon={<Settings size={20} />}
        onClick={onCustomize}
        sx={{
          borderRadius: 3,
          px: 4,
          py: 1.5,
          textTransform: 'none',
          fontWeight: 600,
        }}
      >
        {t.dashboard?.actions?.customize || 'Customize Dashboard'}
      </Button>
    </Paper>
  );
}

// ============================================================================
// AI Assistant Quick Access
// ============================================================================

function AiQuickAccess() {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Paper
      component="a"
      href="/dashboard/ai"
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2.5,
        px: 3,
        py: 2.5,
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, 0.2),
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
        textDecoration: 'none',
        color: 'text.primary',
        transition: 'all 0.25s ease',
        cursor: 'pointer',
        '&:hover': {
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
          borderColor: alpha(theme.palette.primary.main, 0.4),
          transform: 'translateY(-2px)',
          boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.2)}`,
        },
      }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.35)}`,
        }}
      >
        <Sparkles size={26} color="white" />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          {t.ai?.title || 'AI Assistant'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t.ai?.subtitle || 'Ask anything about your emails, calendar & contacts'}
        </Typography>
      </Box>
      <CheckCircle2 size={24} color={theme.palette.success.main} />
    </Paper>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function DashboardContainer() {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Customization state - show all widgets by default (backend controls via API)
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(ALL_WIDGETS as WidgetId[]);

  const handleToggleWidget = useCallback((id: WidgetId) => {
    setVisibleWidgets((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  }, []);

  const handleResetWidgets = useCallback(() => {
    setVisibleWidgets(ALL_WIDGETS as WidgetId[]);
  }, []);

  // Get visible widgets in order
  const widgetsToShow = WIDGETS.filter((w) => visibleWidgets.includes(w.id));
  const briefingWidget = widgetsToShow.find((w) => w.id === 'briefing');
  const otherWidgets = widgetsToShow.filter((w) => w.id !== 'briefing');

  return (
    <Box
      sx={{
        maxWidth: 1400,
        mx: 'auto',
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 4 },
        width: '100%',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 3, md: 4 },
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box
            sx={{
              width: { xs: 52, md: 64 },
              height: { xs: 52, md: 64 },
              borderRadius: 4,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.35)}`,
              flexShrink: 0,
            }}
          >
            <LayoutDashboard size={isMobile ? 26 : 32} color="white" />
          </Box>
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.75rem', md: '2.25rem' },
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.dashboard?.title || 'Dashboard'}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t.dashboard?.subtitle || 'Your personal command center'}
            </Typography>
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<Settings size={18} />}
          onClick={() => setCustomizeOpen(true)}
          sx={{
            borderRadius: 3,
            px: 3,
            py: 1,
            textTransform: 'none',
            fontWeight: 600,
            borderWidth: 2,
            '&:hover': {
              borderWidth: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
            },
          }}
        >
          {t.dashboard?.actions?.customize || 'Customize'}
        </Button>
      </Box>

      {/* Widgets Grid */}
      {widgetsToShow.length > 0 ? (
        <Stack spacing={3}>
          {/* Briefing Widget - Full Width */}
          {briefingWidget && (
            <WidgetCard fullWidth>
              <Suspense fallback={<WidgetSkeleton />}>
                <briefingWidget.component />
              </Suspense>
            </WidgetCard>
          )}

          {/* Other Widgets - 2-column grid */}
          {otherWidgets.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                },
                gap: 3,
              }}
            >
              {otherWidgets.map((widget) => (
                <WidgetCard key={widget.id}>
                  <Suspense fallback={<WidgetSkeleton />}>
                    <widget.component />
                  </Suspense>
                </WidgetCard>
              ))}
            </Box>
          )}

          {/* AI Assistant Quick Access */}
          <AiQuickAccess />
        </Stack>
      ) : (
        <EmptyState onCustomize={() => setCustomizeOpen(true)} />
      )}

      {/* Customize Drawer */}
      <CustomizeDrawer
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        visibleWidgets={visibleWidgets}
        onToggleWidget={handleToggleWidget}
        onReset={handleResetWidgets}
      />
    </Box>
  );
}
