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
 * Auth store with persist middleware for SSR-safe localStorage
 *
 * Uses skipHydration to prevent hydration mismatch errors in Next.js.
 * The persist middleware handles all localStorage operations.
 *
 * @see https://zustand.docs.pmnd.rs/integrations/persisting-store-data
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      setToken: (token: string) => {
        set({ token });
      },

      setUser: (user: User | null) => {
        set({ user });
      },

      logout: () => {
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
    }
  )
);
