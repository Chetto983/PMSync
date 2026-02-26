import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  complianceApi,
  type DataExportResponse,
  type AcceptLegalDocumentPayload,
} from '@/lib/api/compliance';

// ===== QUERY KEYS =====

export const dataRightsKeys = {
  all: ['dataRights'] as const,
  exports: () => [...dataRightsKeys.all, 'exports'] as const,
  deletionStatus: () => [...dataRightsKeys.all, 'deletion'] as const,
  legalStatus: () => [...dataRightsKeys.all, 'legal'] as const,
};

// ===== DATA EXPORT HOOKS =====

export function dataExportsOptions(refetchInterval?: number | false) {
  return queryOptions({
    queryKey: dataRightsKeys.exports(),
    queryFn: () => complianceApi.listExports(),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval,
  });
}

/**
 * Hook to fetch list of data exports.
 * Polls every 5s when any export is PENDING or PROCESSING.
 */
export function useDataExports() {
  const query = useQuery(dataExportsOptions(false));
  const data = Array.isArray(query.data) ? query.data : [];
  const hasPendingExport = data.some(
    (e: DataExportResponse) => e.status === 'PENDING' || e.status === 'PROCESSING',
  );

  return useQuery(dataExportsOptions(hasPendingExport ? 5000 : false));
}

export function useExportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => complianceApi.requestExport(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataRightsKeys.exports() });
    },
  });
}

// ===== DELETION HOOKS =====

export function deletionStatusOptions() {
  return queryOptions({
    queryKey: dataRightsKeys.deletionStatus(),
    queryFn: () => complianceApi.getDeletionStatus(),
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useDeletionStatus() {
  return useQuery(deletionStatusOptions());
}

export function useDeletionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => complianceApi.requestDeletion(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataRightsKeys.deletionStatus() });
    },
  });
}

export function useCancelDeletionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => complianceApi.cancelDeletion(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataRightsKeys.deletionStatus() });
    },
  });
}

// ===== LEGAL STATUS HOOKS =====

export function legalStatusOptions() {
  return queryOptions({
    queryKey: dataRightsKeys.legalStatus(),
    queryFn: () => complianceApi.getLegalStatus(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useLegalStatus() {
  return useQuery(legalStatusOptions());
}

export function useLegalAcceptMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AcceptLegalDocumentPayload) => complianceApi.acceptLegalDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataRightsKeys.legalStatus() });
    },
  });
}
