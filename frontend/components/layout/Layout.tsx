import React, { useState, useEffect, useCallback } from 'react';
import { Box, ThemeProvider, CssBaseline, useMediaQuery, Snackbar, Alert } from '@mui/material';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { darkTheme, lightTheme } from '@/theme/appTheme';
import {
  DEFAULT_USER_SETTINGS,
  getStoredUserSettings,
  persistUserSettings,
  resolveThemePreference,
  type ThemePreference,
  USER_SETTINGS_EVENT,
  USER_SETTINGS_STORAGE_KEY,
} from '@/lib/utils/user-settings';
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
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    DEFAULT_USER_SETTINGS.theme,
  );

  // Command palette state
  const { isOpen: commandPaletteOpen, close: closeCommandPalette } = useCommandPalette();

  const resolvedThemeMode = resolveThemePreference(themePreference, prefersDarkMode);
  const theme = resolvedThemeMode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Load initial settings
    const stored = getStoredUserSettings();
    setThemePreference(stored.theme ?? DEFAULT_USER_SETTINGS.theme);

    const handleSettingsEvent = (event: Event) => {
      const detail = (event as CustomEvent<typeof stored>).detail;
      if (detail?.theme) {
        setThemePreference(detail.theme);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === USER_SETTINGS_STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed.theme) {
            setThemePreference(parsed.theme);
          }
        } catch {
          // Ignore JSON errors
        }
      }
    };

    window.addEventListener(USER_SETTINGS_EVENT, handleSettingsEvent as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(USER_SETTINGS_EVENT, handleSettingsEvent as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleMobileDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const persistTheme = useCallback((preference: ThemePreference) => {
    setThemePreference(preference);
    if (typeof window === 'undefined') {
      return;
    }
    persistUserSettings({ theme: preference });
  }, []);

  const handleThemeToggle = () => {
    const next = resolvedThemeMode === 'dark' ? 'light' : 'dark';
    persistTheme(next);
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
            onThemeToggle={handleThemeToggle}
            isDarkMode={resolvedThemeMode === 'dark'}
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
