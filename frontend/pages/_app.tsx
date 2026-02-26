import React, { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { MotionConfig } from 'framer-motion';
import {
  ThemeProvider as MuiThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import { QueryProvider } from '@/lib/query-client';
import { AuthProvider } from '@/lib/context/auth-context';
import { ToastProvider } from '@/lib/context/toast-context';
import { lightTheme, darkTheme } from '@/theme/appTheme';
import { useAuth } from '@/lib/hooks/use-auth';
// CommandPalette is rendered by Layout component (components/layout/CommandPalette.tsx)
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
      <MotionConfig reducedMotion="user">
      {children}
      </MotionConfig>
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

// Custom hook for client-side mounting check (hydration guard)
// This is a standard React pattern for avoiding hydration mismatches
function useHasMounted(): boolean {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  return hasMounted;
}

/**
 * App Loading Skeleton
 * Shown during hydration to prevent flash of empty content
 */
function AppSkeleton() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    </Box>
  );
}

export default function App({ Component, pageProps }: AppProps & { Component: React.ComponentType & { skipAuthGuard?: boolean } }) {
  // Skip RouteGuard for error pages and pages with skipAuthGuard flag
  const skipAuth = Component.skipAuthGuard || false;
  const mounted = useHasMounted();
  const router = useRouter();
  const isPrivateRoute =
    router.pathname.startsWith('/dashboard') || router.pathname.startsWith('/auth');

  // Show skeleton during hydration instead of null (prevents flash)
  if (!mounted) {
    return (
      <MuiThemeProvider theme={lightTheme}>
        <CssBaseline />
        <AppSkeleton />
      </MuiThemeProvider>
    );
  }

  return (
    <QueryProvider>
      <Head>
        {/* iOS safe area support - must be in _app, not _document */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" sizes="any" />
        {isPrivateRoute && <meta name="robots" content="noindex,nofollow" />}
      </Head>
      <NextThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MaterialThemeWrapper>
          <ToastProvider>
            <AuthProvider>
              {skipAuth ? (
                <Component {...pageProps} />
              ) : (
                <RouteGuard>
                  <Component {...pageProps} />
                </RouteGuard>
              )}
            </AuthProvider>
          </ToastProvider>
          <SpeedInsights />
        </MaterialThemeWrapper>
      </NextThemeProvider>
    </QueryProvider>
  );
}
