'use client';

/**
 * Dashboard - Main dashboard with clean 2-column layout
 *
 * Layout:
 * - Header + Greeting
 * - Daily Briefing (full width)
 * - Stats Grid (full width, 4 cards)
 * - Two columns: Main (left) + Sidebar (right)
 *
 * @module components/dashboard/Dashboard
 */

import React, { Suspense, lazy } from 'react';
import { Box, Typography, Skeleton, Paper } from '@mui/material';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';

// Critical widgets - load immediately
import { StatsGrid } from './widgets/StatsGrid';
import { DailyBriefing } from '../ai/DailyBriefing';

// Non-critical widgets - lazy loaded
const EventsWidget = lazy(() => import('./widgets/EventsWidget'));
const PriorityInbox = lazy(() => import('./widgets/PriorityInbox'));
const AiHubWidget = lazy(() => import('./widgets/AiHubWidget'));
const RecentContactsWidget = lazy(() => import('./widgets/RecentContacts'));
const DeadlineWidget = lazy(() => import('../productivity/DeadlineWidget'));
const FollowUpWidget = lazy(() => import('../productivity/FollowUpWidget'));
const CrmAlertsWidget = lazy(() => import('../crm/CrmAlertsWidget'));

// Skeleton for lazy widgets
function WidgetSkeleton() {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        p: 2,
        minHeight: 200,
      }}
    >
      <Skeleton variant="text" width="50%" height={32} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="30%" height={20} sx={{ mb: 2 }} />
      <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
    </Paper>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const t = useTranslations();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.greetings.morning;
    if (hour < 18) return t.greetings.afternoon;
    return t.greetings.evening;
  };

  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 3, pt: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {getGreeting()}, {userName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t.greetings.subtitle}
        </Typography>
      </Box>

      {/* Daily Briefing */}
      <Box sx={{ mb: 3 }}>
        <DailyBriefing userName={userName} />
      </Box>

      {/* Stats Grid */}
      <Box sx={{ mb: 3 }}>
        <StatsGrid />
      </Box>

      {/* Main Layout: 2 Columns */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          gap: 3,
        }}
      >
        {/* Left Column - Main Content (wider) */}
        <Box sx={{ flex: { lg: 2 }, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* AI Hub at top */}
            <Suspense fallback={<WidgetSkeleton />}>
              <AiHubWidget />
            </Suspense>

            {/* Events */}
            <Suspense fallback={<WidgetSkeleton />}>
              <EventsWidget />
            </Suspense>

            {/* Priority Inbox */}
            <Suspense fallback={<WidgetSkeleton />}>
              <PriorityInbox limit={5} />
            </Suspense>
          </Box>
        </Box>

        {/* Right Column - Sidebar (narrower) */}
        <Box sx={{ flex: { lg: 1 }, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Deadlines */}
            <Suspense fallback={<WidgetSkeleton />}>
              <DeadlineWidget limit={5} />
            </Suspense>

            {/* Follow-ups */}
            <Suspense fallback={<WidgetSkeleton />}>
              <FollowUpWidget limit={5} />
            </Suspense>

            {/* CRM Alerts */}
            <Suspense fallback={<WidgetSkeleton />}>
              <CrmAlertsWidget limit={5} />
            </Suspense>

            {/* Recent Contacts */}
            <Suspense fallback={<WidgetSkeleton />}>
              <RecentContactsWidget limit={5} />
            </Suspense>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default Dashboard;
