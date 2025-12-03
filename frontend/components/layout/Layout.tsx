import React, { useState } from 'react';
import { Box, ThemeProvider, CssBaseline, Snackbar, Alert } from '@mui/material';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { darkTheme, lightTheme } from '@/theme/appTheme';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
import { useAuth } from '@/lib/hooks/use-auth';
import { useWebSocket } from '@/hooks/use-websocket';
import { useSyncStore } from '@/stores/sync-store';

export interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { token } = useAuth();
  useWebSocket(token || null, true);
  const { lastStatus, clear } = useSyncStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Unified theme management - syncs with database
  const { resolvedTheme, isDarkMode, toggleTheme } = useThemePersistence();
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  // Command palette state
  const { isOpen: commandPaletteOpen, close: closeCommandPalette } = useCommandPalette();

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleMobileDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
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
              overflow: 'auto',
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

        {/* Command Palette (Cmd+K) */}
        <CommandPalette
          open={commandPaletteOpen}
          onClose={closeCommandPalette}
        />
      </Box>
    </ThemeProvider>
  );
}
