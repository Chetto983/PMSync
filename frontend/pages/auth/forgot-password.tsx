import React, { useState } from 'react';
import Link from 'next/link';
import { Box, Container, Stack, Typography } from '@mui/material';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function ForgotPasswordPage() {
  const translations = useTranslations();
  const copy = translations.auth.forgotPassword;
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(translations.common.genericError);
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError('Invalid email');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post('/auth/forgot-password', { email: trimmedEmail });

      if (response.data.success) {
        setSuccess(true);
      }
    } catch (err) {
      const errorResponse = err as { response?: { data?: { message?: string } } };
      setError(errorResponse.response?.data?.message || translations.common.genericError);
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
                type="email"
                label={copy.form.emailLabel}
                placeholder={translations.common.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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

// Force SSR to avoid static generation errors
export const getServerSideProps = async () => {
  return { props: {} };
};
