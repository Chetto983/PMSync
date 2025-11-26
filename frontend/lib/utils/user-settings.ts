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

const readLegacyTheme = (): ThemePreference => {
  if (!isBrowser) {
    return DEFAULT_USER_SETTINGS.theme;
  }
  const legacyTheme = window.localStorage.getItem('pmSyncTheme');
  if (legacyTheme === 'light' || legacyTheme === 'dark') {
    return legacyTheme;
  }
  return DEFAULT_USER_SETTINGS.theme;
};

export const getStoredUserSettings = (): StoredUserSettings => {
  if (!isBrowser) {
    return DEFAULT_USER_SETTINGS;
  }

  const raw = window.localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return {
      ...DEFAULT_USER_SETTINGS,
      theme: readLegacyTheme(),
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUserSettings>;
    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.warn('Failed to parse stored user settings:', error);
    return {
      ...DEFAULT_USER_SETTINGS,
      theme: readLegacyTheme(),
    };
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

  if (next.theme) {
    // Keep legacy key in sync for any other code still referencing it
    const resolved = resolveThemePreference(next.theme);
    window.localStorage.setItem('pmSyncTheme', resolved);
  }

  window.dispatchEvent(new CustomEvent(USER_SETTINGS_EVENT, { detail: next }));
  return next;
};

export const resetUserSettings = (): StoredUserSettings => {
  if (!isBrowser) {
    return DEFAULT_USER_SETTINGS;
  }
  window.localStorage.removeItem(USER_SETTINGS_STORAGE_KEY);
  window.localStorage.removeItem('pmSyncTheme');
  window.dispatchEvent(new CustomEvent(USER_SETTINGS_EVENT, { detail: DEFAULT_USER_SETTINGS }));
  return DEFAULT_USER_SETTINGS;
};
