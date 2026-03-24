import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmPipelinesApi,
  type CreatePipelineDto,
  type UpdatePipelineDto,
  type CreateStageDto,
  type UpdateStageDto,
} from '@/lib/api/crm-pipelines';
import { crmPipelinesKeys } from './crm-pipelines-keys';

// ---- Query Options ----

export function crmPipelineListOptions() {
  return queryOptions({
    queryKey: crmPipelinesKeys.list(),
    queryFn: () => crmPipelinesApi.list().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmPipelineDetailOptions(id: string) {
  return queryOptions({
    queryKey: crmPipelinesKeys.detail(id),
    queryFn: () => crmPipelinesApi.getById(id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

// ---- Hooks ----

export function usePipelines() {
  return useQuery(crmPipelineListOptions());
}

export function usePipeline(id: string) {
  return useQuery(crmPipelineDetailOptions(id));
}

export function useCreatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePipelineDto) =>
      crmPipelinesApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmPipelinesKeys.all });
    },
  });
}

export function useUpdatePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePipelineDto }) =>
      crmPipelinesApi.update(id, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmPipelinesKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmPipelinesKeys.detail(variables.id),
      });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      crmPipelinesApi.delete(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmPipelinesKeys.all });
    },
  });
}

// ---- Stage Mutations ----

export function useCreateStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, dto }: { pipelineId: string; dto: CreateStageDto }) =>
      crmPipelinesApi.createStage(pipelineId, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: crmPipelinesKeys.detail(variables.pipelineId),
      });
      queryClient.invalidateQueries({ queryKey: crmPipelinesKeys.list() });
    },
  });
}

export function useUpdateStage(pipelineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, dto }: { stageId: string; dto: UpdateStageDto }) =>
      crmPipelinesApi.updateStage(stageId, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: crmPipelinesKeys.detail(pipelineId),
      });
    },
  });
}

export function useDeleteStage(pipelineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      crmPipelinesApi.deleteStage(stageId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: crmPipelinesKeys.detail(pipelineId),
      });
      queryClient.invalidateQueries({ queryKey: crmPipelinesKeys.list() });
    },
  });
}

export function useReorderStages(pipelineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      crmPipelinesApi.reorderStages(pipelineId, orderedIds).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: crmPipelinesKeys.detail(pipelineId),
      });
    },
  });
}
