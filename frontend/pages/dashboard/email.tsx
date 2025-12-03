import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  CircularProgress,
  Typography,
  ThemeProvider,
  CssBaseline,
} from '@mui/material';
import { useAuth } from '@/lib/hooks/use-auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Mailbox } from '@/components/dashboard/Mailbox';
import { darkTheme, lightTheme } from '@/theme/appTheme';
import { useThemePersistence } from '@/hooks/use-theme-persistence';
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

  // Unified theme management - syncs with database
  const { resolvedTheme, isDarkMode, toggleTheme } = useThemePersistence();
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  // Read search query parameter from URL
  const searchQuery = typeof router.query.search === 'string' ? router.query.search : undefined;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  const handleToggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleMobileDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
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
      <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
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
            minWidth: 0, // Critical: allows flex item to shrink below content size
            overflow: 'hidden',
          }}
        >
          <Header
            onMenuClick={handleMobileDrawerToggle}
            onThemeToggle={toggleTheme}
            isDarkMode={isDarkMode}
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
