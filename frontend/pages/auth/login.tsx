import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  Box,
  Container,
  Stack,
  Typography,
  IconButton,
  InputAdornment,
  Button,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Alert,
} from '@mui/material';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function LoginPage() {
  const router = useRouter();
  const translations = useTranslations();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isValidEmail = useCallback(
    (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    [],
  );

  useEffect(() => {
    if (router.query.email) {
      setEmail(router.query.email as string);
    }
  }, [router.query.email]);

  const loginCopy = translations.auth.login;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  const handleKeyUp = (event: React.KeyboardEvent) => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setFieldError(translations.common.genericError);
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setFieldError(translations.common.invalidEmail);
      return;
    }

    if (trimmedPassword.length < 8) {
      setFieldError(translations.common.passwordTooShort);
      return;
    }

    setLoading(true);
    setError('');
    setFieldError(null);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (signInError) {
        const msg = signInError.message?.toLowerCase() || '';
        if (msg.includes('verify') || msg.includes('verified')) {
          setError('Please verify your email address first. Check your inbox.');
        } else {
          setError(signInError.message || translations.common.genericError);
        }
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError(translations.common.genericError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        py: 6,
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Image
            src="/Logo PMSync.svg"
            alt="PMSync logo"
            width={150}
            height={150}
            priority
          />
        </Box>
        <Card>
          <CardHeader
            title={loginCopy.title}
            subheader={loginCopy.subtitle}
          />
          <CardContent>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}
            {fieldError && !error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {fieldError}
              </Alert>
            )}

            <Stack component="form" spacing={3} onSubmit={handleLogin}>
              <TextField
                type="email"
                label={loginCopy.form.emailLabel}
                placeholder={translations.common.emailPlaceholder}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
                size="small"
              />
              <Box sx={{ position: 'relative' }}>
                <TextField
                  type={showPassword ? 'text' : 'password'}
                  label={loginCopy.form.passwordLabel}
                  placeholder={translations.common.passwordPlaceholder}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  required
                  fullWidth
                  size="small"
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={() => setShowPassword(!showPassword)}
                            onMouseDown={(e) => e.preventDefault()}
                            edge="end"
                            size="small"
                          >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                {capsLockOn && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mt: 0.5,
                      color: 'warning.main',
                      fontSize: '0.875rem',
                    }}
                  >
                    <AlertTriangle size={16} />
                    <Typography variant="caption" color="warning.main">
                      {loginCopy.capsLockWarning || 'Caps Lock is on'}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Button type="submit" variant="contained" disabled={loading} fullWidth>
                {loading ? translations.common.loading : loginCopy.form.submit}
              </Button>
            </Stack>

            <Stack spacing={2} sx={{ mt: 4 }}>
              {loginCopy.links?.secondary && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  <Link href={loginCopy.links.secondary.href}>{loginCopy.links.secondary.label}</Link>
                </Typography>
              )}
              {loginCopy.links?.primary && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {loginCopy.form.cta}{' '}
                  <Link href={loginCopy.links.primary.href}>{loginCopy.links.primary.label}</Link>
                </Typography>
              )}
            </Stack>
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
