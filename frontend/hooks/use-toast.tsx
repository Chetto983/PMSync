/**
 * Reusable toast notification hook using MUI Snackbar
 *
 * Provides global toast notifications for success, error, info, and warning messages.
 * Used across the application for consistent user feedback.
 *
 * @example
 * ```tsx
 * const toast = useToast();
 * toast.success('Folders synced successfully!');
 * toast.error('Sync failed. Please try again.');
 * ```
 */

import React, { useState, useCallback } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';

interface ToastState {
  open: boolean;
  message: string;
  severity: AlertColor;
}

interface ToastHookReturn {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  ToastContainer: () => React.JSX.Element;
}

/**
 * Hook for displaying toast notifications
 *
 * Returns methods to show different types of toasts and a ToastContainer component
 * that must be rendered in your component tree.
 */
export function useToast(): ToastHookReturn {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showToast = useCallback((message: string, severity: AlertColor) => {
    setToast({ open: true, message, severity });
  }, []);

  const success = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast]
  );

  const error = useCallback(
    (message: string) => showToast(message, 'error'),
    [showToast]
  );

  const info = useCallback(
    (message: string) => showToast(message, 'info'),
    [showToast]
  );

  const warning = useCallback(
    (message: string) => showToast(message, 'warning'),
    [showToast]
  );

  const handleClose = useCallback((_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  const ToastContainer = () => (
    <Snackbar
      open={toast.open}
      autoHideDuration={4000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={handleClose}
        severity={toast.severity}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  );

  return {
    success,
    error,
    info,
    warning,
    ToastContainer,
  };
}
