import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/material';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

export function StepNameConfirm({ user, onComplete, isLast }: StepProps) {
  const t = useTranslations();
  const sc = t.onboarding.stepContent?.name;

  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    try {
      await authClient.updateUser({
        name: `${firstName.trim()} ${lastName.trim()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      onComplete({ firstName: firstName.trim(), lastName: lastName.trim() });
    } catch (err) {
      setError(
        (err as Error).message || t.common.genericError,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 420, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {sc?.title ?? 'Confirm Your Name'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {sc?.description ?? 'This is how you will appear in PMSync'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        <TextField
          label={sc?.firstName ?? 'First name'}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          fullWidth
          autoFocus
        />
        <TextField
          label={sc?.lastName ?? 'Last name'}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          fullWidth
        />
      </Stack>

      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={!canSubmit || loading}
        sx={{ mt: 3 }}
      >
        {loading ? (
          <CircularProgress size={20} color="inherit" />
        ) : isLast ? (
          t.onboarding.finish
        ) : (
          t.onboarding.next
        )}
      </Button>
    </Box>
  );
}
