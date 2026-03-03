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
import { usersApi, type UserPreferences } from '@/lib/api/users';
import { useAuth } from '@/lib/hooks/use-auth';
import { logger } from '@/lib/logger';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'pmSync:theme';
const THEME_FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Module-level singleton to prevent duplicate fetches across multiple hook instances
let globalLastFetch = 0;
let globalFetchPromise: Promise<ThemeMode | null> | null = null;
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
  const { isAuthenticated, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const isSavingRef = useRef(false);

  // Computed resolved theme
  const effectiveTheme = nextTheme === 'system' ? systemTheme : nextTheme;
  const isDarkMode = effectiveTheme === 'dark';

  /**
   * Fetch theme from database
   */
  const fetchThemeFromDB = useCallback(async (): Promise<ThemeMode | null> => {
    if (!isAuthenticated || !token) return null;

    // Dedup: if a fetch is already in flight, reuse it
    if (globalFetchPromise) return globalFetchPromise;

    // Throttle: skip if recently fetched
    if (Date.now() - globalLastFetch < THEME_FETCH_INTERVAL) return null;

    globalFetchPromise = (async () => {
      try {
        const prefs: UserPreferences = await usersApi.getPreferences();
        globalLastFetch = Date.now();
        if (prefs.theme && ['light', 'dark', 'system'].includes(prefs.theme)) {
          return prefs.theme as ThemeMode;
        }
      } catch (error) {
        logger.warn('[useThemePersistence] Failed to fetch theme from DB', { error });
      }
      return null;
    })();

    try {
      return await globalFetchPromise;
    } finally {
      globalFetchPromise = null;
    }
  }, [isAuthenticated, token]);

  /**
   * Save theme to database
   */
  const saveThemeToDB = useCallback(async (theme: ThemeMode): Promise<boolean> => {
    if (!isAuthenticated || !token) return false;

    // Dedup: if a save is already in flight, reuse it
    if (globalSavePromise) return globalSavePromise;

    globalSavePromise = (async () => {
      try {
        isSavingRef.current = true;
        await usersApi.updatePreferences({ theme });
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
  }, [isAuthenticated, token]);

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

        if (dbTheme) {
          // DB theme is source of truth
          setNextTheme(dbTheme);
          setLocalTheme(dbTheme);
        } else {
          // No DB theme, use local and save to DB
          const localTheme = getLocalTheme();
          setNextTheme(localTheme);
          await saveThemeToDB(localTheme);
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
