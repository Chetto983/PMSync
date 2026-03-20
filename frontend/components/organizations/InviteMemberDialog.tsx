import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useInviteMember } from '@/hooks/queries';

interface InviteMemberDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function InviteMemberDialog({
  open,
  onClose,
  organizationId,
}: InviteMemberDialogProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const inviteMember = useInviteMember();

  const getErrorMessage = (error: unknown) => (
    error instanceof Error && error.message
      ? error.message
      : t.common.genericError
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!email.trim()) return;

    try {
      await inviteMember.mutateAsync({
        email: email.trim(),
        organizationId,
        role: 'admin',
      });
      setSuccess(true);
      setEmail('');
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  };

  const handleClose = () => {
    setEmail('');
    setError('');
    setSuccess(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t.organizations.inviteMember}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {t.organizations.inviteSent}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            type="email"
            label={t.organizations.inviteEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={inviteMember.isPending}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={inviteMember.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!email.trim() || inviteMember.isPending}
            startIcon={
              inviteMember.isPending ? <CircularProgress size={16} /> : null
            }
          >
            {t.common.send}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
