/**
 * CRM Knowledge Base API module
 *
 * Backend: CrmModule > KBController
 * Endpoints: /api/v1/crm/kb
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface KBCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  children?: KBCategory[];
  _count?: { articles: number };
}

export interface KBArticle {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  status: string; // draft, published, archived
  categoryId: string | null;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; slug: string } | null;
  author?: { id: string; name: string } | null;
}

export interface KBSearchResult {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  category: { name: string; slug: string } | null;
  relevance: number;
}

export interface ListArticlesParams {
  categoryId?: string;
  status?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface CreateArticleDto {
  title: string;
  body: string;
  categoryId?: string;
  tags?: string[];
  status?: string;
}

export interface UpdateArticleDto {
  title?: string;
  body?: string;
  categoryId?: string | null;
  tags?: string[];
  status?: string;
}

export interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}

// ---- API ----

const BASE = '/crm/kb';

export const crmKBApi = {
  // Categories
  listCategories: () => apiClient.get<KBCategory[]>(`${BASE}/categories`),
  createCategory: (dto: CreateCategoryDto) => apiClient.post<KBCategory>(`${BASE}/categories`, dto),
  updateCategory: (id: string, dto: UpdateCategoryDto) => apiClient.patch<KBCategory>(`${BASE}/categories/${id}`, dto),
  deleteCategory: (id: string) => apiClient.delete(`${BASE}/categories/${id}`),

  // Articles
  listArticles: (params?: ListArticlesParams) => apiClient.get<{ data: KBArticle[]; total: number }>(`${BASE}/articles`, { params }),
  getBySlug: (slug: string) => apiClient.get<KBArticle>(`${BASE}/articles/${slug}`),
  createArticle: (dto: CreateArticleDto) => apiClient.post<KBArticle>(`${BASE}/articles`, dto),
  updateArticle: (id: string, dto: UpdateArticleDto) => apiClient.patch<KBArticle>(`${BASE}/articles/${id}`, dto),
  deleteArticle: (id: string) => apiClient.delete(`${BASE}/articles/${id}`),

  // Search
  search: (q: string, limit?: number) => apiClient.get<{ data: KBSearchResult[]; total: number }>(`${BASE}/search`, { params: { q, limit } }),
};
