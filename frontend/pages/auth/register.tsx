import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  Box,
  Container,
  Stack,
  Typography,
  FormControlLabel,
  Checkbox,
  IconButton,
  InputAdornment,
  Button,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Alert,
} from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
// Legal acceptance moved server-side (AuthService.register)
import { useTranslations } from '@/lib/hooks/use-translations';

const REGISTER_FORM_STORAGE_KEY = 'pmsync-register-form';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const returnToPath = '/auth/register';

  // Hydrate form from sessionStorage so leaving for terms/privacy preserves state
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(REGISTER_FORM_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({
          ...prev,
          ...parsed.formData,
        }));
        if (typeof parsed.agreedToTerms === 'boolean') setAgreedToTerms(parsed.agreedToTerms);
        if (typeof parsed.agreedToPrivacy === 'boolean') setAgreedToPrivacy(parsed.agreedToPrivacy);
      }
    } catch {
      // ignore malformed storage
    }
    setHasHydrated(true);
  }, []);

  // Persist form to sessionStorage on change
  useEffect(() => {
    if (!hasHydrated) return;
    try {
      sessionStorage.setItem(
        REGISTER_FORM_STORAGE_KEY,
        JSON.stringify({
          formData,
          agreedToTerms,
          agreedToPrivacy,
        }),
      );
    } catch {
      // storage unavailable; ignore
    }
  }, [formData, agreedToTerms, agreedToPrivacy, hasHydrated]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    const trimmed = {
      email: formData.email.trim(),
      password: formData.password.trim(),
      confirmPassword: formData.confirmPassword.trim(),
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
    };

    if (!trimmed.email || !trimmed.password || !trimmed.confirmPassword) {
      setError(translations.common.genericError);
      return;
    }

    if (trimmed.password.length < 8) {
      setError(translations.common.passwordTooShort);
      return;
    }

    if (trimmed.password !== trimmed.confirmPassword) {
      setError(translations.common.passwordMismatch);
      return;
    }

    if (!agreedToTerms || !agreedToPrivacy) {
      setError(copy.form?.termsRequired || 'You must agree to the Terms of Service and Privacy Policy to register.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiClient.post('/auth/register', {
        email: trimmed.email,
        password: trimmed.password,
        firstName: trimmed.firstName,
        lastName: trimmed.lastName,
      });

      if (response.data.success) {
        // Legal acceptance (ToS + Privacy Policy) is now handled server-side during registration.
        // See AuthService.register() — no need for a separate frontend call.
        sessionStorage.removeItem(REGISTER_FORM_STORAGE_KEY);
        router.push({
          pathname: '/auth/login',
          query: { email: formData.email, step: 'email-otp', from: 'register' },
        });
      }
    } catch (err) {
      const errorResponse = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
      setError(errorResponse.response?.data?.error?.message || errorResponse.response?.data?.message || translations.common.genericError);
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
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  type="text"
                  name="firstName"
                  label={copy.form.firstNameLabel}
                  placeholder="Alex"
                  value={formData.firstName}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                />
                <TextField
                  type="text"
                  name="lastName"
                  label={copy.form.lastNameLabel}
                  placeholder="Rossi"
                  value={formData.lastName}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                />
              </Stack>

              <TextField
                type="email"
                name="email"
                label={copy.form.emailLabel}
                placeholder={translations.common.emailPlaceholder}
                value={formData.email}
                onChange={handleChange}
                required
                fullWidth
                size="small"
              />

              <TextField
                type={showPassword ? 'text' : 'password'}
                name="password"
                label={copy.form.passwordLabel}
                placeholder={translations.common.passwordPlaceholder}
                value={formData.password}
                onChange={handleChange}
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

              <TextField
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                label={copy.form.confirmPasswordLabel}
                placeholder={translations.common.confirmPasswordPlaceholder}
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                fullWidth
                size="small"
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
                        href={{ pathname: '/terms', query: { from: returnToPath } }}
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
                        href={{ pathname: '/privacy', query: { from: returnToPath } }}
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        {copy.form.privacyPolicy}
                      </Link>
                    </Typography>
                  }
                />
              </Stack>

              <Button type="submit" variant="contained" disabled={loading || !agreedToTerms || !agreedToPrivacy} fullWidth>
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
