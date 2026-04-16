import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePrefetchQuery } from '@tanstack/react-query';
import { Box, Snackbar, Alert } from '@mui/material';
import { useRouter } from 'next/router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { CommandPalette } from '@/components/ai/CommandPalette';
import { consentOptions } from '@/hooks/queries/use-consent';
import { useAiOverlay } from '@/stores/ai-overlay-store';
import { AiOverlayDrawer } from '@/components/ai-overlay';

// useWebSocket moved to _app.tsx PrivateRouteGate (prevents connection leak on Layout remount)
import { useSyncStore } from '@/stores/sync-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { QuotaAlertBanner } from '@/components/billing';
import { PendingInvitationBanner } from '@/components/organizations/PendingInvitationBanner';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { InstallPromptBanner } from '@/components/layout/InstallPromptBanner';
import { AiDegradedBanner } from '@/components/common/AiDegradedBanner';
import { useOfflineActions } from '@/hooks/use-offline-actions';
import { useReminderRealtime, type ReminderEventType } from '@/hooks/use-reminder-realtime';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { RealtimeReminderEvent } from '@/lib/websocket-client';

export interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const t = useTranslations();
  const { lastStatus, clear } = useSyncStore();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Prefetch consent early so Dashboard widgets don't waterfall on useConsent()
  usePrefetchQuery(consentOptions());

  // Wire up offline action replay (online event + SW message listeners)
  useOfflineActions();

  // Wire up reminder realtime events with toast notifications
  const toast = useGlobalToast();
  const handleReminderEvent = useCallback(
    (type: ReminderEventType, payload: RealtimeReminderEvent) => {
      if (type === 'imminent') {
        toast.warning(
          t.ai.reminders.toasts.imminent.replace('{title}', payload.titolo),
          {
            actionLabel: t.ai.reminders.toasts.goToReminders,
            onAction: () => router.push('/dashboard/reminders'),
            duration: 8000,
          },
        );
      } else if (type === 'overdue') {
        toast.error(
          t.ai.reminders.toasts.overdue.replace('{title}', payload.titolo),
          {
            actionLabel: t.ai.reminders.toasts.goToReminders,
            onAction: () => router.push('/dashboard/reminders'),
            duration: 10000,
          },
        );
      } else if (type === 'delivery-failed') {
        toast.error(
          t.ai.reminders.toasts.deliveryFailed.replace('{title}', payload.titolo),
          {
            actionLabel: t.ai.reminders.toasts.goToReminders,
            onAction: () => router.push('/dashboard/reminders'),
            duration: 15000,
          },
        );
      }
    },
    [toast, t, router],
  );
  useReminderRealtime(true, { onEvent: handleReminderEvent });

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [router.asPath]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      // Cmd+J / Ctrl+J toggles AI overlay (D-01)
      if (event.key.toLowerCase() === 'j' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        useAiOverlay.getState().toggleOpen();
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Get translated sync status message
  const getSyncStatusMessage = useMemo(() => {
    if (!lastStatus) return '';

    const statusMap: Record<string, string | undefined> = {
      started: t.common.syncStarted,
      in_progress: t.common.syncInProgress,
      completed: t.common.syncCompleted,
      failed: t.common.syncFailed,
    };

    const statusText = statusMap[lastStatus.status] || lastStatus.status;
    const progress = lastStatus.progress !== undefined
      ? ` ${(t.common.syncProgress || '({progress}%)').replace('{progress}', Math.round(lastStatus.progress).toString())}`
      : '';
    const error = lastStatus.error ? `: ${lastStatus.error}` : '';

    return `${statusText}${progress}${error}`;
  }, [lastStatus, t]);

  return (
      <Box
        sx={{
          display: 'flex',
          height: '100dvh',
          minHeight: '100dvh',
          maxWidth: '100vw',
          overflow: 'hidden',
          '@supports not (height: 100dvh)': {
            height: '100vh',
            minHeight: '100vh',
          },
        }}
      >
        {/* Skip Navigation Link - WCAG 2.1 AA requirement */}
        <Box
          component="a"
          href="#main-content"
          sx={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
            '&:focus': {
              position: 'absolute',
              width: 'auto',
              height: 'auto',
              overflow: 'visible',
              clip: 'auto',
              whiteSpace: 'normal',
              zIndex: 9999,
              top: 16,
              left: 16,
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              outline: 'none',
              boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}`,
            },
          }}
        >
          {t.common?.skipToContent || 'Skip to main content'}
        </Box>
        {/* Sidebar */}
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100dvh',
            minWidth: 0, // Critical: allows flex item to shrink below content width
            maxWidth: '100%',
            overflow: 'hidden',
            '@supports not (height: 100dvh)': {
              minHeight: '100vh',
            },
          }}
        >
          {/* Offline Banner - visible when connection drops */}
          <OfflineBanner />

          {/* Impersonation Banner - visible on ALL pages during impersonation */}
          <ImpersonationBanner />

          {/* Header */}
          <Header onOpenSidebar={() => setMobileSidebarOpen(true)} />

          {/* Quota Alert Banner - shows when usage > 80% */}
          <QuotaAlertBanner />

          {/* AI Degraded Banner - visible when AI service is degraded/unhealthy (OBS-M3) */}
          <AiDegradedBanner />

          {/* Pending Invitation Banner -- visible until accepted/declined */}
          <PendingInvitationBanner />

          {/* Page Content - key forces remount on route change */}
          <Box
            key={router.pathname}
            id="main-content"
            tabIndex={-1}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'background.default',
              overflowX: 'hidden',
              overflowY: 'auto',
              minHeight: 0, // Allow nested panels to size within viewport
              minWidth: 0, // Critical for nested flex items
              pb: 0,
            }}
          >
            {children}
          </Box>
        </Box>
        {lastStatus && (
          <Snackbar
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            open={!!lastStatus}
            autoHideDuration={4000}
            onClose={clear}
          >
            <Alert
              onClose={clear}
              severity={lastStatus.status === 'failed' ? 'error' : lastStatus.status === 'completed' ? 'success' : 'info'}
              variant="filled"
            >
              {getSyncStatusMessage}
            </Alert>
          </Snackbar>
        )}
        <InstallPromptBanner />
        <CookieConsent />
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />
        <AiOverlayDrawer />
      </Box>
  );
}
