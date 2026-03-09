import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Link,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordField } from '@/components/auth/PasswordField';

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const reg = t.auth.register;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (password !== confirmPassword) {
        setError(t.common.passwordMismatch);
        return;
      }
      if (!agreedToTerms) {
        setError(reg.form.termsRequired!);
        return;
      }

      setLoading(true);
      try {
        const normalizedFirstName = firstName.trim();
        const normalizedLastName = lastName.trim();
        const res = await authClient.signUp.email({
          email,
          password,
          name: `${normalizedFirstName} ${normalizedLastName}`.trim(),
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
        }, {
          body: {
            agreeToTerms: true,
          },
        });
        if (res.error) {
          setError(res.error.message || 'Registration failed');
          return;
        }
        await authClient.getSession();
        router.push('/dashboard');
      } catch {
        setError('An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    },
    [firstName, lastName, email, password, confirmPassword, agreedToTerms, router, t, reg],
  );

  return (
    <AuthLayout title={reg.title} subtitle={reg.subtitle} footerLink={reg.links!.primary}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <TextField
            label={reg.form.firstNameLabel}
            placeholder={reg.form.firstNamePlaceholder}
            autoComplete="given-name"
            autoFocus
            required
            fullWidth
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <TextField
            label={reg.form.lastNameLabel}
            placeholder={reg.form.lastNamePlaceholder}
            autoComplete="family-name"
            required
            fullWidth
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </Box>

        <TextField
          label={reg.form.emailLabel}
          type="email"
          autoComplete="email"
          required
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2 }}
        />

        <PasswordField
          label={reg.form.passwordLabel}
          autoComplete="new-password"
          required
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 2 }}
        />

        <PasswordField
          label={reg.form.confirmPasswordLabel}
          autoComplete="new-password"
          required
          fullWidth
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          sx={{ mb: 1.5 }}
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              size="small"
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              {reg.form.agreeToTerms}
              <Link component={NextLink} href="/terms" underline="hover">
                {reg.form.termsOfService}
              </Link>
              {reg.form.and}
              <Link component={NextLink} href="/privacy" underline="hover">
                {reg.form.privacyPolicy}
              </Link>
            </Typography>
          }
          sx={{ mb: 2, alignItems: 'flex-start' }}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={
            loading ||
            !email.trim() ||
            !password ||
            !confirmPassword ||
            !firstName.trim() ||
            !lastName.trim() ||
            !agreedToTerms
          }
          sx={{ py: 1.3, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={22} color="inherit" /> : reg.form.submit}
        </Button>
      </Box>
    </AuthLayout>
  );
}
