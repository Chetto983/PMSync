import React, { useState, useCallback } from 'react';
import { useEffect } from 'react';
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

interface AuthClientError {
  code?: string;
  message?: string;
}

function isEmailVerificationError(error: AuthClientError | null | undefined) {
  const code = error?.code || '';
  const message = error?.message?.toLowerCase() || '';
  return code === 'EMAIL_NOT_VERIFIED' || message.includes('not verified');
}

function isAccountNotFoundError(error: AuthClientError | null | undefined) {
  const code = (error?.code || '').toUpperCase();
  const message = error?.message?.toLowerCase() || '';

  return (
    code === 'NOT_FOUND' ||
    code === 'USER_NOT_FOUND' ||
    code === 'ACCOUNT_NOT_FOUND' ||
    message.includes('account not found') ||
    message.includes('user not found') ||
    message.includes('email not found')
  );
}

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const returnTo = (router.query.returnTo as string) || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const socialError = typeof router.query.error === 'string' ? router.query.error : '';

    if (socialError === 'signup_disabled') {
      setError(
        t.auth.login.accountNotFoundNotice ||
          'No account was found for this email. Create an account first.',
      );
      setVerificationNotice('');
    }
  }, [router.query.error, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setVerificationNotice('');
      setLoading(true);

      try {
        const res = await authClient.signIn.email({
          email,
          password,
          callbackURL: new URL(returnTo, window.location.origin).toString(),
        });
        if (res.error) {
          if (isEmailVerificationError(res.error)) {
            setVerificationNotice(
              t.auth.login.verificationNotice?.replace('{email}', email.trim()) ||
                `Your email is not verified yet. We sent a new verification link to ${email.trim()}.`,
            );
            return;
          }

          if (isAccountNotFoundError(res.error)) {
            setError(
              t.auth.login.accountNotFoundNotice ||
                'No account was found for this email. Create an account first.',
            );
            return;
          }

          setError(t.errors.invalidCredentials);
          return;
        }
        router.push(returnTo);
      } catch {
        setError(t.common.genericError);
      } finally {
        setLoading(false);
      }
    },
    [email, password, returnTo, router, t],
  );

  const auth = t.auth.login;

  return (
    <AuthLayout
      title={auth.title}
      subtitle={auth.subtitle}
      footerLink={auth.links!.primary}
    >
      <SocialLoginButtons intent="login" />
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {verificationNotice && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {verificationNotice}
          </Alert>
        )}
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
          disabled={loading}
          sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : auth.form.submit}
        </Button>
      </Box>
    </AuthLayout>
  );
}
