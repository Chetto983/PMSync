/**
 * TanStack Query hook for folder metadata
 *
 * Fetches canonical folder type mappings from backend to avoid duplication.
 */

import { useQuery, queryOptions } from '@tanstack/react-query';
import { getFolderMetadata } from '@/lib/api/folders';

/**
 * Query options for folder metadata
 * Cached for 1 hour since this rarely changes
 */
export function folderMetadataOptions() {
  return queryOptions({
    queryKey: ['folders', 'metadata'],
    queryFn: getFolderMetadata,
    staleTime: 10 * 60 * 1000, // 10 minute
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
  });
}

/**
 * Hook to fetch folder metadata
 */
export function useFolderMetadata() {
  return useQuery(folderMetadataOptions());
}
