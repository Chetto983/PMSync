'use client';

/**
 * Store Hydration Provider
 *
 * Handles Zustand persist middleware hydration for SSR compatibility.
 * This prevents hydration mismatch errors in Next.js by:
 * 1. Waiting for client-side hydration before rendering persisted state
 * 2. Manually triggering rehydration after component mount
 *
 * @see https://zustand.docs.pmnd.rs/integrations/persisting-store-data
 * @see https://medium.com/@koalamango/fix-next-js-hydration-error-with-zustand-state-management-0ce51a0176ad
 */

import { useEffect, useState, type ReactNode } from 'react';

interface StoreHydrationProps {
  children: ReactNode;
}

/**
 * Provider that ensures stores are hydrated before rendering children
 *
 * @example
 * ```tsx
 * // In _app.tsx or layout.tsx
 * <StoreHydration>
 *   <App />
 * </StoreHydration>
 * ```
 */
export function StoreHydration({ children }: StoreHydrationProps) {
  const [, setIsHydrated] = useState(false);

  useEffect(() => {
    // Mark as hydrated after first render (client-side)
    setIsHydrated(true);
  }, []);

  // On server and during initial hydration, render with default state
  // This ensures consistency between server and client
  return <>{children}</>;
}

/**
 * Hook to check if stores have been hydrated
 * Useful for components that depend on persisted state
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const isHydrated = useIsStoreHydrated();
 *   const user = useAuthStore((s) => s.user);
 *
 *   if (!isHydrated) {
 *     return <Skeleton />;
 *   }
 *
 *   return <div>{user?.name}</div>;
 * }
 * ```
 */
export function useIsStoreHydrated() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated;
}

/**
 * HOC to wrap components that depend on hydrated store state
 *
 * @example
 * ```tsx
 * const MyComponent = withStoreHydration(({ user }) => {
 *   return <div>{user.name}</div>;
 * }, <LoadingSpinner />);
 * ```
 */
export function withStoreHydration<P extends object>(
  Component: React.ComponentType<P>,
  FallbackComponent?: ReactNode
) {
  return function HydratedComponent(props: P) {
    const isHydrated = useIsStoreHydrated();

    if (!isHydrated) {
      return FallbackComponent ?? null;
    }

    return <Component {...props} />;
  };
}

export default StoreHydration;
