import React, { createContext, useEffect, useMemo, useState, useSyncExternalStore, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, User } from '@/stores/auth-store';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  token: null,
});

// Hydration detection using useSyncExternalStore (React 18 pattern)
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setStoreUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const hasRehydratedRef = useRef(false);

  // Detect hydration using useSyncExternalStore (no cascading renders)
  const isHydrated = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  // Validate session via /auth/me using httpOnly cookie after hydration.
  // No localStorage rehydration needed -- auth is cookie-based.
  useEffect(() => {
    if (hasRehydratedRef.current) return;
    hasRehydratedRef.current = true;

    // Wait for hydration before checking auth
    if (!isHydrated) {
      return;
    }

    let isActive = true;

    // Helper to safely set loading state
    const safeSetLoading = (value: boolean) => {
      if (isActive) {
        // Use queueMicrotask to avoid sync setState in effect (eslint react-hooks/set-state-in-effect)
        queueMicrotask(() => {
          if (isActive) setIsLoading(value);
        });
      }
    };

    safeSetLoading(true);

    // The httpOnly cookie is sent automatically via withCredentials: true.
    // If cookie is missing or invalid, backend returns 401 -> logout.
    apiClient
      .get('/auth/me')
      .then((response) => {
        if (!isActive) {
          return;
        }

        const apiUser: User = {
          id: response.data.id ?? response.data.userId,
          email: response.data.email,
          firstName: response.data.firstName,
          lastName: response.data.lastName,
          avatarUrl: response.data.avatarUrl,
          role: response.data.role,
          tenantId: response.data.tenantId,
        };

        setStoreUser(apiUser);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        // No valid session cookie -- clear any stale user data
        logout();
      })
      .finally(() => {
        safeSetLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isHydrated, setStoreUser, logout]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      token,
    }),
    [user, isLoading, token],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
