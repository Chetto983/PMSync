import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import {
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Box,
  Alert,
  Snackbar,
} from '@mui/material';
import { authClient } from '@/lib/auth-client';
import { usersApi } from '@/lib/api/users';
import { useTranslations } from '@/lib/hooks/use-translations';

export function ProfileSettings() {
  const translations = useTranslations();
  const settingsCopy = translations.settings;
  const { data: session } = authClient.useSession();
  const user = session?.user as import('@/lib/auth-client').SessionUser | undefined;
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; open: boolean }>({
    type: 'success',
    open: false,
  });

  if (!user) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await usersApi.updateProfile({ firstName, lastName });
      setFeedback({ type: 'success', open: true });
    } catch (error) {
      logger.error('Failed to update profile', { error });
      setFeedback({ type: 'error', open: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseFeedback = () => {
    setFeedback((prev) => ({ ...prev, open: false }));
  };

  return (
    <Paper sx={{ p: 4 }}>
      <Typography variant="h6" gutterBottom>
        {settingsCopy.profileTitle}
      </Typography>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth
            label={settingsCopy.firstName}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <TextField
            fullWidth
            label={settingsCopy.lastName}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </Stack>
        <TextField
          fullWidth
          label={settingsCopy.emailReadonly}
          defaultValue={user.email}
          disabled
        />
        <Box>
          <Button variant="contained" onClick={handleSave} disabled={isSaving}>
            {isSaving ? settingsCopy.saving : settingsCopy.saveChanges}
          </Button>
        </Box>
      </Stack>
      <Snackbar
        open={feedback.open}
        autoHideDuration={4000}
        onClose={handleCloseFeedback}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseFeedback}
          severity={feedback.type}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {feedback.type === 'success' ? settingsCopy.successMessage : settingsCopy.errorMessage}
        </Alert>
      </Snackbar>
    </Paper>
  );
}
