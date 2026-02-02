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
import { Snackbar, Alert, AlertColor } from '@mui/material';
import { getTranslations, type AppTranslations } from '@/locales';

interface ToastContextType {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// Singleton ref for use outside React tree (e.g., TanStack Query callbacks)
// Using a mutable ref object to avoid lint errors about reassigning module-level vars
const globalToastRef: { current: ToastContextType | null } = { current: null };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: AlertColor }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showToast = useCallback((message: string, severity: AlertColor) => {
    setToast({ open: true, message, severity });
  }, []);

  // Memoize context value to avoid unnecessary re-renders
  const contextValue = useMemo<ToastContextType>(() => ({
    success: (msg) => showToast(msg, 'success'),
    error: (msg) => showToast(msg, 'error'),
    info: (msg) => showToast(msg, 'info'),
    warning: (msg) => showToast(msg, 'warning'),
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
        autoHideDuration={4000}
        onClose={() => setToast((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
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
const LOCALE_STORAGE_KEY = 'mailagent:locale';

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
