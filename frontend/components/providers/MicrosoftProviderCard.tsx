import React, { useState } from 'react';
import { Card, CardContent, CardActions, Typography, Button, Alert, Box } from '@mui/material';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

interface MicrosoftProviderCardProps {
  onSuccess: () => void;
}

export function MicrosoftProviderCard({ onSuccess }: MicrosoftProviderCardProps) {
  const t = useTranslations();
  const p = t.providers;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      onSuccess();
      await authClient.linkSocial({
        provider: 'microsoft',
        callbackURL: '/dashboard/settings?section=accounts&autoConnect=microsoft',
      });
    } catch (err) {
      setError((err as Error).message || 'Failed to connect Microsoft account');
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
          <svg viewBox="0 0 21 21" width={40} height={40}>
            <path fill="#f35325" d="M0 0h10v10H0z" />
            <path fill="#81bc06" d="M11 0h10v10H11z" />
            <path fill="#05a6f0" d="M0 11h10v10H0z" />
            <path fill="#ffba08" d="M11 11h10v10H11z" />
          </svg>
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {p.microsoftTitle}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {p.microsoftDescription}
        </Typography>

        {/* Features */}
        <Box component="ul" sx={{ flex: 1, listStyle: 'disc', pl: 2.5, mb: 2, '& li': { mb: 0.5 } }}>
          <Typography component="li" variant="body2" color="text.secondary">
            {p.microsoftFeatures.feature1}
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            {p.microsoftFeatures.feature2}
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            {p.microsoftFeatures.feature3}
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
          {loading ? p.microsoftConnecting : p.microsoftConnect}
        </Button>
      </CardActions>
    </Card>
  );
}
