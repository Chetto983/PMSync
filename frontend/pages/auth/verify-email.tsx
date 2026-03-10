import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle, Mail, XCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from '@/components/auth/AuthLayout';

type VerifyState = 'verifying' | 'success' | 'error' | 'resend';

export default function VerifyEmailPage() {
  const t = useTranslations();
  const router = useRouter();
  const ve = t.auth?.verifyEmail;

  const [state, setState] = useState<VerifyState>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Auto-verify if token is present in URL query (from verification email link)
  useEffect(() => {
    if (!router.isReady) return;

    const { token } = router.query;
    if (!token || typeof token !== 'string') {
      // No token — show resend form
      setState('resend');
      return;
    }

    // Token present — attempt verification via better-auth
    // The auth proxy forwards to /api/auth/verify-email?token=...
    (async () => {
      try {
        const res = await authClient.verifyEmail({ query: { token } });
        if (res.error) {
          setState('error');
          setErrorMessage(res.error.message || 'Verification failed');
          return;
        }
        setState('success');
        // Redirect to dashboard after short delay
        setTimeout(() => router.push('/dashboard'), 2000);
      } catch {
        setState('error');
        setErrorMessage(ve?.failed || 'Verification failed. The link may have expired.');
      }
    })();
  }, [router.isReady, router.query, router, ve]);

  const handleResend = useCallback(async () => {
    if (!resendEmail.trim() || resending) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await authClient.sendVerificationEmail({
        email: resendEmail.trim(),
        callbackURL: new URL('/dashboard', window.location.origin).toString(),
      });
      setResendSuccess(true);
    } catch {
      // Silently succeed to avoid email enumeration
      setResendSuccess(true);
    } finally {
      setResending(false);
    }
  }, [resendEmail, resending]);

  return (
    <AuthLayout
      title={ve?.title || 'Email Verification'}
      subtitle={ve?.subtitle || 'Verify your email to access your account'}
    >
      {state === 'verifying' && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={40} />
          <Typography sx={{ mt: 2 }}>
            {ve?.verifying || 'Verifying your email...'}
          </Typography>
        </Box>
      )}

      {state === 'success' && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <CheckCircle size={48} color="var(--mui-palette-success-main)" />
          <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
            {ve?.successTitle || 'Email verified!'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {ve?.successDescription || 'Redirecting you to the dashboard...'}
          </Typography>
          <Button
            component={NextLink}
            href="/dashboard"
            variant="contained"
            fullWidth
            size="large"
            sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            {ve?.goToDashboard || 'Go to dashboard'}
          </Button>
        </Box>
      )}

      {state === 'error' && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <XCircle size={48} color="var(--mui-palette-error-main)" />
          <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
            {ve?.errorTitle || 'Verification failed'}
          </Typography>
          <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
            {errorMessage || ve?.failed || 'The verification link may have expired.'}
          </Alert>
          <Button
            onClick={() => setState('resend')}
            variant="outlined"
            fullWidth
            size="large"
            sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600, mb: 2 }}
          >
            {ve?.resend || 'Resend verification email'}
          </Button>
          <Button
            component={NextLink}
            href="/auth/login"
            variant="text"
            fullWidth
          >
            {t.common.backToLogin}
          </Button>
        </Box>
      )}

      {state === 'resend' && (
        <Box sx={{ py: 2 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Mail size={48} style={{ opacity: 0.7 }} />
          </Box>
          <Typography color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            {ve?.resendDescription ||
              'Enter your email address and we will send you a new verification link.'}
          </Typography>
          {resendSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {ve?.resendSuccess ||
                'If an account exists with this email, a verification link has been sent.'}
            </Alert>
          )}
          <TextField
            label={ve?.emailLabel || 'Email address'}
            type="email"
            autoComplete="email"
            required
            fullWidth
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            onClick={handleResend}
            variant="contained"
            fullWidth
            size="large"
            disabled={resending || !resendEmail.trim()}
            sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600, mb: 2 }}
          >
            {resending
              ? <CircularProgress size={20} color="inherit" />
              : ve?.resendButton || 'Send verification email'}
          </Button>
          <Button
            component={NextLink}
            href="/auth/login"
            variant="text"
            fullWidth
          >
            {t.common.backToLogin}
          </Button>
        </Box>
      )}
    </AuthLayout>
  );
}
