import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import {
  crmProductsApi,
  type ListProductsParams,
  type CreateProductDto,
  type UpdateProductDto,
  type LinkDealProductDto,
} from '@/lib/api/crm-products';
import { crmProductsKeys } from './crm-products-keys';
import { crmDealsKeys } from './crm-deals-keys';

// ---- Query Options ----

export function crmProductListOptions(params?: ListProductsParams) {
  return queryOptions({
    queryKey: crmProductsKeys.listFiltered(params),
    queryFn: () => crmProductsApi.list(params).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function crmProductDetailOptions(id: string) {
  return queryOptions({
    queryKey: crmProductsKeys.detail(id),
    queryFn: () => crmProductsApi.getById(id).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!id,
  });
}

export function crmDealProductsOptions(dealId: string) {
  return queryOptions({
    queryKey: crmProductsKeys.dealProducts(dealId),
    queryFn: () => crmProductsApi.getDealProducts(dealId).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!dealId,
  });
}

// ---- Hooks ----

export function useProducts(params?: ListProductsParams) {
  return useQuery(crmProductListOptions(params));
}

export function useProduct(id: string) {
  return useQuery(crmProductDetailOptions(id));
}

export function useDealProducts(dealId: string) {
  return useQuery(crmDealProductsOptions(dealId));
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateProductDto) =>
      crmProductsApi.create(dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmProductsKeys.all });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateProductDto }) =>
      crmProductsApi.update(id, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: crmProductsKeys.all });
      queryClient.invalidateQueries({
        queryKey: crmProductsKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      crmProductsApi.delete(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmProductsKeys.all });
    },
  });
}

export function useLinkDealProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, dto }: { dealId: string; dto: LinkDealProductDto }) =>
      crmProductsApi.linkDealProduct(dealId, dto).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: crmProductsKeys.dealProducts(variables.dealId),
      });
      queryClient.invalidateQueries({
        queryKey: crmDealsKeys.detail(variables.dealId),
      });
    },
  });
}

export function useUnlinkDealProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, linkId }: { dealId: string; linkId: string }) =>
      crmProductsApi.unlinkDealProduct(dealId, linkId).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: crmProductsKeys.dealProducts(variables.dealId),
      });
      queryClient.invalidateQueries({
        queryKey: crmDealsKeys.detail(variables.dealId),
      });
    },
  });
}
