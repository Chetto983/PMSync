/**
 * CRM Products API module
 *
 * Backend: CrmModule > ProductController
 * Endpoints: /api/v1/crm/products
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface CrmProduct {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  price: string; // Decimal comes as string from Prisma
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CrmProductListResponse {
  data: CrmProduct[];
  total: number;
}

export interface ListProductsParams {
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateProductDto {
  name: string;
  code?: string;
  description?: string;
  price: number;
  currency?: string;
}

export interface UpdateProductDto {
  name?: string;
  code?: string | null;
  description?: string | null;
  price?: number;
  currency?: string;
  isActive?: boolean;
}

// ---- Deal-Product Types ----

export interface DealProductLink {
  id: string;
  dealId: string;
  productId: string;
  quantity: number;
  unitPrice: string; // Decimal comes as string
  discount: string; // Decimal comes as string
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    code: string | null;
    price: string;
    currency: string;
    isActive: boolean;
  };
}

export interface LinkDealProductDto {
  productId: string;
  quantity?: number;
  unitPrice: number;
  discount?: number;
}

// ---- Product CRUD API ----

export const crmProductsApi = {
  list(params?: ListProductsParams) {
    return apiClient.get<CrmProductListResponse>('/crm/products', { params });
  },

  getById(id: string) {
    return apiClient.get<CrmProduct>(`/crm/products/${id}`);
  },

  create(dto: CreateProductDto) {
    return apiClient.post<CrmProduct>('/crm/products', dto);
  },

  update(id: string, dto: UpdateProductDto) {
    return apiClient.patch<CrmProduct>(`/crm/products/${id}`, dto);
  },

  delete(id: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/products/${id}`);
  },

  // ---- Deal-Product associations ----

  getDealProducts(dealId: string) {
    return apiClient.get<DealProductLink[]>(`/crm/deals/${dealId}/products`);
  },

  linkDealProduct(dealId: string, dto: LinkDealProductDto) {
    return apiClient.post<DealProductLink>(`/crm/deals/${dealId}/products`, dto);
  },

  unlinkDealProduct(dealId: string, linkId: string) {
    return apiClient.delete<{ deleted: boolean }>(
      `/crm/deals/${dealId}/products/${linkId}`,
    );
  },
};
