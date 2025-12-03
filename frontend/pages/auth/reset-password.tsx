import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Box, Container, Stack, Typography, IconButton, InputAdornment } from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function ResetPasswordPage() {
  const router = useRouter();
  const translations = useTranslations();
  const copy = translations.auth.resetPassword;
  const { token } = router.query;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const minLength = 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword || !trimmedConfirm) {
      setError(translations.common.genericError);
      setLoading(false);
      return;
    }

    if (trimmedPassword.length < minLength) {
      setError(translations.common.passwordTooShort);
      setLoading(false);
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setError(translations.common.passwordMismatch);
      setLoading(false);
      return;
    }

    if (!token) {
      setError(translations.common.invalidToken);
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/reset-password', {
        token: Array.isArray(token) ? token[0] : token,
        newPassword: trimmedPassword,
      });

      if (response.data.success) {
        setSuccess(true);
      }
    } catch (err) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      const backendMessage = errorResponse.response?.data?.message || '';

      // Map backend error messages to localized translations
      if (backendMessage.toLowerCase().includes('different from your current password')) {
        setError(translations.common.passwordSameAsOld);
      } else if (backendMessage.toLowerCase().includes('invalid') || backendMessage.toLowerCase().includes('expired')) {
        setError(translations.common.invalidToken);
      } else {
        setError(backendMessage || translations.common.genericError);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.default',
          py: 6,
        }}
      >
        <Container maxWidth="sm">
          <Card>
            <CardHeader>
              <CardTitle>{copy.success?.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert sx={{ mb: 4 }}>
                <AlertDescription>{copy.success?.description}</AlertDescription>
              </Alert>
              <Button component={Link} href="/auth/login" fullWidth>
                {copy.success?.actionLabel}
              </Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.default',
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

            <Stack component="form" spacing={3} onSubmit={handleSubmit}>
              <Input
                type={showPassword ? 'text' : 'password'}
                label={copy.form.passwordLabel}
                placeholder={translations.common.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                label={copy.form.confirmPasswordLabel}
                placeholder={translations.common.confirmPasswordPlaceholder}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle confirm password visibility"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          onMouseDown={(e) => e.preventDefault()}
                          edge="end"
                          size="small"
                        >
                          {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <Button type="submit" disabled={loading} fullWidth>
                {loading ? translations.common.loading : copy.form.submit}
              </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
              <Link href="/auth/login">{translations.common.backToLogin}</Link>
            </Typography>
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
