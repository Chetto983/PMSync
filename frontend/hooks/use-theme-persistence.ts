/**
 * useThemePersistence Hook
 *
 * Unified theme management that syncs between:
 * - Database (single source of truth)
 * - next-themes (UI rendering)
 * - localStorage (offline fallback)
 *
 * This hook eliminates the need for duplicate theme handling
 * across Layout.tsx, email.tsx, and other components.
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import { useTheme as useNextTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import { usersApi, type UserPreferences } from '@/lib/api/users';
import { authClient } from '@/lib/auth-client';
import { logger } from '@/lib/logger';
import { settingsKeys } from '@/hooks/queries/settings-keys';
import { userPreferencesOptions } from '@/hooks/queries/use-settings';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'pmsync:theme';
const THEME_STORAGE_KEY_OLD = 'pmSync:theme';
type ThemeFetchResult =
  | { status: 'success'; theme: ThemeMode | null }
  | { status: 'error' };

// Module-level singleton to prevent duplicate saves across multiple hook instances
let globalSavePromise: Promise<boolean> | null = null;

interface UseThemePersistenceReturn {
  /** Current theme mode */
  theme: ThemeMode;
  /** Resolved theme (light or dark, resolves 'system' to actual value) */
  resolvedTheme: 'light' | 'dark';
  /** Whether theme is being loaded from database */
  isLoading: boolean;
  /** Set theme (saves to database and updates UI) */
  setTheme: (theme: ThemeMode) => Promise<void>;
  /** Toggle between light and dark (ignores system) */
  toggleTheme: () => Promise<void>;
  /** Whether the resolved theme is dark mode */
  isDarkMode: boolean;
}

/**
 * Get theme from localStorage (fallback for offline/unauthenticated)
 */
function getLocalTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  // Migrate old camelCase key
  const oldStored = localStorage.getItem(THEME_STORAGE_KEY_OLD);
  if (oldStored === 'light' || oldStored === 'dark' || oldStored === 'system') {
    localStorage.setItem(THEME_STORAGE_KEY, oldStored);
    localStorage.removeItem(THEME_STORAGE_KEY_OLD);
    return oldStored;
  }
  return 'system';
}

/**
 * Save theme to localStorage (offline fallback)
 */
function setLocalTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function useThemePersistence(): UseThemePersistenceReturn {
  const { theme: nextTheme, setTheme: setNextTheme, systemTheme } = useNextTheme();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session;
  const [isLoading, setIsLoading] = useState(false);
  const isSavingRef = useRef(false);

  // Computed resolved theme
  const effectiveTheme = nextTheme === 'system' ? systemTheme : nextTheme;
  const isDarkMode = effectiveTheme === 'dark';

  /**
   * Fetch theme from database
   */
  const fetchThemeFromDB = useCallback(async (): Promise<ThemeFetchResult> => {
    if (!isAuthenticated) return { status: 'error' };

    try {
      const cachedPrefs = queryClient.getQueryData<UserPreferences>(settingsKeys.preferences());
      const prefs =
        cachedPrefs ?? (await queryClient.fetchQuery(userPreferencesOptions()));

      if (prefs.theme && ['light', 'dark', 'system'].includes(prefs.theme)) {
        return { status: 'success', theme: prefs.theme as ThemeMode };
      }

      return { status: 'success', theme: null };
    } catch (error) {
      logger.warn('[useThemePersistence] Failed to fetch theme from DB', { error });
      return { status: 'error' };
    }
  }, [isAuthenticated, queryClient]);

  /**
   * Save theme to database
   */
  const saveThemeToDB = useCallback(async (theme: ThemeMode): Promise<boolean> => {
    if (!isAuthenticated) return false;

    // Dedup: if a save is already in flight, reuse it
    if (globalSavePromise) return globalSavePromise;

    globalSavePromise = (async () => {
      try {
        isSavingRef.current = true;
        const updatedPrefs = await usersApi.updatePreferences({ theme });
        queryClient.setQueryData(settingsKeys.preferences(), updatedPrefs);
        return true;
      } catch (error) {
        logger.warn('[useThemePersistence] Failed to save theme to DB', { error });
        return false;
      } finally {
        isSavingRef.current = false;
      }
    })();

    try {
      return await globalSavePromise;
    } finally {
      globalSavePromise = null;
    }
  }, [isAuthenticated, queryClient]);

  /**
   * Load theme from database on mount/auth change
   */
  useEffect(() => {
    const loadTheme = async () => {
      // If not authenticated, use localStorage
      if (!isAuthenticated) {
        const localTheme = getLocalTheme();
        setNextTheme(localTheme);
        return;
      }

      setIsLoading(true);
      try {
        const dbTheme = await fetchThemeFromDB();

        if (dbTheme.status === 'success' && dbTheme.theme) {
          // DB theme is source of truth
          setNextTheme(dbTheme.theme);
          setLocalTheme(dbTheme.theme);
        } else {
          // No DB theme or fetch failed: use local fallback only.
          // Do not auto-write preferences on mount.
          const localTheme = getLocalTheme();
          setNextTheme(localTheme);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, [isAuthenticated, fetchThemeFromDB, saveThemeToDB, setNextTheme]);

  /**
   * Set theme - saves to DB and updates UI
   */
  const setTheme = useCallback(async (theme: ThemeMode): Promise<void> => {
    // Update UI immediately
    setNextTheme(theme);
    setLocalTheme(theme);

    // Save to DB (async, don't block UI)
    if (isAuthenticated) {
      await saveThemeToDB(theme);
    }
  }, [isAuthenticated, setNextTheme, saveThemeToDB]);

  /**
   * Toggle between light and dark
   */
  const toggleTheme = useCallback(async (): Promise<void> => {
    const newTheme: ThemeMode = effectiveTheme === 'dark' ? 'light' : 'dark';
    await setTheme(newTheme);
  }, [effectiveTheme, setTheme]);

  return {
    theme: (nextTheme as ThemeMode) || 'system',
    resolvedTheme: (effectiveTheme as 'light' | 'dark') || 'light',
    isLoading,
    setTheme,
    toggleTheme,
    isDarkMode,
  };
}

export default useThemePersistence;
