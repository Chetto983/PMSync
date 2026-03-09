import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default function TwoFactorPage() {
  const t = useTranslations();
  const router = useRouter();
  const tf = t.auth.twoFactorVerify;

  const [code, setCode] = useState('');
  const [isBackupMode, setIsBackupMode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const res = isBackupMode
          ? await authClient.twoFactor.verifyBackupCode({ code })
          : await authClient.twoFactor.verifyTotp({ code });

        if (res.error) {
          setError(res.error.message || tf.error);
          return;
        }
        router.push('/dashboard');
      } catch {
        setError(tf.error);
      } finally {
        setLoading(false);
      }
    },
    [code, isBackupMode, router, tf.error],
  );

  return (
    <AuthLayout
      title={tf.title}
      subtitle={tf.subtitle}
      footerLink={{ href: '/auth/login', label: t.common.backToLogin }}
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isBackupMode ? (
          <TextField
            label={tf.backupCodeLabel}
            placeholder={tf.backupCodePlaceholder}
            autoFocus
            required
            fullWidth
            value={code}
            onChange={(e) => setCode(e.target.value)}
            sx={{ mb: 2 }}
          />
        ) : (
          <TextField
            label={tf.codeLabel}
            placeholder={tf.codePlaceholder}
            autoFocus
            required
            fullWidth
            value={code}
            onChange={(e) => {
              // Only allow digits, max 6
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(val);
            }}
            inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
            sx={{ mb: 2 }}
          />
        )}

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading || !code.trim()}
          sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600, mb: 2 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : tf.verify}
        </Button>

        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2">
            <Link
              component="button"
              type="button"
              variant="body2"
              underline="hover"
              onClick={() => {
                setIsBackupMode(!isBackupMode);
                setCode('');
                setError('');
              }}
            >
              {isBackupMode ? tf.useAuthenticator : tf.useBackupCode}
            </Link>
          </Typography>
        </Box>
      </Box>
    </AuthLayout>
  );
}
