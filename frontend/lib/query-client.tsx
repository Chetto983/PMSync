'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider, HydrationBoundary, DehydratedState } from '@tanstack/react-query';
import { shouldRetryQuery } from '@/hooks/queries/query-retry';

/**
 * TanStack Query Configuration
 *
 * Best practices for Next.js (2025):
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/ssr
 *
 * 1. Create QueryClient per request on server, reuse on client
 * 2. Use staleTime > 0 to avoid immediate refetch after SSR
 * 3. Use HydrationBoundary at app level to reduce boilerplate
 * 4. gcTime >= 2000ms to avoid hydration errors
 * 5. Exponential backoff for retries
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes (min 2s to avoid hydration errors)
        // Skip replaying auth/rate-limit failures across the app shell.
        retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 3),
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 1,
        retryDelay: 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

interface QueryProviderProps {
  children: React.ReactNode;
  /** Dehydrated state from getServerSideProps for SSR hydration */
  dehydratedState?: DehydratedState;
}

/**
 * QueryProvider with optional HydrationBoundary
 * Wraps at app level to reduce boilerplate in individual pages
 */
export function QueryProvider({ children, dehydratedState }: QueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        {children}
      </HydrationBoundary>
    </QueryClientProvider>
  );
}

// Export for use in hooks and SSR prefetching
export { getQueryClient, makeQueryClient };
