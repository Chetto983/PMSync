import React, { useState } from 'react';
import { Box, ThemeProvider, CssBaseline, Snackbar, Alert } from '@mui/material';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { darkTheme, lightTheme } from '@/theme/appTheme';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { useAuth } from '@/lib/hooks/use-auth';
// WebSocket disabled during email rebuild
import { useSyncStore } from '@/stores/sync-store';

export interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  useAuth(); // Keep auth for session management
  // WebSocket disabled during email rebuild
  const { lastStatus, clear } = useSyncStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Unified theme management - syncs with database
  const { resolvedTheme, isDarkMode, toggleTheme } = useThemePersistence();
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleMobileDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', minHeight: '100vh', maxWidth: '100vw', overflow: 'hidden' }}>
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

          {/* Page Content */}
          <Box
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
              Sync {lastStatus.status}
              {lastStatus.progress !== undefined ? ` (${Math.round(lastStatus.progress)}%)` : ''}
              {lastStatus.error ? `: ${lastStatus.error}` : ''}
            </Alert>
          </Snackbar>
        )}
        <CookieConsent />
      </Box>
    </ThemeProvider>
  );
}
