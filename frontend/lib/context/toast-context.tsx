/**
 * Global Toast Context
 *
 * Provides toast notifications accessible from both:
 * - React components (via useGlobalToast hook)
 * - Non-React contexts like TanStack Query callbacks (via getGlobalToast)
 *
 * This solves the problem where useToast() hooks cannot be called
 * inside mutation onError callbacks which run outside React tree.
 *
 * Usage in React:
 *   const toast = useGlobalToast();
 *   toast.success('Saved!');
 *
 * Usage in TanStack Query onError:
 *   import { getGlobalToast, getGlobalTranslations } from '@/lib/context/toast-context';
 *   onError: () => { getGlobalToast().error(getGlobalTranslations().errors.sendEmailFailed); }
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Snackbar, Alert, AlertColor, Button } from '@mui/material';
import { getTranslations, type AppTranslations } from '@/locales';

interface ToastOptions {
  /** Label for the action button (e.g. "Undo") */
  actionLabel?: string;
  /** Callback when action button is clicked */
  onAction?: () => void;
  /** Auto-hide duration in ms (default 4000, use 6000 for undo toasts) */
  duration?: number;
}

interface ToastContextType {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// Singleton ref for use outside React tree (e.g., TanStack Query callbacks)
// Using a mutable ref object to avoid lint errors about reassigning module-level vars
const globalToastRef: { current: ToastContextType | null } = { current: null };

interface ToastState {
  open: boolean;
  message: string;
  severity: AlertColor;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: '',
    severity: 'info',
    duration: 4000,
  });

  const showToast = useCallback((message: string, severity: AlertColor, options?: ToastOptions) => {
    setToast({
      open: true,
      message,
      severity,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
      duration: options?.duration ?? 4000,
    });
  }, []);

  const handleClose = useCallback(() => {
    setToast((p) => ({ ...p, open: false }));
  }, []);

  const handleAction = () => {
    toast.onAction?.();
    handleClose();
  };

  // Memoize context value to avoid unnecessary re-renders
  const contextValue = useMemo<ToastContextType>(() => ({
    success: (msg, opts) => showToast(msg, 'success', opts),
    error: (msg, opts) => showToast(msg, 'error', opts),
    info: (msg, opts) => showToast(msg, 'info', opts),
    warning: (msg, opts) => showToast(msg, 'warning', opts),
  }), [showToast]);

  // Set global singleton in effect (not during render)
  useEffect(() => {
    globalToastRef.current = contextValue;
  }, [contextValue]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={toast.duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%', alignItems: 'center' }}
          action={toast.actionLabel ? (
            <Button
              color="inherit"
              size="small"
              onClick={handleAction}
              sx={{ fontWeight: 700, textTransform: 'uppercase', minWidth: 'auto' }}
            >
              {toast.actionLabel}
            </Button>
          ) : undefined}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

/**
 * Hook for use inside React components
 * @throws Error if used outside ToastProvider
 */
export function useGlobalToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useGlobalToast must be used within ToastProvider');
  return ctx;
}

// No-op toast for fallback when provider not initialized
const noOpToast: ToastContextType = {
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
};

/**
 * Function for use in non-React contexts (TanStack Query callbacks, etc.)
 * Returns no-op toast if provider not initialized
 */
export function getGlobalToast(): ToastContextType {
  return globalToastRef.current ?? noOpToast;
}

// Locale storage key (must match use-locale.ts)
const LOCALE_STORAGE_KEY = 'pmsync:locale';

/**
 * Get translations for use in non-React contexts (TanStack Query callbacks, etc.)
 * Reads current locale from localStorage and returns appropriate translations.
 *
 * Usage:
 *   import { getGlobalTranslations } from '@/lib/context/toast-context';
 *   onError: () => { getGlobalToast().error(getGlobalTranslations().errors.sendEmailFailed); }
 */
export function getGlobalTranslations(): AppTranslations {
  if (typeof window === 'undefined') {
    return getTranslations('en');
  }
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return getTranslations(stored);
}
