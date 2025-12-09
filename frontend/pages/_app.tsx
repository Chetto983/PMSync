import React, { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { SpeedInsights } from '@vercel/speed-insights/next';
import {
  ThemeProvider as MuiThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import { QueryProvider } from '@/lib/query-client';
import { AuthProvider } from '@/lib/context/auth-context';
import { lightTheme, darkTheme } from '@/lib/theme/material-theme';
import { useAuth } from '@/lib/hooks/use-auth';
import '@/styles/globals.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

/**
 * Material UI Theme Wrapper
 * Syncs next-themes with Material UI theme
 */
function MaterialThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme, systemTheme } = useTheme();

  // Determine effective theme (respect system preference)
  // Default to 'light' during SSR to avoid undefined theme errors
  const effectiveTheme = theme === 'system' ? systemTheme : theme;
  const muiTheme = effectiveTheme === 'dark' ? darkTheme : lightTheme;

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme />
      {children}
    </MuiThemeProvider>
  );
}

function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [requiresAuth, setRequiresAuth] = React.useState(false);

  // Determine if route requires auth only on client side
  React.useEffect(() => {
    if (router.pathname) {
      setRequiresAuth(router.pathname.startsWith('/dashboard'));
    }
  }, [router.pathname]);

  React.useEffect(() => {
    // Skip auth check during SSR
    if (typeof window === 'undefined') {
      return;
    }

    if (!requiresAuth) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      const next = router.asPath && router.asPath !== '/auth/login' ? router.asPath : undefined;
      router.replace({
        pathname: '/auth/login',
        query: next ? { next } : undefined,
      });
    }
  }, [requiresAuth, isAuthenticated, isLoading, router]);

  // Don't block rendering during SSR
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  if (requiresAuth && (!isAuthenticated || isLoading)) {
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
            {isAuthenticated ? 'Loading dashboard...' : 'Redirecting to login...'}
          </Typography>
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps & { Component: React.ComponentType & { skipAuthGuard?: boolean } }) {
  // Skip RouteGuard for error pages and pages with skipAuthGuard flag
  const skipAuth = Component.skipAuthGuard || false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <QueryProvider>
      <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MaterialThemeWrapper>
          <AuthProvider>
            {skipAuth ? (
              <Component {...pageProps} />
            ) : (
              <RouteGuard>
                <Component {...pageProps} />
              </RouteGuard>
            )}
          </AuthProvider>
          <SpeedInsights />
        </MaterialThemeWrapper>
      </NextThemeProvider>
    </QueryProvider>
  );
}
