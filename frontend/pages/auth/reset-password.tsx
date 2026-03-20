import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { CheckCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordField } from '@/components/auth/PasswordField';

export default function ResetPasswordPage() {
  const t = useTranslations();
  const rp = t.auth.resetPassword;
  const router = useRouter();
  const token = router.query.token as string | undefined;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (password !== confirmPassword) {
        setError(t.common.passwordMismatch);
        return;
      }

      if (!token) {
        setError('Missing reset token. Please use the link from your email.');
        return;
      }

      setLoading(true);
      try {
        const res = await authClient.resetPassword({ newPassword: password, token });
        if (res.error) {
          setError(res.error.message || 'Reset failed');
          return;
        }
        setSuccess(true);
      } catch {
        setError('An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    },
    [password, confirmPassword, token, t],
  );

  if (success) {
    return (
      <AuthLayout title={rp.success!.title}>
        <Box sx={{ textAlign: 'center' }}>
          <CheckCircle size={48} color="var(--mui-palette-success-main)" style={{ marginBottom: 16 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {rp.success!.description}
          </Typography>
          <Button
            component={NextLink}
            href="/auth/login"
            variant="contained"
            sx={{ textTransform: 'none' }}
          >
            {rp.success!.actionLabel}
          </Button>
        </Box>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={rp.title} subtitle={rp.subtitle}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <PasswordField
          label={rp.form.passwordLabel}
          autoComplete="new-password"
          autoFocus
          required
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 2 }}
        />

        <PasswordField
          label={rp.form.confirmPasswordLabel}
          autoComplete="new-password"
          required
          fullWidth
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          sx={{ mb: 2.5 }}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading || !password || !confirmPassword}
          sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : rp.form.submit}
        </Button>
      </Box>
    </AuthLayout>
  );
}
