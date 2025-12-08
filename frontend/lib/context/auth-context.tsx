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

  // Rehydrate Zustand store from localStorage on client (one-time)
  useEffect(() => {
    if (!hasRehydratedRef.current) {
      useAuthStore.persist.rehydrate();
      hasRehydratedRef.current = true;
    }
  }, []);

  // Validate token after hydration
  useEffect(() => {
    // Wait for hydration before checking auth
    if (!isHydrated) {
      return;
    }

    let isActive = true;

    // Re-read token after hydration
    const currentToken = useAuthStore.getState().token;

    // Helper to safely set loading state
    const safeSetLoading = (value: boolean) => {
      if (isActive) {
        // Use queueMicrotask to avoid sync setState in effect (eslint react-hooks/set-state-in-effect)
        queueMicrotask(() => {
          if (isActive) setIsLoading(value);
        });
      }
    };

    if (!currentToken) {
      const existingUser = useAuthStore.getState().user;
      if (existingUser) {
        setStoreUser(null);
      }
      safeSetLoading(false);
      return () => {
        isActive = false;
      };
    }

    safeSetLoading(true);

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
          role: response.data.role,
          tenantId: response.data.tenantId,
        };

        setStoreUser(apiUser);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        logout();
      })
      .finally(() => {
        safeSetLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isHydrated, token, setStoreUser, logout]);

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
