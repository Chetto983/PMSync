/**
 * Email Signatures Query Hooks
 *
 * TanStack Query hooks for signature CRUD operations
 */
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { signaturesApi, CreateSignatureDto, UpdateSignatureDto } from '@/lib/api/signatures';

// Query key factory
export const signatureKeys = {
  all: ['signatures'] as const,
  list: (providerId?: string) => [...signatureKeys.all, 'list', providerId] as const,
  detail: (id: string) => [...signatureKeys.all, 'detail', id] as const,
  default: (providerId?: string) => [...signatureKeys.all, 'default', providerId] as const,
};

// Query options (for prefetching, SSR)
export function signaturesListOptions(providerId?: string) {
  return queryOptions({
    queryKey: signatureKeys.list(providerId),
    queryFn: async () => {
      const response = await signaturesApi.list(providerId);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function signatureDefaultOptions(providerId?: string) {
  return queryOptions({
    queryKey: signatureKeys.default(providerId),
    queryFn: async () => {
      const response = await signaturesApi.getDefault(providerId);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
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
