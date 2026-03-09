import React, { useState, useCallback } from 'react';
import NextLink from 'next/link';
import { Alert, Box, Button, CircularProgress, Link, TextField, Typography } from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const fp = t.auth.forgotPassword;

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const res = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });
        if (res.error) {
          setError(res.error.message || 'Request failed');
          return;
        }
        setSent(true);
      } catch {
        setError('An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    },
    [email],
  );

  if (sent) {
    return (
      <AuthLayout title={fp.success!.title}>
        <Box sx={{ textAlign: 'center' }}>
          <CheckCircleOutline color="success" sx={{ fontSize: 48, mb: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {fp.success!.description}
          </Typography>
          <Button
            component={NextLink}
            href="/auth/login"
            variant="outlined"
            sx={{ textTransform: 'none' }}
          >
            {fp.success!.actionLabel}
          </Button>
        </Box>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={fp.title} subtitle={fp.subtitle}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label={fp.form.emailLabel}
          type="email"
          autoComplete="email"
          autoFocus
          required
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2.5 }}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading || !email}
          sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600, mb: 1.5 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : fp.form.submit}
        </Button>

        <Box sx={{ textAlign: 'center' }}>
          <Link component={NextLink} href="/auth/login" variant="body2" underline="hover">
            {t.auth.login.form.submit}
          </Link>
        </Box>
      </Box>
    </AuthLayout>
  );
}
