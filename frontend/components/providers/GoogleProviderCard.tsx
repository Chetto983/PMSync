import React, { useState } from 'react';
import { Card, CardContent, CardActions, Typography, Button, Alert, Box } from '@mui/material';
import { providersApi } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';

interface GoogleProviderCardProps {
  onSuccess: () => void;
}

export function GoogleProviderCard({ onSuccess }: GoogleProviderCardProps) {
  const t = useTranslations();
  const p = t.providers;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      const { authUrl } = await providersApi.getGoogleAuthUrl();
      onSuccess();
      window.location.href = authUrl;
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to connect Google account');
      setLoading(false);
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 2 },
      }}
    >
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
        {/* Logo */}
        <Box sx={{ mb: 2.5 }}>
          <svg viewBox="0 0 24 24" width={40} height={40}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {p.googleTitle}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {p.googleDescription}
        </Typography>

        {/* Features */}
        <Box component="ul" sx={{ flex: 1, listStyle: 'disc', pl: 2.5, mb: 2, '& li': { mb: 0.5 } }}>
          <Typography component="li" variant="body2" color="text.secondary">
            {p.googleFeatures.feature1}
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            {p.googleFeatures.feature2}
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            {p.googleFeatures.feature3}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5, fontSize: 12 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
      </CardContent>

      <CardActions sx={{ p: 0 }}>
        <Button
          fullWidth
          onClick={handleConnect}
          disabled={loading}
          sx={{
            height: 48,
            borderRadius: '0 0 12px 12px',
            fontWeight: 600,
            fontSize: 14,
            color: 'white',
            textTransform: 'none',
            background: 'linear-gradient(to right, hsl(189,70%,50%), hsl(258,55%,57%))',
            '&:hover': { opacity: 0.9, background: 'linear-gradient(to right, hsl(189,70%,50%), hsl(258,55%,57%))' },
            '&.Mui-disabled': { opacity: 0.5, color: 'white' },
          }}
        >
          {loading ? p.googleConnecting : p.googleConnect}
        </Button>
      </CardActions>
    </Card>
  );
}
