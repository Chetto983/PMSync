/**
 * Email Signatures Query Hooks
 *
 * TanStack Query hooks for signature CRUD operations
 * NOTE: Gracefully handles 404 errors when endpoint not available
 */
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import axios from 'axios';
import { signaturesApi, CreateSignatureDto, UpdateSignatureDto, EmailSignature } from '@/lib/api/signatures';

// Query key factory
export const signatureKeys = {
  all: ['signatures'] as const,
  list: (providerId?: string) => [...signatureKeys.all, 'list', providerId] as const,
  detail: (id: string) => [...signatureKeys.all, 'detail', id] as const,
  default: (providerId?: string) => [...signatureKeys.all, 'default', providerId] as const,
};

// Helper to check if error is 404
function is404Error(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

// Query options (for prefetching, SSR)
export function signaturesListOptions(providerId?: string) {
  return queryOptions({
    queryKey: signatureKeys.list(providerId),
    queryFn: async (): Promise<EmailSignature[]> => {
      try {
        const response = await signaturesApi.list(providerId);
        return response.data;
      } catch (error) {
        // Return empty array if endpoint doesn't exist (404)
        if (is404Error(error)) {
          // Silently handle 404 - endpoint may not be available yet
          return [];
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry 404 errors
      if (is404Error(error)) return false;
      return failureCount < 3;
    },
  });
}

export function signatureDefaultOptions(providerId?: string) {
  return queryOptions({
    queryKey: signatureKeys.default(providerId),
    queryFn: async (): Promise<EmailSignature | null> => {
      try {
        const response = await signaturesApi.getDefault(providerId);
        return response.data;
      } catch (error) {
        // Return null if endpoint doesn't exist (404)
        if (is404Error(error)) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (is404Error(error)) return false;
      return failureCount < 3;
    },
  });
}

// Hooks
export function useSignatures(providerId?: string) {
  return useQuery(signaturesListOptions(providerId));
}

export function useDefaultSignature(providerId?: string) {
  return useQuery(signatureDefaultOptions(providerId));
}

export function useSignature(id: string) {
  return useQuery({
    queryKey: signatureKeys.detail(id),
    queryFn: async () => {
      const response = await signaturesApi.get(id);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateSignatureDto) => {
      const response = await signaturesApi.create(dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all });
    },
  });
}

export function useUpdateSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateSignatureDto }) => {
      const response = await signaturesApi.update(id, dto);
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all });
      queryClient.invalidateQueries({ queryKey: signatureKeys.detail(id) });
    },
  });
}

export function useDeleteSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await signaturesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all });
    },
  });
}

export function useSetDefaultSignature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await signaturesApi.setDefault(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all });
    },
  });
}
