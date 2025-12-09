import React, { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { providersApi } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';

interface GoogleProviderCardProps {
  onSuccess: () => void;
}

export function GoogleProviderCard({ onSuccess }: GoogleProviderCardProps) {
  const translations = useTranslations();
  const providersCopy = translations.providers;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setError('');

    try {
      // Get OAuth URL
      const { authUrl } = await providersApi.getGoogleAuthUrl();

      onSuccess();

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to connect Google account');
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            component="span"
            sx={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          </Box>
          {providersCopy.googleTitle}
        </CardTitle>
        <CardDescription>{providersCopy.googleDescription}</CardDescription>
      </CardHeader>
      <CardContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            {providersCopy.googleFeatures.description}
          </Typography>

          <Box
            component="ul"
            sx={{
              pl: 3,
              m: 0,
              listStyle: 'disc',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              color: 'text.secondary',
            }}
          >
            <li>{providersCopy.googleFeatures.feature1}</li>
            <li>{providersCopy.googleFeatures.feature2}</li>
            <li>{providersCopy.googleFeatures.feature3}</li>
          </Box>
        </Stack>

        <Button onClick={handleConnect} disabled={loading} className="w-full">
          {loading ? providersCopy.googleConnecting : providersCopy.googleConnect}
        </Button>
      </CardContent>
    </Card>
  );
}
