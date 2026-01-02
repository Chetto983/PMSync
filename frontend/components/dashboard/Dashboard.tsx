'use client';

/**
 * Dashboard - Modern 2025 Design
 * Premium look with gradients, animations, and visual hierarchy
 */

import React, { Suspense, lazy } from 'react';
import { Box, Typography, Skeleton, Paper, alpha, useTheme } from '@mui/material';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';

// Critical widgets - load immediately
import { StatsGrid } from './widgets/StatsGrid';
import { DailyBriefing } from '../ai/DailyBriefing';

// Non-critical widgets - lazy loaded
const EventsWidget = lazy(() => import('./widgets/EventsWidget'));
const AiHubWidget = lazy(() => import('./widgets/AiHubWidget'));
// RecentContactsWidget removed - user feedback: not useful
const DeadlineWidget = lazy(() => import('../productivity/DeadlineWidget'));
const FollowUpWidget = lazy(() => import('../productivity/FollowUpWidget'));
const CrmAlertsWidget = lazy(() => import('../crm/CrmAlertsWidget'));
const ActionItemsWidget = lazy(() => import('./widgets/ActionItemsWidget'));
const FocusTimeWidget = lazy(() => import('./widgets/FocusTimeWidget'));
const MeetingPrepWidget = lazy(() => import('./widgets/MeetingPrepWidget'));
const AiAnalyticsWidget = lazy(() => import('./widgets/AiAnalyticsWidget'));

// Premium skeleton for lazy widgets
function WidgetSkeleton() {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        background: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(20px)',
        p: 2.5,
        minHeight: 200,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Skeleton variant="rounded" width={42} height={42} sx={{ borderRadius: 2.5 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="45%" height={22} sx={{ borderRadius: 1 }} />
          <Skeleton width="65%" height={16} sx={{ mt: 0.5, borderRadius: 1 }} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
    </Paper>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const t = useTranslations();
  const theme = useTheme();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.greetings.morning;
    if (hour < 18) return t.greetings.afternoon;
    return t.greetings.evening;
  };

  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';

  return (
    <Box
      sx={{
        maxWidth: 1800,
        mx: 'auto',
        px: { xs: 1.5, sm: 2, md: 4 },
        pb: 4,
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Hero Header */}
      <Box
        sx={{
          pt: { xs: 2, md: 3 },
          pb: { xs: 3, md: 4 },
          position: 'relative',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 800,
            fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' },
            background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}
        >
          {getGreeting()}, {userName}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            mt: 0.5,
            color: 'text.secondary',
            fontSize: { xs: '0.85rem', md: '1rem' },
          }}
        >
          {t.greetings.subtitle}
        </Typography>
      </Box>

      {/* Daily Briefing - Hero Card */}
      <Box sx={{ mb: 4, width: '100%' }}>
        <DailyBriefing userName={userName} />
      </Box>

      {/* Stats Grid - Key Metrics */}
      <Box sx={{ mb: 4, width: '100%' }}>
        <StatsGrid />
      </Box>

      {/* Main Content Grid */}
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
          },
          gridAutoRows: 'min-content',
          width: '100%',
        }}
      >
        {/* AI Hub - Featured */}
        <Box sx={{ gridColumn: { xs: '1', lg: '1' } }}>
          <Suspense fallback={<WidgetSkeleton />}>
            <AiHubWidget />
          </Suspense>
        </Box>

        {/* Deadlines */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <DeadlineWidget limit={5} />
          </Suspense>
        </Box>

        {/* Events */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <EventsWidget />
          </Suspense>
        </Box>

        {/* Follow-ups */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <FollowUpWidget limit={5} />
          </Suspense>
        </Box>

        {/* Action Items (Tasks) */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <ActionItemsWidget limit={4} />
          </Suspense>
        </Box>

        {/* Focus Time */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <FocusTimeWidget />
          </Suspense>
        </Box>

        {/* Meeting Prep */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <MeetingPrepWidget limit={3} />
          </Suspense>
        </Box>

        {/* CRM Alerts */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <CrmAlertsWidget limit={4} />
          </Suspense>
        </Box>

        {/* AI Analytics */}
        <Box>
          <Suspense fallback={<WidgetSkeleton />}>
            <AiAnalyticsWidget />
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}

export default Dashboard;
