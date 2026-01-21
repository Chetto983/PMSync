import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  role: string;
  tenantId: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setToken: (token: string) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

/**
 * Helper to set/remove auth token cookie
 * Used by Next.js API routes for img src authentication (e.g., inline attachments)
 * Cookie is httpOnly: false so it can be read by the API route
 */
function setAuthCookie(token: string | null) {
  if (typeof document === 'undefined') return;

  if (token) {
    // Set cookie with SameSite=Lax for same-origin requests, 7 day expiry
    document.cookie = `auth-token=${encodeURIComponent(token)}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  } else {
    // Remove cookie by setting expired date
    document.cookie = 'auth-token=; path=/; max-age=0';
  }
}

/**
 * Auth store with persist middleware for SSR-safe localStorage
 *
 * Uses skipHydration to prevent hydration mismatch errors in Next.js.
 * The persist middleware handles all localStorage operations.
 *
 * Also sets auth token as a cookie for Next.js API routes that need to
 * authenticate requests from img src tags (which can't add headers).
 *
 * @see https://zustand.docs.pmnd.rs/integrations/persisting-store-data
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      setToken: (token: string) => {
        setAuthCookie(token);
        set({ token });
      },

      setUser: (user: User | null) => {
        set({ user });
      },

      logout: () => {
        setAuthCookie(null);
        set({ token: null, user: null });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist token, not user (user comes from API)
      partialize: (state) => ({ token: state.token }),
      // Skip hydration on server, manually rehydrate on client
      skipHydration: typeof window === 'undefined',
      // Sync cookie when localStorage is rehydrated
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          setAuthCookie(state.token);
        }
      },
    }
  )
);
