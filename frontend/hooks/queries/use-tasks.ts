import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  tasksApi,
  type ListTasksQuery,
  type CreateManualTaskDto,
  type UpdateManualTaskDto,
  type TaskSourceType,
} from '@/lib/api/tasks';
import { tasksKeys } from './tasks-keys';

// ---- Query Options ----

export function taskListOptions(filters?: ListTasksQuery) {
  return queryOptions({
    queryKey: tasksKeys.list(filters as Record<string, unknown>),
    queryFn: () => tasksApi.list(filters).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

// ---- Hooks ----

export function useTasks(filters?: ListTasksQuery) {
  return useQuery(taskListOptions(filters));
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateManualTaskDto) =>
      tasksApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceType,
      id,
      dto,
    }: {
      sourceType: TaskSourceType;
      id: string;
      dto: UpdateManualTaskDto;
    }) => tasksApi.update(sourceType, id, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceType,
      id,
    }: {
      sourceType: TaskSourceType;
      id: string;
    }) => tasksApi.delete(sourceType, id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceType,
      id,
    }: {
      sourceType: TaskSourceType;
      id: string;
    }) => tasksApi.complete(sourceType, id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}
