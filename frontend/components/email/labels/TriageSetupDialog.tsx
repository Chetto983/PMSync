import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { TriageSetupForm } from './TriageSetupForm';

interface TriageSetupDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TriageSetupDialog({ open, onClose }: TriageSetupDialogProps) {
  const t = useTranslations();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {t.triageSetup.dialogTitle}
      </DialogTitle>
      <DialogContent>
        <TriageSetupForm onApplied={onClose} compact />
      </DialogContent>
    </Dialog>
  );
}

export default TriageSetupDialog;
