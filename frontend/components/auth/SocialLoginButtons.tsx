import React, { useState } from 'react';
import { Box, Button, Divider, Typography, SvgIcon } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';

function GoogleIcon() {
  return (
    <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 20 }}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </SvgIcon>
  );
}

function MicrosoftIcon() {
  return (
    <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 20 }}>
      <path d="M3 3h8.5v8.5H3z" fill="#F25022" />
      <path d="M12.5 3H21v8.5h-8.5z" fill="#7FBA00" />
      <path d="M3 12.5h8.5V21H3z" fill="#00A4EF" />
      <path d="M12.5 12.5H21V21h-8.5z" fill="#FFB900" />
    </SvgIcon>
  );
}

export function SocialLoginButtons() {
  const t = useTranslations();
  const [loading, setLoading] = useState<'google' | 'microsoft' | null>(null);

  const handleSocialLogin = async (provider: 'google' | 'microsoft') => {
    setLoading(provider);
    try {
      await authClient.signIn.social({ provider, callbackURL: '/dashboard' });
    } catch {
      // Redirect will happen, errors are handled by better-auth
      setLoading(null);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<GoogleIcon />}
          onClick={() => handleSocialLogin('google')}
          disabled={loading !== null}
          sx={{
            py: 1.2,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500,
            borderColor: 'divider',
            color: 'text.primary',
            '&:hover': { borderColor: 'text.secondary', bgcolor: 'action.hover' },
          }}
        >
          {t.auth.social.google}
        </Button>

        <Button
          variant="outlined"
          fullWidth
          startIcon={<MicrosoftIcon />}
          onClick={() => handleSocialLogin('microsoft')}
          disabled={loading !== null}
          sx={{
            py: 1.2,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500,
            borderColor: 'divider',
            color: 'text.primary',
            '&:hover': { borderColor: 'text.secondary', bgcolor: 'action.hover' },
          }}
        >
          {t.auth.social.microsoft}
        </Button>
      </Box>

      <Divider sx={{ my: 3 }}>
        <Typography variant="body2" color="text.secondary">
          {t.auth.social.or}
        </Typography>
      </Divider>
    </Box>
  );
}
