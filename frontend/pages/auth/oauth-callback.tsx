import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { providersApi } from '@/lib/api/providers';
import { useAuth } from '@/lib/hooks/use-auth';
import { useRef } from 'react';

/**
 * OAuth callback page - doesn't require authentication
 * This page handles the OAuth callback and connects the provider
 * before redirecting to the settings page
 */
function OAuthCallbackPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [error, setError] = useState<string>('');
  const [status, setStatus] = useState<string>('Processing OAuth callback...');
  // Prevent multiple executions (Next.js effects can re-run)
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    // Wait for router to be ready before processing
    if (!router.isReady) {
      return;
    }

    // Prevent multiple executions
    if (hasConnectedRef.current) return;
    hasConnectedRef.current = true;

    const { code, state, provider, error: oauthError } = router.query;

    // Handle OAuth error
    if (oauthError) {
      setError(`OAuth error: ${oauthError}`);
      setStatus('Error occurred');
      setTimeout(() => {
        router.replace('/dashboard/settings?section=accounts');
      }, 3000);
      return;
    }

    // Validate required parameters
    if (!code || typeof code !== 'string') {
      setError('No authorization code provided');
      setStatus('Error occurred');
      setTimeout(() => {
        router.replace('/dashboard/settings?section=accounts');
      }, 3000);
      return;
    }

    if (!provider || typeof provider !== 'string') {
      setError('No provider type specified');
      setStatus('Error occurred');
      setTimeout(() => {
        router.replace('/dashboard/settings?section=accounts');
      }, 3000);
      return;
    }

    // Wait for authentication to complete
    // This ensures the user is logged in before connecting the provider
    const checkAuthAndConnect = async () => {
      // Wait a bit for auth to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        setStatus(`Connecting ${provider} account...`);

        // Get state from URL for CSRF validation
        const stateParam = typeof state === 'string' ? state : undefined;

        if (provider === 'google') {
          await providersApi.connectGoogle({
            authorizationCode: code,
            state: stateParam,
            supportsCalendar: true,
          });
        } else if (provider === 'microsoft') {
          await providersApi.connectMicrosoft({
            authorizationCode: code,
            state: stateParam,
            supportsCalendar: true,
          });
        } else {
          throw new Error(`Unsupported provider type: ${provider}`);
        }

        setStatus('Account connected successfully!');

        // Redirect to settings page after successful connection
        setTimeout(() => {
          router.replace('/dashboard/settings?section=accounts&success=true');
        }, 1000);
      } catch (err) {
        const error = err as { response?: { data?: { message?: string } } };
        const errorMessage = error.response?.data?.message || `Failed to connect ${provider} account`;
        setError(errorMessage);
        setStatus('Connection failed');

        // Redirect to settings page with error
        setTimeout(() => {
          router.replace(`/dashboard/settings?section=accounts&error=${encodeURIComponent(errorMessage)}`);
        }, 3000);
      }
    };

    checkAuthAndConnect().finally(() => {
      // Allow future retries if the user refreshes the page with a new code
      hasConnectedRef.current = false;
    });
  }, [router, isAuthenticated]);

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
        {!error ? (
          <>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={48} />
            </Box>
            <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
              {status}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please wait while we complete the authentication process...
            </Typography>
          </>
        ) : (
          <>
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Redirecting to settings page...
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}

// Skip auth guard for this page
(OAuthCallbackPage as any).skipAuthGuard = true;

// Force SSR instead of SSG to avoid NextRouter mount errors
export async function getServerSideProps() {
  return {
    props: {},
  };
}

export default OAuthCallbackPage;
