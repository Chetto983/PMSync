import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Box, Container, Stack, Typography, IconButton, InputAdornment } from '@mui/material';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();
  const translations = useTranslations();

  const [step, setStep] = useState<'login' | 'otp'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  useEffect(() => {
    if (router.query.email) {
      setEmail(router.query.email as string);
    }
  }, [router.query.email]);

  const loginCopy = translations.auth.login;
  const otpCopy = translations.auth.otp;
  const copy = step === 'login' ? loginCopy : otpCopy;

  // Handle Caps Lock detection
  const handleKeyDown = (event: React.KeyboardEvent) => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  const handleKeyUp = (event: React.KeyboardEvent) => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      if (response.data.mfaRequired) {
        setStep('otp');
        setPassword('');
      } else {
        setToken(response.data.accessToken);
        setUser(response.data.user);
        router.push('/dashboard');
      }
    } catch (err) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || translations.common.genericError);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/verify-otp', {
        email,
        code: otp,
      });

      if (response.data.success) {
        setToken(response.data.accessToken);
        setUser(response.data.user);
        router.push('/dashboard');
      }
    } catch (err) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || translations.common.genericError);
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
            width={200}
            height={200}
            priority
          />
        </Box>
        <Card>
          <CardHeader>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" sx={{ mb: 3 }}>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === 'login' ? (
              <Stack component="form" spacing={3} onSubmit={handleLogin}>
                <Input
                  type="email"
                  label={loginCopy.form.emailLabel}
                  placeholder={translations.common.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <Box sx={{ position: 'relative' }}>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    label={loginCopy.form.passwordLabel}
                    placeholder={translations.common.passwordPlaceholder}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    required
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
                        Caps Lock is on
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Button type="submit" disabled={loading} fullWidth>
                  {loading ? translations.common.loading : loginCopy.form.submit}
                </Button>
              </Stack>
            ) : (
              <Stack component="form" spacing={3} onSubmit={handleOtpVerify}>
                <Input
                  type="email"
                  label={loginCopy.form.emailLabel}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <Input
                  type="text"
                  label={otpCopy.form.otpLabel}
                  placeholder={translations.common.otpPlaceholder}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  inputProps={{ maxLength: 6 }}
                  required
                />
                <Button type="submit" disabled={loading} fullWidth>
                  {loading ? translations.common.loading : otpCopy.form.submit}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  onClick={() => {
                    setStep('login');
                    setOtp('');
                  }}
                >
                  {translations.common.backToLogin}
                </Button>
              </Stack>
            )}

            <Stack spacing={2} sx={{ mt: 4 }}>
              {loginCopy.links?.secondary && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  <Link href={loginCopy.links.secondary.href}>{loginCopy.links.secondary.label}</Link>
                </Typography>
              )}
              {loginCopy.links?.primary && step === 'login' && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {loginCopy.form.cta}{' '}
                  <Link href={loginCopy.links.primary.href}>{loginCopy.links.primary.label}</Link>
                </Typography>
              )}
              {otpCopy.links?.primary && step === 'otp' && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  <Link href={otpCopy.links.primary.href}>{otpCopy.links.primary.label}</Link>
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
