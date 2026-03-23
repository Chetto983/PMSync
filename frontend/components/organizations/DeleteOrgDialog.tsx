import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeleteOrg } from '@/hooks/queries';

export function DeleteOrgDialog({
  open,
  onClose,
  orgName,
  orgId,
}: {
  open: boolean;
  onClose: () => void;
  orgName: string;
  orgId: string;
}) {
  const t = useTranslations();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const deleteOrg = useDeleteOrg();

  const getErrorMessage = (error: unknown) => (
    error instanceof Error && error.message
      ? error.message
      : t.common.genericError
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (confirmation !== orgName) return;

    try {
      await deleteOrg.mutateAsync(orgId);
      setConfirmation('');
      onClose();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  };

  const handleClose = () => {
    setConfirmation('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t.organizations.delete}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ mb: 2 }}>{t.organizations.deleteConfirm}</Typography>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
            {orgName}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={deleteOrg.isPending}
            placeholder={orgName}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={deleteOrg.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={confirmation !== orgName || deleteOrg.isPending}
            startIcon={
              deleteOrg.isPending ? <CircularProgress size={16} /> : null
            }
          >
            {t.organizations.delete}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
