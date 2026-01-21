/**
 * Email Templates Query Hooks
 *
 * TanStack Query hooks for template CRUD operations
 */
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { templatesApi, CreateTemplateDto, UpdateTemplateDto } from '@/lib/api/templates';

// Query key factory
export const templateKeys = {
  all: ['templates'] as const,
  list: (category?: string) => [...templateKeys.all, 'list', category] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
  default: () => [...templateKeys.all, 'default'] as const,
  categories: () => [...templateKeys.all, 'categories'] as const,
};

// Query options (for prefetching, SSR)
export function templatesListOptions(category?: string) {
  return queryOptions({
    queryKey: templateKeys.list(category),
    queryFn: async () => {
      const response = await templatesApi.list(category);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function templateDefaultOptions() {
  return queryOptions({
    queryKey: templateKeys.default(),
    queryFn: async () => {
      const response = await templatesApi.getDefault();
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function templateCategoriesOptions() {
  return queryOptions({
    queryKey: templateKeys.categories(),
    queryFn: async () => {
      const response = await templatesApi.getCategories();
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Hooks
export function useTemplates(category?: string) {
  return useQuery(templatesListOptions(category));
}

export function useDefaultTemplate() {
  return useQuery(templateDefaultOptions());
}

export function useTemplateCategories() {
  return useQuery(templateCategoriesOptions());
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: async () => {
      const response = await templatesApi.get(id);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateTemplateDto) => {
      const response = await templatesApi.create(dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateTemplateDto }) => {
      const response = await templatesApi.update(id, dto);
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await templatesApi.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useSetDefaultTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await templatesApi.setDefault(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useDuplicateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name?: string }) => {
      const response = await templatesApi.duplicate(id, name);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}
