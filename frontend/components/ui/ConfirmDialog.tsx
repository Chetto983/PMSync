/**
 * Reusable Confirm Dialog Component
 *
 * Fully customizable confirmation dialog for any action.
 * Can be used for delete, save, confirm, warning dialogs.
 *
 * @example
 * // Delete confirmation
 * <ConfirmDialog
 *   open={open}
 *   onClose={onClose}
 *   onConfirm={handleDelete}
 *   variant="danger"
 *   title="Delete Item"
 *   message="Are you sure?"
 * />
 *
 * @example
 * // Save confirmation
 * <ConfirmDialog
 *   open={open}
 *   onClose={onClose}
 *   onConfirm={handleSave}
 *   variant="primary"
 *   title="Save Changes"
 *   message="Save your changes?"
 *   confirmText="Save"
 * />
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  type DialogProps,
  type ButtonProps,
} from '@mui/material';
import { AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

// Preset variants for common use cases
type DialogVariant = 'danger' | 'warning' | 'info' | 'success' | 'primary';

const VARIANT_CONFIG: Record<DialogVariant, {
  color: ButtonProps['color'];
  iconColor: string;
  Icon: typeof AlertTriangle;
}> = {
  danger: { color: 'error', iconColor: '#f44336', Icon: AlertTriangle },
  warning: { color: 'warning', iconColor: '#ff9800', Icon: AlertCircle },
  info: { color: 'info', iconColor: '#2196f3', Icon: Info },
  success: { color: 'success', iconColor: '#4caf50', Icon: CheckCircle },
  primary: { color: 'primary', iconColor: '#1976d2', Icon: Info },
};

export interface ConfirmDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** Called when confirm button is clicked */
  onConfirm: () => void | Promise<void>;
  /** Dialog title */
  title: string;
  /** Main message text */
  message?: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Preset variant for styling */
  variant?: DialogVariant;
  /** Custom confirm button color (overrides variant) */
  confirmColor?: ButtonProps['color'];
  /** Show loading state on confirm button */
  isLoading?: boolean;
  /** Custom icon (overrides variant) */
  icon?: ReactNode;
  /** Hide the icon */
  hideIcon?: boolean;
  /** Additional content below message */
  children?: ReactNode;
  /** Dialog max width */
  maxWidth?: DialogProps['maxWidth'];
  /** Whether to show cancel button */
  showCancel?: boolean;
  /** Disabled state for confirm button */
  confirmDisabled?: boolean;
  /** Custom confirm button start icon */
  confirmStartIcon?: ReactNode;
  /** Custom confirm button end icon */
  confirmEndIcon?: ReactNode;
  /** Called when cancel is clicked (defaults to onClose) */
  onCancel?: () => void;
  /** Additional dialog props */
  DialogProps?: Partial<DialogProps>;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Conferma',
  cancelText = 'Annulla',
  variant = 'danger',
  confirmColor,
  isLoading = false,
  icon,
  hideIcon = false,
  children,
  maxWidth = 'xs',
  showCancel = true,
  confirmDisabled = false,
  confirmStartIcon,
  confirmEndIcon,
  onCancel,
  DialogProps,
}: ConfirmDialogProps) {
  const config = VARIANT_CONFIG[variant];

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      if (onCancel) {
        onCancel();
      } else {
        onClose();
      }
    }
  };

  const IconComponent = config.Icon;
  const displayIcon = hideIcon ? null : (icon ?? <IconComponent size={20} color={config.iconColor} />);

  // Determine confirm button icon
  let startIcon: ReactNode = null;
  if (isLoading) {
    startIcon = <CircularProgress size={16} color="inherit" />;
  } else if (confirmStartIcon) {
    startIcon = confirmStartIcon;
  }

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {displayIcon}
          <Typography variant="h6" component="span">
            {title}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {message && <DialogContentText>{message}</DialogContentText>}
        {children}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {showCancel && (
          <Button onClick={handleCancel} disabled={isLoading} color="inherit">
            {cancelText}
          </Button>
        )}
        <Button
          onClick={onConfirm}
          disabled={isLoading || confirmDisabled}
          variant="contained"
          color={confirmColor ?? config.color}
          startIcon={startIcon}
          endIcon={confirmEndIcon}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmDialog;
