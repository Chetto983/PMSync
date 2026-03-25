import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmCustomFieldsApi,
  type CustomFieldEntity,
  type CreateCustomFieldDto,
  type UpdateCustomFieldDto,
} from '@/lib/api/crm-custom-fields';
import { crmCustomFieldsKeys } from './crm-custom-fields-keys';

// ---- Query Options ----

export function crmCustomFieldListOptions(entity?: CustomFieldEntity) {
  return queryOptions({
    queryKey: crmCustomFieldsKeys.list(entity),
    queryFn: () => crmCustomFieldsApi.list(entity).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmCustomFieldValuesOptions(entityId: string) {
  return queryOptions({
    queryKey: crmCustomFieldsKeys.values(entityId),
    queryFn: () => crmCustomFieldsApi.getValues(entityId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!entityId,
  });
}

// ---- Hooks ----

export function useCustomFields(entity?: CustomFieldEntity) {
  return useQuery(crmCustomFieldListOptions(entity));
}

export function useCustomFieldValues(entityId: string) {
  return useQuery(crmCustomFieldValuesOptions(entityId));
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCustomFieldDto) =>
      crmCustomFieldsApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmCustomFieldsKeys.all });
    },
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCustomFieldDto }) =>
      crmCustomFieldsApi.update(id, dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmCustomFieldsKeys.all });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmCustomFieldsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmCustomFieldsKeys.all });
    },
  });
}

export function useSetCustomFieldValues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entityId,
      values,
    }: {
      entityId: string;
      values: Array<{ fieldId: string; value: unknown }>;
    }) => crmCustomFieldsApi.setValues(entityId, values).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: crmCustomFieldsKeys.values(variables.entityId),
      });
    },
  });
}
