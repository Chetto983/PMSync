import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash-es';
import { usersApi } from '@/lib/api/users';

const STORAGE_KEYS = {
  smartFiltersExpanded: 'sidebar-smart-filters-expanded',
  labelsExpanded: 'sidebar-labels-expanded',
  folderOrders: 'sidebar-folder-orders',
} as const;

function readJsonFromLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useEmailSidebarPreferences() {
  const [smartFiltersExpanded, setSmartFiltersExpanded] = useState<boolean>(() =>
    readJsonFromLocalStorage<boolean>(STORAGE_KEYS.smartFiltersExpanded, true)
  );

  const [labelsExpanded, setLabelsExpanded] = useState<boolean>(() =>
    readJsonFromLocalStorage<boolean>(STORAGE_KEYS.labelsExpanded, true)
  );

  const [folderOrders, setFolderOrders] = useState<Record<string, string[]>>(() =>
    readJsonFromLocalStorage<Record<string, string[]>>(STORAGE_KEYS.folderOrders, {})
  );

  const [isReady, setIsReady] = useState(false);
  const skipNextApiSaveRef = useRef(true);

  const savePreferencesToAPI = useMemo(
    () =>
      debounce(async (data: { folderOrders: Record<string, string[]>; sidebarSmartFiltersExpanded: boolean; sidebarLabelsExpanded: boolean }) => {
        try {
          await usersApi.updatePreferences(data);
        } catch {
          // Silently fail - preferences will sync on next load
        }
      }, 1000),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadPreferences = async () => {
      try {
        const preferences = await usersApi.getPreferences();
        if (cancelled) return;

        if (preferences.folderOrders) {
          setFolderOrders(preferences.folderOrders as Record<string, string[]>);
          window.localStorage.setItem(STORAGE_KEYS.folderOrders, JSON.stringify(preferences.folderOrders));
        }

        if (preferences.sidebarSmartFiltersExpanded !== undefined) {
          setSmartFiltersExpanded(preferences.sidebarSmartFiltersExpanded);
          window.localStorage.setItem(
            STORAGE_KEYS.smartFiltersExpanded,
            JSON.stringify(preferences.sidebarSmartFiltersExpanded)
          );
        }

        if (preferences.sidebarLabelsExpanded !== undefined) {
          setLabelsExpanded(preferences.sidebarLabelsExpanded);
          window.localStorage.setItem(STORAGE_KEYS.labelsExpanded, JSON.stringify(preferences.sidebarLabelsExpanded));
        }
      } catch {
        // Fall back to localStorage values already loaded in state
      } finally {
        if (cancelled) return;
        skipNextApiSaveRef.current = true;
        setIsReady(true);
      }
    };

    loadPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    window.localStorage.setItem(STORAGE_KEYS.smartFiltersExpanded, JSON.stringify(smartFiltersExpanded));
    window.localStorage.setItem(STORAGE_KEYS.labelsExpanded, JSON.stringify(labelsExpanded));
    window.localStorage.setItem(STORAGE_KEYS.folderOrders, JSON.stringify(folderOrders));

    if (skipNextApiSaveRef.current) {
      skipNextApiSaveRef.current = false;
      return;
    }

    savePreferencesToAPI({
      folderOrders,
      sidebarSmartFiltersExpanded: smartFiltersExpanded,
      sidebarLabelsExpanded: labelsExpanded,
    });
  }, [folderOrders, isReady, labelsExpanded, savePreferencesToAPI, smartFiltersExpanded]);

  useEffect(() => {
    return () => {
      savePreferencesToAPI.cancel();
    };
  }, [savePreferencesToAPI]);

  return {
    folderOrders,
    setFolderOrders,
    smartFiltersExpanded,
    setSmartFiltersExpanded,
    labelsExpanded,
    setLabelsExpanded,
  };
}

