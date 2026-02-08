import React, { useState, useMemo } from 'react';
import { Box, Snackbar, Alert } from '@mui/material';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { CommandPalette } from '@/components/ai/CommandPalette';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { useAuth } from '@/lib/hooks/use-auth';
import { useWebSocket } from '@/hooks/use-websocket';
import { useSyncStore } from '@/stores/sync-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { QuotaAlertBanner } from '@/components/billing';

export interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  useAuth(); // Keep auth for session management

  // WebSocket connection - auto-connects when authenticated
  useWebSocket({ autoConnect: true, refetchOnReconnect: true });

  const t = useTranslations();
  const { lastStatus, clear } = useSyncStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Unified theme management - syncs with database
  // Note: MUI ThemeProvider is in _app.tsx (MaterialThemeWrapper) - no duplicate here
  const { isDarkMode, toggleTheme } = useThemePersistence();

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

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleMobileDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
      <Box sx={{ display: 'flex', height: '100vh', minHeight: '100vh', maxWidth: '100vw', overflow: 'hidden' }}>
        {/* Skip Navigation Link - WCAG 2.1 AA requirement */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {t.common?.skipToContent || 'Skip to main content'}
        </a>
        {/* Sidebar */}
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          mobileOpen={mobileOpen}
          onClose={handleMobileDrawerToggle}
        />

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            minWidth: 0, // Critical: allows flex item to shrink below content width
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Header
            onMenuClick={handleMobileDrawerToggle}
            onThemeToggle={toggleTheme}
            isDarkMode={isDarkMode}
          />

          {/* Quota Alert Banner - shows when usage > 80% */}
          <QuotaAlertBanner />

          {/* Page Content - Main content target for skip navigation */}
          <Box
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
        <CookieConsent />
        <CommandPalette />
      </Box>
  );
}
