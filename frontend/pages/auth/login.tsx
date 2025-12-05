import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Box, Container, Stack, Typography, IconButton, InputAdornment, Checkbox, FormControlLabel, Divider } from '@mui/material';
import { Eye, EyeOff, AlertTriangle, Smartphone, Mail, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { mfaApi } from '@/lib/api/mfa';
import { startAuthentication } from '@simplewebauthn/browser';

type MfaMethod = 'totp' | 'email' | 'backup';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();
  const translations = useTranslations();

  const [step, setStep] = useState<'login' | 'totp' | 'email-otp' | 'backup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // MFA state
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [availableMethods, setAvailableMethods] = useState<MfaMethod[]>([]);
  const [trustDevice, setTrustDevice] = useState(false);

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
      const response = await apiClient.post('/auth/login', {
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (response.data.mfaRequired) {
        // Store MFA challenge data
        setMfaToken(response.data.mfaToken);
        const methods = (response.data.availableMethods || ['email']) as MfaMethod[];
        setAvailableMethods(methods);
        setPassword('');

        // Prefer TOTP if available (authenticator app)
        if (methods.includes('totp')) {
          setStep('totp');
        } else if (methods.includes('email')) {
          setStep('email-otp');
        } else if (methods.includes('backup')) {
          setStep('backup');
        }
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

  const handleMfaVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const trimmedCode = otp.trim();

    if (!trimmedCode) {
      setFieldError(translations.common.genericError);
      return;
    }

    // Backup codes are 8 chars, TOTP/email OTP are 6
    const expectedLength = step === 'backup' ? 8 : 6;
    if (trimmedCode.length !== expectedLength) {
      setFieldError(
        step === 'backup'
          ? translations.auth.mfa?.backupCodes?.verify?.invalid || 'Backup code must be 8 characters'
          : translations.common.otpCodeLength,
      );
      return;
    }

    setLoading(true);
    setError('');
    setFieldError(null);

    try {
      let response;

      // If we have an mfaToken, use the MFA verify endpoint (TOTP/backup flow)
      // Otherwise, use the standard OTP verify endpoint (email OTP without TOTP enabled)
      if (mfaToken) {
        const method = step === 'totp' ? 'totp' : step === 'backup' ? 'backup' : 'email';
        response = await apiClient.post('/auth/mfa/verify', {
          mfaToken,
          method,
          code: trimmedCode,
          trustDevice,
        });
      } else {
        // Standard email OTP verification (no TOTP enabled)
        response = await apiClient.post('/auth/verify-otp', {
          email: email.trim(),
          code: trimmedCode,
        });
      }

      if (response.data.accessToken || response.data.success) {
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

  // Switch to a different MFA method
  const switchMfaMethod = (method: MfaMethod) => {
    setOtp('');
    setError('');
    setFieldError(null);
    if (method === 'totp') setStep('totp');
    else if (method === 'email') setStep('email-otp');
    else if (method === 'backup') setStep('backup');
  };

  // Handle passkey/biometric login
  const handlePasskeyLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setFieldError(translations.common.invalidEmail || 'Please enter your email first');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setFieldError(translations.common.invalidEmail);
      return;
    }

    setLoading(true);
    setError('');
    setFieldError(null);

    try {
      // Get authentication options from server
      const { options, sessionId } = await mfaApi.getPasskeyLoginOptions(trimmedEmail);

      // Trigger browser WebAuthn API (Face ID, Touch ID, Windows Hello, etc.)
      const credential = await startAuthentication({ optionsJSON: options });

      // Verify with server and get tokens
      const response = await mfaApi.verifyPasskeyLogin(credential, sessionId, trustDevice);

      if (response.success && response.accessToken) {
        setToken(response.accessToken);
        // Convert null to undefined for User type compatibility
        setUser({
          ...response.user,
          firstName: response.user.firstName ?? undefined,
          lastName: response.user.lastName ?? undefined,
        });
        router.push('/dashboard');
      }
    } catch (err) {
      const errorResponse = err as { response?: { data?: { message?: string } }; message?: string; name?: string };

      // Handle WebAuthn-specific errors
      if (errorResponse.name === 'NotAllowedError') {
        setError(translations.auth.mfa?.passkeys?.cancelled || 'Authentication was cancelled');
      } else if (errorResponse.name === 'NotSupportedError') {
        setError(translations.auth.mfa?.passkeys?.notSupported || 'Passkeys are not supported on this device');
      } else {
        setError(errorResponse.response?.data?.message || errorResponse.message || translations.common.genericError);
      }
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
            {fieldError && !error && (
              <Alert variant="destructive" sx={{ mb: 3 }}>
                <AlertDescription>{fieldError}</AlertDescription>
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

                <Divider sx={{ my: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {translations.common.or || 'or'}
                  </Typography>
                </Divider>

                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  disabled={loading}
                  onClick={handlePasskeyLogin}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Fingerprint size={20} />
                  {translations.auth.mfa?.passkeys?.loginWithPasskey || 'Sign in with Passkey'}
                </Button>
              </Stack>
            ) : (
              <Stack component="form" spacing={3} onSubmit={handleMfaVerify}>
                {/* Show different label based on MFA method */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {step === 'totp' && <Smartphone size={20} />}
                  {step === 'email-otp' && <Mail size={20} />}
                  <Typography variant="body2" color="text.secondary">
                    {step === 'totp'
                      ? translations.auth.mfa?.totp?.verify?.subtitle || 'Enter the code from your authenticator app'
                      : step === 'backup'
                        ? translations.auth.mfa?.backupCodes?.verify?.subtitle || 'Enter one of your backup codes'
                        : otpCopy.subtitle}
                  </Typography>
                </Box>

                <Input
                  type="text"
                  label={
                    step === 'totp'
                      ? translations.auth.mfa?.totp?.verify?.title || 'Authenticator Code'
                      : step === 'backup'
                        ? translations.auth.mfa?.backupCodes?.verify?.title || 'Backup Code'
                        : otpCopy.form.otpLabel
                  }
                  placeholder={step === 'backup' ? 'XXXXXXXX' : '000000'}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  inputProps={{ maxLength: step === 'backup' ? 8 : 6 }}
                  required
                  autoFocus
                />

                {/* Trust this device checkbox */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      {translations.auth.mfa?.challenge?.trustDevice || 'Trust this device for 30 days'}
                    </Typography>
                  }
                />

                <Button type="submit" disabled={loading} fullWidth>
                  {loading ? translations.common.loading : translations.auth.mfa?.totp?.verify?.submit || 'Verify'}
                </Button>

                {/* MFA method switcher */}
                {availableMethods.length > 1 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" textAlign="center">
                      {translations.auth.mfa?.challenge?.switchMethod || 'Or use another method:'}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
                      {availableMethods.includes('totp') && step !== 'totp' && (
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          onClick={() => switchMfaMethod('totp')}
                        >
                          <Smartphone size={16} style={{ marginRight: 4 }} />
                          {translations.auth.mfa?.challenge?.useAuthenticator || 'Authenticator'}
                        </Button>
                      )}
                      {availableMethods.includes('email') && step !== 'email-otp' && (
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          onClick={() => switchMfaMethod('email')}
                        >
                          <Mail size={16} style={{ marginRight: 4 }} />
                          Email
                        </Button>
                      )}
                      {availableMethods.includes('backup') && step !== 'backup' && (
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          onClick={() => switchMfaMethod('backup')}
                        >
                          {translations.auth.mfa?.challenge?.useBackupCode || 'Backup Code'}
                        </Button>
                      )}
                    </Box>
                  </Box>
                )}

                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  onClick={() => {
                    setStep('login');
                    setOtp('');
                    setMfaToken(null);
                    setAvailableMethods([]);
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
              {otpCopy.links?.primary && step !== 'login' && (
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
