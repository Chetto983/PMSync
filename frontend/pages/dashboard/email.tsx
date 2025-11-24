import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  CircularProgress,
  Typography,
  ThemeProvider,
  CssBaseline,
  useMediaQuery,
} from '@mui/material';
import { useAuth } from '@/lib/hooks/use-auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Mailbox } from '@/components/dashboard/Mailbox';
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
import { useWebSocket } from '@/hooks/use-websocket';

/**
 * Email Page - Dedicated full-screen email management interface
 *
 * Full-featured email client with:
 * - Folder navigation
 * - Email list with search and filters
 * - Email detail view
 * - Compose functionality
 * - Bulk actions
 * - Full theme support
 */
export default function EmailPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  useWebSocket(token || null, true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    DEFAULT_USER_SETTINGS.theme
  );

  // Read search query parameter from URL
  const searchQuery = typeof router.query.search === 'string' ? router.query.search : undefined;

  const resolvedThemeMode = resolveThemePreference(themePreference, prefersDarkMode);
  const theme = resolvedThemeMode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

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

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={40} />
          </Box>
          <Typography variant="body1" color="text.primary">
            Loading...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          mobileOpen={mobileOpen}
          onClose={handleMobileDrawerToggle}
        />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
          }}
        >
          <Header
            onMenuClick={handleMobileDrawerToggle}
            onThemeToggle={handleThemeToggle}
            isDarkMode={resolvedThemeMode === 'dark'}
          />

          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Mailbox initialSearchQuery={searchQuery} />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

// Force SSR to avoid NextRouter SSR errors
export const getServerSideProps = async () => {
  return { props: {} };
};
