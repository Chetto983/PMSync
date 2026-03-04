import { logger } from '@/lib/logger';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface StoredUserSettings {
  theme: ThemePreference;
  language: string;
  timezone: string;
  emailNotifications: boolean;
  updatedAt?: string;
}

export const USER_SETTINGS_STORAGE_KEY = 'userSettings';
export const USER_SETTINGS_EVENT = 'pmSync:user-settings';

// Get browser timezone
const getBrowserTimezone = (): string => {
  if (typeof window === 'undefined' || !Intl?.DateTimeFormat) {
    return 'UTC';
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

// Get browser language (only 'en' or 'it' supported)
const getBrowserLanguage = (): string => {
  if (typeof window === 'undefined' || !navigator?.language) {
    return 'en';
  }
  const browserLang = navigator.language.toLowerCase();
  // Check if browser language starts with 'it' for Italian
  if (browserLang.startsWith('it')) {
    return 'it';
  }
  // Default to English for all other languages
  return 'en';
};

export const DEFAULT_USER_SETTINGS: StoredUserSettings = {
  theme: 'system',
  language: getBrowserLanguage(),
  timezone: getBrowserTimezone(),
  emailNotifications: true,
};

const isBrowser = typeof window !== 'undefined';

// Locale storage key used by useLocale hook
const LOCALE_STORAGE_KEY_READ = 'pmsync:locale';

export const getStoredUserSettings = (): StoredUserSettings => {
  if (!isBrowser) {
    return DEFAULT_USER_SETTINGS;
  }

  const raw = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
  if (!raw) {
    // Also check if pmsync:locale exists and use it
    const existingLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY_READ);
    const settings = {
      ...DEFAULT_USER_SETTINGS,
      language: existingLocale || DEFAULT_USER_SETTINGS.language,
    };
    // Sync locale key on first access
    if (!existingLocale && settings.language) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY_READ, settings.language);
    }
    return settings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUserSettings>;
    const settings = {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
    };
    // Sync locale key if settings has language but locale key is missing
    const existingLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY_READ);
    if (!existingLocale && settings.language) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY_READ, settings.language);
    }
    return settings;
  } catch (error) {
    logger.warn('Failed to parse stored user settings', { error });
    return { ...DEFAULT_USER_SETTINGS };
  }
};

export const resolveThemePreference = (
  preference: ThemePreference,
  prefersDark?: boolean,
): 'light' | 'dark' => {
  if (preference === 'system') {
    if (typeof prefersDark === 'boolean') {
      return prefersDark ? 'dark' : 'light';
    }
    if (isBrowser && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return preference;
};

const LOCALE_CHANGE_EVENT = 'pmsync:locale-change';

export const persistUserSettings = (updates: Partial<StoredUserSettings>): StoredUserSettings => {
  if (!isBrowser) {
    return { ...DEFAULT_USER_SETTINGS, ...updates };
  }

  const current = getStoredUserSettings();
  const next: StoredUserSettings = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next));

  // Sync language to pmsync:locale key used by useLocale hook
  if (updates.language) {
    window.localStorage.setItem(LOCALE_STORAGE_KEY_READ, updates.language);
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: updates.language }));
  }

  window.dispatchEvent(new CustomEvent(USER_SETTINGS_EVENT, { detail: next }));
  return next;
};

export const resetUserSettings = (): StoredUserSettings => {
  if (!isBrowser) {
    return DEFAULT_USER_SETTINGS;
  }
  window.localStorage.removeItem(USER_SETTINGS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(USER_SETTINGS_EVENT, { detail: DEFAULT_USER_SETTINGS }));
  return DEFAULT_USER_SETTINGS;
};
