import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Box,
  Container,
  Stack,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Alert,
} from '@mui/material';
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
            <CardHeader title={copy.success?.title} />
            <CardContent>
              <Alert severity="success" sx={{ mb: 4 }}>
                {copy.success?.description}
              </Alert>
              <Button component={Link} href="/auth/login" variant="contained" fullWidth>
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
          <CardHeader
            title={copy.title}
            subheader={copy.subtitle}
          />
          <CardContent>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <Stack component="form" spacing={3} onSubmit={handleSubmit}>
              <TextField
                type="email"
                label={copy.form.emailLabel}
                placeholder={translations.common.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                size="small"
              />

              <Button type="submit" variant="contained" disabled={loading} fullWidth>
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
