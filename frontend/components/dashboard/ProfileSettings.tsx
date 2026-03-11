import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import {
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Box,
} from '@mui/material';
import { authClient } from '@/lib/auth-client';
import { usersApi } from '@/lib/api/users';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGlobalToast } from '@/lib/context/toast-context';

export function ProfileSettings() {
  const translations = useTranslations();
  const settingsCopy = translations.settings;
  const toast = useGlobalToast();
  const { data: session } = authClient.useSession();
  const user = session?.user as import('@/lib/auth-client').SessionUser | undefined;
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await usersApi.updateProfile({ firstName, lastName });
      toast.success(settingsCopy.successMessage);
    } catch (error) {
      logger.error('Failed to update profile', { error });
      toast.error(settingsCopy.errorMessage);
    } finally {
      setIsSaving(false);
    }
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
    </Paper>
  );
}
