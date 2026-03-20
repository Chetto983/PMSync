import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Alert,
  CircularProgress,
} from '@mui/material';
import { PasswordField } from '@/components/auth/PasswordField';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AccountInfo {
  providerId: string;
}

export function SecurityPasswordSection() {
  const t = useTranslations();
  const sec = t.settings.securityPanel?.password;

  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const result = await authClient.listAccounts();
        if (result?.data) {
          const accounts = result.data as AccountInfo[];
          setHasPassword(accounts.some((a) => a.providerId === 'credential'));
        }
      } catch {
        // Fail silently - default to showing change password form
        setHasPassword(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const validate = useCallback((): string | null => {
    if (newPassword.length < 8) {
      return sec?.tooShort || 'Password must be at least 8 characters';
    }
    if (newPassword !== confirmPassword) {
      return sec?.mismatch || 'Passwords do not match';
    }
    return null;
  }, [confirmPassword, newPassword, sec?.mismatch, sec?.tooShort]);

  const handleChangePassword = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if (result?.error) {
        setError(result.error.message || 'Failed to change password');
      } else {
        setSuccess(sec?.success || 'Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setError('Failed to change password');
    } finally {
      setSaving(false);
    }
  }, [currentPassword, newPassword, sec?.success, validate]);

  const handleSetPassword = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      // setPassword exists at runtime but isn't typed (requires open-api plugin type)
      const result = await (authClient as unknown as { setPassword: (opts: { newPassword: string }) => Promise<{ error?: { message: string } }> }).setPassword({ newPassword });
      if (result?.error) {
        setError(result.error.message || 'Failed to set password');
      } else {
        setSuccess(sec?.success || 'Password updated successfully');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true);
      }
    } catch {
      setError('Failed to set password');
    } finally {
      setSaving(false);
    }
  }, [newPassword, sec?.success, validate]);

  if (loading) {
    return <Box sx={{ py: 2 }}><CircularProgress size={24} /></Box>;
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        {sec?.title || 'Password'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {sec?.description || 'Change your account password'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent sx={{ p: 3 }}>
          {hasPassword ? (
            <Box component="form" onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
              <PasswordField
                label={sec?.currentPassword || 'Current password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
                sx={{ mb: 2 }}
              />
              <PasswordField
                label={sec?.newPassword || 'New password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                sx={{ mb: 2 }}
              />
              <PasswordField
                label={sec?.confirmPassword || 'Confirm new password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                sx={{ mb: 2 }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                startIcon={saving ? <CircularProgress size={16} /> : undefined}
              >
                {sec?.change || 'Change Password'}
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSetPassword(); }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                {sec?.setDescription || 'You signed up with a social account. Set a password to also sign in with email.'}
              </Alert>
              <PasswordField
                label={sec?.newPassword || 'New password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                sx={{ mb: 2 }}
              />
              <PasswordField
                label={sec?.confirmPassword || 'Confirm new password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                sx={{ mb: 2 }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !newPassword || !confirmPassword}
                startIcon={saving ? <CircularProgress size={16} /> : undefined}
              >
                {sec?.set || 'Set Password'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
