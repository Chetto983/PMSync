import React, { useState } from 'react';
import {
  Button,
  Typography,
  Alert,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Trash2, ShieldAlert, Undo2 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeletionStatus, useDeletionMutation, useCancelDeletionMutation } from '@/hooks/queries';
import { SectionCard } from '@/components/settings/SectionCard';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function AccountDeletionPanel() {
  const t = useTranslations();
  const copy = t.settings.dataRights?.deletion;
  const { data: deletionStatus, isLoading, error } = useDeletionStatus();
  const deletionMutation = useDeletionMutation();
  const cancelMutation = useCancelDeletionMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRequestDeletion = () => {
    deletionMutation.mutate(undefined, {
      onSuccess: () => setConfirmOpen(false),
    });
  };

  const handleCancelDeletion = () => {
    cancelMutation.mutate();
  };

  if (isLoading) {
    return (
      <SectionCard title={copy?.title || 'Delete Account'}>
        <Skeleton variant="text" width="80%" height={20} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title={copy?.title || 'Delete Account'}>
        <Alert severity="error">{t.common.genericError}</Alert>
      </SectionCard>
    );
  }

  const isScheduled = deletionStatus?.status === 'SCHEDULED';

  return (
    <SectionCard title={copy?.title || 'Delete Account'} sx={{ borderColor: 'error.main' }}>
      {isScheduled ? (
        <>
          <Alert severity="warning" icon={<ShieldAlert size={20} />} sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {copy?.status?.SCHEDULED}
            </Typography>
            {deletionStatus?.purgeDate && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {copy?.purgeDate}: {formatDate(deletionStatus.purgeDate)}
              </Typography>
            )}
            {deletionStatus?.daysRemaining != null && (
              <Typography variant="body2">
                {deletionStatus.daysRemaining} {copy?.daysRemaining}
              </Typography>
            )}
          </Alert>

          <Button
            variant="contained"
            startIcon={<Undo2 size={18} />}
            onClick={handleCancelDeletion}
            disabled={cancelMutation.isPending}
          >
            {copy?.cancelButton}
          </Button>

          {cancelMutation.isSuccess && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {copy?.cancelSuccess}
            </Alert>
          )}
        </>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {copy?.description}
          </Typography>

          <Alert severity="warning" sx={{ mb: 2 }}>
            {copy?.warning}
          </Alert>

          <Button
            variant="outlined"
            color="error"
            startIcon={<Trash2 size={18} />}
            onClick={() => setConfirmOpen(true)}
            disabled={deletionMutation.isPending}
          >
            {copy?.requestButton}
          </Button>

          {deletionMutation.isSuccess && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {copy?.requestSuccess}
            </Alert>
          )}
        </>
      )}

      {(deletionMutation.isError || cancelMutation.isError) && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {t.common.genericError}
        </Alert>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: 'error.main' }}>
          {copy?.confirmTitle}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {copy?.confirmMessage}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={handleRequestDeletion}
            color="error"
            variant="contained"
            disabled={deletionMutation.isPending}
            startIcon={<Trash2 size={16} />}
          >
            {copy?.confirmButton}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}
