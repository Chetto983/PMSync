/**
 * Form Dialog Component
 *
 * Reusable dialog component for forms following the common dialog pattern.
 * Consistent with ConfirmDialog visual design.
 */

import React, { ReactNode } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  type DialogProps as MuiDialogProps,
} from '@mui/material';

export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  title: string;
  icon?: ReactNode;
  submitText: string;
  cancelText: string;
  isLoading?: boolean;
  submitDisabled?: boolean;
  children: ReactNode;
  maxWidth?: MuiDialogProps['maxWidth'];
  DialogProps?: Partial<MuiDialogProps>;
}

export function FormDialog({
  open,
  onClose,
  onSubmit,
  title,
  icon,
  submitText,
  cancelText,
  isLoading = false,
  submitDisabled = false,
  children,
  maxWidth = 'xs',
  DialogProps,
}: FormDialogProps) {
  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const handleSubmit = () => {
    if (!isLoading && !submitDisabled) {
      onSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={maxWidth}
      fullWidth
      {...DialogProps}
      slotProps={{
        paper: { sx: { borderRadius: 2 } },
        ...DialogProps?.slotProps,
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon}
          <Typography variant="h6" component="span">
            {title}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 3 }}>{children}</DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isLoading} color="inherit">
          {cancelText}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading || submitDisabled}
          variant="contained"
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {submitText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FormDialog;
