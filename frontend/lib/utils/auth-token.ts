/**
 * Shared auth token extraction from Zustand persist storage.
 *
 * The auth-store uses Zustand's persist middleware which stores
 * state in localStorage under the 'auth-storage' key as:
 *   {"state":{"token":"..."},"version":0}
 *
 * This utility centralises the extraction so callers don't
 * duplicate the parsing logic or hard-code the storage key.
 */

const AUTH_STORAGE_KEY = 'auth-storage';

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return '';
    const parsed = JSON.parse(stored);
    return parsed?.state?.token || '';
  } catch {
    return '';
  }
}
