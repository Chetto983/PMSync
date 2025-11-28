import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { Box, Container, Stack, Typography, FormControlLabel, Checkbox } from '@mui/material';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function RegisterPage() {
  const router = useRouter();
  const translations = useTranslations();
  const copy = translations.auth.register;
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError(translations.common.passwordMismatch);
      return;
    }

    if (!agreedToTerms || !agreedToPrivacy) {
      setError('You must agree to the Terms of Service and Privacy Policy to register.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/auth/register', {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });

      if (response.data.success) {
        router.push({
          pathname: '/auth/login',
          query: { email: formData.email },
        });
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
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Input
                  type="text"
                  name="firstName"
                  label={copy.form.firstNameLabel}
                  placeholder="Alex"
                  value={formData.firstName}
                  onChange={handleChange}
                  sx={{ flex: 1 }}
                />
                <Input
                  type="text"
                  name="lastName"
                  label={copy.form.lastNameLabel}
                  placeholder="Rossi"
                  value={formData.lastName}
                  onChange={handleChange}
                  sx={{ flex: 1 }}
                />
              </Stack>

              <Input
                type="email"
                name="email"
                label={copy.form.emailLabel}
                placeholder={translations.common.emailPlaceholder}
                value={formData.email}
                onChange={handleChange}
                required
              />

              <Input
                type="password"
                name="password"
                label={copy.form.passwordLabel}
                placeholder={translations.common.passwordPlaceholder}
                value={formData.password}
                onChange={handleChange}
                required
              />

              <Input
                type="password"
                name="confirmPassword"
                label={copy.form.confirmPasswordLabel}
                placeholder={translations.common.confirmPasswordPlaceholder}
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />

              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      required
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      {copy.form.agreeToTerms}{' '}
                      <Link
                        href="/terms"
                        target="_blank"
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        {copy.form.termsOfService}
                      </Link>
                      {copy.form.and ? ` ${copy.form.and}` : ''}
                    </Typography>
                  }
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={agreedToPrivacy}
                      onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                      required
                    />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      {copy.form.agreeToTerms}{' '}
                      <Link
                        href="/privacy"
                        target="_blank"
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        {copy.form.privacyPolicy}
                      </Link>
                    </Typography>
                  }
                />
              </Stack>

              <Button type="submit" disabled={loading || !agreedToTerms || !agreedToPrivacy} fullWidth>
                {loading ? translations.common.loading : copy.form.submit}
              </Button>
            </Stack>

            {copy.links?.primary && (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                <Link href={copy.links.primary.href}>{copy.links.primary.label}</Link>
              </Typography>
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
