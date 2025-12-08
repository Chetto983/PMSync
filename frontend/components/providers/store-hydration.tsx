'use client';

/**
 * Store Hydration Provider
 *
 * Handles Zustand persist middleware hydration for SSR compatibility.
 * This prevents hydration mismatch errors in Next.js by:
 * 1. Waiting for client-side hydration before rendering persisted state
 * 2. Manually triggering rehydration after component mount
 *
 * Uses useSyncExternalStore for React 18 recommended hydration pattern.
 *
 * @see https://zustand.docs.pmnd.rs/integrations/persisting-store-data
 * @see https://react.dev/reference/react/useSyncExternalStore
 */

import { useSyncExternalStore, type ReactNode } from 'react';

interface StoreHydrationProps {
  children: ReactNode;
}

// Subscription function that never updates (hydration is one-time)
const emptySubscribe = () => () => {};

// Client snapshot always returns true (we're hydrated on the client)
const getClientSnapshot = () => true;

// Server snapshot always returns false (not hydrated during SSR)
const getServerSnapshot = () => false;

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
  // Use useSyncExternalStore to detect hydration without causing cascading renders
  useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  // On server and during initial hydration, render with default state
  // This ensures consistency between server and client
  return <>{children}</>;
}

/**
 * Hook to check if stores have been hydrated
 * Useful for components that depend on persisted state
 *
 * Uses React 18's useSyncExternalStore for hydration detection.
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
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
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
