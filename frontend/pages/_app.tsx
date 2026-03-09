import React, { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';

import { useRouter } from 'next/router';
import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from 'sonner';
import { MotionConfig } from 'framer-motion';
import {
  ThemeProvider as MuiThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import { QueryProvider } from '@/lib/query-client';
import { ToastProvider } from '@/lib/context/toast-context';
import { lightTheme, darkTheme } from '@/theme/appTheme';
// CommandPalette is rendered by Layout component (components/layout/CommandPalette.tsx)
import '@/styles/globals.css';
import '@/src/components/chat/chat-layout.css';
import '@/src/components/chat/chat-sidebar.css';
import '@/src/components/chat/chat-thread.css';
import '@assistant-ui/react-markdown/styles/dot.css';
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

export default function App({ Component, pageProps }: AppProps) {
  const mounted = useHasMounted();
  const router = useRouter();
  const isPrivateRoute = router.pathname.startsWith('/dashboard');
  const shouldShowHydrationSkeleton = !mounted && isPrivateRoute;

  // Keep SEO-critical public pages SSR-rendered; only hold private routes during hydration.
  if (shouldShowHydrationSkeleton) {
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
      <NextThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="pmsync:theme">
        <MaterialThemeWrapper>
          <ToastProvider>
              <Component {...pageProps} />
          </ToastProvider>
          <SpeedInsights />
          <Toaster />
        </MaterialThemeWrapper>
      </NextThemeProvider>
    </QueryProvider>
  );
}
