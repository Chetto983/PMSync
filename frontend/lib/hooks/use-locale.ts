import { useCallback, useSyncExternalStore } from 'react';

const FALLBACK_LOCALE = 'en';
const LOCALE_STORAGE_KEY = 'pmsync:locale';
const LOCALE_CHANGE_EVENT = 'pmsync:locale-change';

const normalizeLocale = (value?: string | null) => {
  if (!value) {
    return FALLBACK_LOCALE;
  }

  const lower = value.toLowerCase();

  if (lower.startsWith('it')) {
    return 'it';
  }

  return 'en';
};

// Subscribe to locale changes via custom event and storage events
const subscribeToLocale = (callback: () => void) => {
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

// Get current locale from localStorage or browser detection
const getLocaleSnapshot = () => {
  if (typeof window === 'undefined') return FALLBACK_LOCALE;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return normalizeLocale(stored || navigator.language || navigator.languages?.[0]);
};

// Server snapshot always returns fallback
const getServerSnapshot = () => FALLBACK_LOCALE;

export const useLocale = () => {
  // Use useSyncExternalStore for React 18 compliant external state sync
  const locale = useSyncExternalStore(subscribeToLocale, getLocaleSnapshot, getServerSnapshot);

  const changeLocale = useCallback((newLocale: string) => {
    const normalized = normalizeLocale(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, normalized);

    // Dispatch custom event for other components using useSyncExternalStore
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: normalized }));
  }, []);

  return { locale, changeLocale };
};

export type { LocaleKey } from '@/locales';
