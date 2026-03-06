import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  CardHeader,
  Alert,
  CircularProgress,
} from '@mui/material';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function VerifyEmailPage() {
  const router = useRouter();
  const translations = useTranslations();
  const { sent, token } = router.query;

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!token || typeof token !== 'string') return;
    if (status !== 'idle') return;

    setStatus('loading');

    authClient.verifyEmail({ query: { token } }).then(({ error }) => {
      if (error) {
        setStatus('error');
        setErrorMsg(error.message || translations.common.genericError);
      } else {
        setStatus('success');
        // autoSignInAfterVerification handles session; redirect to dashboard
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    }).catch(() => {
      setStatus('error');
      setErrorMsg(translations.common.genericError);
    });
  }, [router.isReady, token, status, translations.common.genericError, router]);

  // Mode 1: "Check your email" confirmation after signup
  if (sent === '1' && !token) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', py: 6 }}>
        <Container maxWidth="sm">
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Image src="/Logo PMSync.svg" alt="PMSync logo" width={150} height={150} priority />
          </Box>
          <Card>
            <CardHeader title="Check your email" />
            <CardContent>
              <Alert severity="info" sx={{ mb: 3 }}>
                We sent a verification link to your email address. Please check your inbox and click
                the link to verify your account.
              </Alert>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                <Link href="/auth/login">{translations.common.backToLogin}</Link>
              </Typography>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  // Mode 2: Token verification callback
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', py: 6 }}>
      <Container maxWidth="sm">
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Image src="/Logo PMSync.svg" alt="PMSync logo" width={150} height={150} priority />
        </Box>
        <Card>
          <CardHeader title="Email Verification" />
          <CardContent>
            {status === 'loading' && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}
            {status === 'success' && (
              <Alert severity="success" sx={{ mb: 3 }}>
                Your email has been verified. Redirecting to dashboard...
              </Alert>
            )}
            {status === 'error' && (
              <>
                <Alert severity="error" sx={{ mb: 3 }}>
                  {errorMsg}
                </Alert>
                <Button component={Link} href="/auth/login" variant="contained" fullWidth>
                  {translations.common.backToLogin}
                </Button>
              </>
            )}
            {status === 'idle' && !token && (
              <>
                <Alert severity="warning" sx={{ mb: 3 }}>
                  {translations.common.invalidToken || 'No verification token provided.'}
                </Alert>
                <Button component={Link} href="/auth/login" variant="contained" fullWidth>
                  {translations.common.backToLogin}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

// Force SSR to avoid NextRouter SSR errors
export const getServerSideProps = async () => {
  return { props: {} };
};
