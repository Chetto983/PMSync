import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  TextField,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordField } from '@/components/auth/PasswordField';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const returnTo = (router.query.returnTo as string) || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) {
          setError(res.error.message || 'Sign-in failed');
          return;
        }
        router.push(returnTo);
      } catch {
        setError('An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    },
    [email, password, returnTo, router],
  );

  const auth = t.auth.login;

  return (
    <AuthLayout
      title={auth.title}
      subtitle={auth.subtitle}
      footerLink={auth.links!.primary}
    >
      <SocialLoginButtons />
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label={auth.form.emailLabel}
          type="email"
          autoComplete="email"
          autoFocus
          required
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2 }}
        />

        <PasswordField
          label={auth.form.passwordLabel}
          autoComplete="current-password"
          required
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 0.5 }}
        />

        <Box sx={{ textAlign: 'right', mb: 2 }}>
          <Link
            component={NextLink}
            href={auth.links!.secondary!.href}
            variant="caption"
            underline="hover"
          >
            {auth.links!.secondary!.label}
          </Link>
        </Box>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading || !email || !password}
          sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : auth.form.submit}
        </Button>
      </Box>
    </AuthLayout>
  );
}
