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
import { useBanUser } from '@/hooks/queries/use-admin';
import { useTranslations } from '@/lib/hooks/use-translations';

interface BanUserDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export function BanUserDialog({ open, onClose, userId, userName }: BanUserDialogProps) {
  const t = useTranslations();
  const banUser = useBanUser();
  const [reason, setReason] = useState('');
  const [expiryDays, setExpiryDays] = useState(0);

  const handleSubmit = () => {
    banUser.mutate(
      {
        userId,
        banReason: reason || undefined,
        banExpiresIn: expiryDays > 0 ? expiryDays * 86400 : undefined,
      },
      {
        onSuccess: () => {
          setReason('');
          setExpiryDays(0);
          onClose();
        },
      },
    );
  };

  const handleClose = () => {
    if (!banUser.isPending) {
      setReason('');
      setExpiryDays(0);
      banUser.reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t.admin?.users.banDialog.title} &mdash; {userName}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {banUser.isError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {(banUser.error as Error)?.message || 'Failed to ban user'}
          </Alert>
        )}
        <TextField
          label={t.admin?.users.banDialog.reason}
          placeholder={t.admin?.users.banDialog.reasonPlaceholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          rows={3}
          fullWidth
          sx={{ mt: 1 }}
        />
        <TextField
          label={t.admin?.users.banDialog.expiry}
          type="number"
          value={expiryDays}
          onChange={(e) => setExpiryDays(Math.max(0, parseInt(e.target.value) || 0))}
          inputProps={{ min: 0 }}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={banUser.isPending}>
          {t.admin?.users.banDialog.cancel}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="error"
          disabled={banUser.isPending}
          startIcon={banUser.isPending ? <CircularProgress size={16} /> : null}
        >
          {t.admin?.users.banDialog.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
