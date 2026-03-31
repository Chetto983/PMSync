import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmKBApi,
  type ListArticlesParams,
  type CreateArticleDto,
  type UpdateArticleDto,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from '@/lib/api/crm-kb';
import { crmKBKeys } from './crm-kb-keys';

// ---- Query Options ----

export function crmKBCategoryListOptions() {
  return queryOptions({
    queryKey: crmKBKeys.categories(),
    queryFn: () => crmKBApi.listCategories().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmKBArticleListOptions(params?: ListArticlesParams) {
  return queryOptions({
    queryKey: crmKBKeys.articleList(params),
    queryFn: () => crmKBApi.listArticles(params).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmKBArticleBySlugOptions(slug: string) {
  return queryOptions({
    queryKey: crmKBKeys.articleBySlug(slug),
    queryFn: () => crmKBApi.getBySlug(slug).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!slug,
  });
}

export function crmKBSearchOptions(q: string) {
  return queryOptions({
    queryKey: crmKBKeys.search(q),
    queryFn: () => crmKBApi.search(q).then((r) => r.data),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    enabled: q.trim().length > 0,
  });
}

// ---- Hooks ----

export function useKBCategories() {
  return useQuery(crmKBCategoryListOptions());
}

export function useKBArticles(params?: ListArticlesParams) {
  return useQuery(crmKBArticleListOptions(params));
}

export function useKBArticleBySlug(slug: string) {
  return useQuery(crmKBArticleBySlugOptions(slug));
}

export function useKBSearch(q: string) {
  return useQuery(crmKBSearchOptions(q));
}

// ---- Mutations ----

export function useCreateKBCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCategoryDto) => crmKBApi.createCategory(dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKBKeys.categories() }),
  });
}

export function useUpdateKBCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCategoryDto }) => crmKBApi.updateCategory(id, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKBKeys.categories() }),
  });
}

export function useDeleteKBCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmKBApi.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKBKeys.categories() }),
  });
}

export function useCreateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateArticleDto) => crmKBApi.createArticle(dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKBKeys.articles() }),
  });
}

export function useUpdateKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateArticleDto }) => crmKBApi.updateArticle(id, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKBKeys.articles() }),
  });
}

export function useDeleteKBArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmKBApi.deleteArticle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKBKeys.articles() }),
  });
}
