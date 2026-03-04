import { create } from 'zustand';

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
 * Auth store -- httpOnly cookie is the sole auth credential.
 *
 * `token` is kept as null for type compatibility with consumers that
 * read it (e.g. AuthContext). setToken is a no-op because the backend
 * sets the httpOnly cookie on login/register/refresh; the frontend
 * never needs to touch it.
 *
 * User data is stored in-memory only (fetched via /auth/me on load).
 * Logout clears the in-memory user; the httpOnly cookie is cleared
 * by the backend logout endpoint.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,

  setToken: (_token: string) => {
    /* httpOnly cookie handles auth -- no localStorage persistence */
  },

  setUser: (user: User | null) => {
    set({ user });
  },

  logout: () => {
    set({ token: null, user: null });
  },
}));
