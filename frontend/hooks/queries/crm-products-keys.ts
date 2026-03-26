import type { ListProductsParams } from '@/lib/api/crm-products';

export const crmProductsKeys = {
  all: ['crm-products'] as const,
  list: () => [...crmProductsKeys.all, 'list'] as const,
  listFiltered: (params?: ListProductsParams) => [...crmProductsKeys.list(), params ?? {}] as const,
  details: () => [...crmProductsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmProductsKeys.details(), id] as const,
  dealProducts: (dealId: string) => ['crm-deals', 'detail', dealId, 'products'] as const,
} as const;
