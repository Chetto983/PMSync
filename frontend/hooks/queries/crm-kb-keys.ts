import type { ListArticlesParams } from '@/lib/api/crm-kb';

export const crmKBKeys = {
  all: ['crm-kb'] as const,
  categories: () => [...crmKBKeys.all, 'categories'] as const,
  articles: () => [...crmKBKeys.all, 'articles'] as const,
  articleList: (params?: ListArticlesParams) => [...crmKBKeys.articles(), 'list', params ?? {}] as const,
  articleBySlug: (slug: string) => [...crmKBKeys.articles(), 'slug', slug] as const,
  search: (q: string) => [...crmKBKeys.all, 'search', q] as const,
} as const;
