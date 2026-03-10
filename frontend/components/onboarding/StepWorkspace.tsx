import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { CheckCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

export function StepWorkspace({ user, onComplete, isLast }: StepProps) {
  const t = useTranslations();
  const sc = t.onboarding.stepContent?.workspace;

  const alreadyHasTenant = Boolean(user.tenantId);
  const defaultName = user.name ? `${user.name}'s Workspace` : '';

  const [workspaceName, setWorkspaceName] = useState(defaultName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = workspaceName.trim().length >= 2;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    try {
      const response = await apiClient.post('/onboarding/provision-workspace', {
        workspaceName: workspaceName.trim(),
      });
      onComplete({ tenantId: response.data.tenantId });
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
    } finally {
      setLoading(false);
    }
  };

  // User already has a workspace (email/password signup)
  if (alreadyHasTenant) {
    return (
      <Box sx={{ textAlign: 'center', maxWidth: 420, mx: 'auto' }}>
        <CheckCircle size={48} color="var(--mui-palette-success-main)" />
        <Typography variant="h5" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>
          {sc?.alreadySetUp ?? 'Your workspace is ready'}
        </Typography>
        <Button
          variant="contained"
          onClick={() => onComplete({ tenantId: user.tenantId })}
          sx={{ mt: 2 }}
        >
          {isLast ? t.onboarding.finish : t.onboarding.next}
        </Button>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleCreate} sx={{ maxWidth: 420, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {sc?.title ?? 'Create Your Workspace'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {sc?.description ?? 'A workspace is where your emails, contacts, and calendar live'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <TextField
        label={sc?.workspaceName ?? 'Workspace name'}
        placeholder={sc?.placeholder ?? 'My Workspace'}
        value={workspaceName}
        onChange={(e) => setWorkspaceName(e.target.value)}
        required
        fullWidth
        autoFocus
        inputProps={{ minLength: 2 }}
      />

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
