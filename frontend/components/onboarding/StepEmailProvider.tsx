import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Alert,
  Card,
  CardContent,
  CircularProgress,
} from '@mui/material';
import { CheckCircle, Mail } from 'lucide-react';
import { providersApi } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

/**
 * Detects the social provider used for sign-in from the user's email domain.
 * Returns 'google' | 'microsoft' | null.
 */
function detectSocialProvider(email: string): 'google' | 'microsoft' | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'google';
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain.endsWith('.onmicrosoft.com')
  ) {
    return 'microsoft';
  }
  return null;
}

export function StepEmailProvider({ user, onComplete }: StepProps) {
  const t = useTranslations();
  const sc = t.onboarding.stepContent?.emailProvider;

  const [loading, setLoading] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [autoConnected, setAutoConnected] = useState(false);
  const [error, setError] = useState('');
  const attemptedAutoConnect = useRef(false);

  const detectedProvider = detectSocialProvider(user.email);

  // Auto-connect on mount if user signed in via social login
  useEffect(() => {
    if (attemptedAutoConnect.current || !detectedProvider) return;
    attemptedAutoConnect.current = true;

    const tryAutoConnect = async () => {
      setAutoConnecting(true);
      try {
        const result = await providersApi.autoConnectSocial();
        if ('connected' in result && result.connected === false) {
          // No social tokens available, fall back to manual
          setAutoConnecting(false);
          return;
        }
        // Success — provider auto-connected
        setAutoConnected(true);
        setAutoConnecting(false);
        // Auto-advance after brief visual confirmation
        setTimeout(() => onComplete({ emailConnected: true }), 1500);
      } catch {
        // Auto-connect failed silently, user can connect manually
        setAutoConnecting(false);
      }
    };

    tryAutoConnect();
  }, [detectedProvider, onComplete]);

  const handleConnectGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      const { authUrl } = await providersApi.getGoogleAuthUrl();
      sessionStorage.setItem('pmsync:onboarding-return', 'true');
      window.location.href = authUrl;
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
      setLoading(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setLoading(true);
    setError('');
    try {
      const { authUrl } = await providersApi.getMicrosoftAuthUrl();
      sessionStorage.setItem('pmsync:onboarding-return', 'true');
      window.location.href = authUrl;
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onComplete({ emailConnected: false });
  };

  // Show auto-connect success state
  if (autoConnected) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center', py: 4 }}>
        <CheckCircle size={48} color="var(--mui-palette-success-main, #4caf50)" />
        <Typography variant="h6" sx={{ fontWeight: 600, mt: 2 }}>
          {detectedProvider === 'google' ? 'Gmail' : 'Outlook'}{' '}
          {sc?.connected ?? 'connected successfully!'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {user.email}
        </Typography>
      </Box>
    );
  }

  // Show loading while auto-connecting
  if (autoConnecting) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center', py: 4 }}>
        <CircularProgress size={40} />
        <Typography variant="body1" sx={{ mt: 2 }}>
          {sc?.autoConnecting ?? 'Connecting your email account...'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {sc?.title ?? 'Connect Your Email'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {sc?.description ?? 'Link your email account to start managing your inbox'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {detectedProvider && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {(sc?.autoDetected ?? 'We detected you signed in with {provider}. Connect your {service} account?')
            .replace('{provider}', detectedProvider === 'google' ? 'Google' : 'Microsoft')
            .replace('{service}', detectedProvider === 'google' ? 'Gmail' : 'Outlook')}
        </Alert>
      )}

      <Stack spacing={2}>
        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: detectedProvider === 'google' ? 'primary.main' : undefined,
            borderWidth: detectedProvider === 'google' ? 2 : 1,
          }}
        >
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Mail size={24} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Gmail
                </Typography>
              </Box>
              <Button
                variant={detectedProvider === 'google' ? 'contained' : 'outlined'}
                onClick={handleConnectGoogle}
                disabled={loading}
                size="small"
              >
                {loading ? <CircularProgress size={18} /> : (sc?.connectGmail ?? 'Connect Gmail')}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: detectedProvider === 'microsoft' ? 'primary.main' : undefined,
            borderWidth: detectedProvider === 'microsoft' ? 2 : 1,
          }}
        >
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Mail size={24} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Outlook
                </Typography>
              </Box>
              <Button
                variant={detectedProvider === 'microsoft' ? 'contained' : 'outlined'}
                onClick={handleConnectMicrosoft}
                disabled={loading}
                size="small"
              >
                {loading ? <CircularProgress size={18} /> : (sc?.connectOutlook ?? 'Connect Outlook')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Button
        variant="text"
        fullWidth
        onClick={handleSkip}
        sx={{ mt: 3 }}
        disabled={loading}
      >
        {sc?.skipForNow ?? t.onboarding.skip}
      </Button>
    </Box>
  );
}
