'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Paper,
  Chip,
  InputAdornment,
  Skeleton,
} from '@mui/material';
import { Search, BookOpen } from 'lucide-react';
import NextLink from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';

interface PortalArticle {
  id: string;
  title: string;
  slug: string;
  snippet: string;
  category: { name: string; slug: string } | null;
  relevance: number;
}

interface PortalCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count?: { articles: number };
}

interface PortalKBBrowseProps {
  tenantSlug: string;
}

export function PortalKBBrowse({ tenantSlug }: PortalKBBrowseProps) {
  const t = useTranslations();
  const tk = t.kb;
  const tb = tk?.browse;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => setDebouncedSearch(value), 300));
  };

  const base = `/portal/${tenantSlug}`;
  const apiBase = `/portal/${tenantSlug}/kb`;

  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['portal', tenantSlug, 'kb', 'categories'],
    queryFn: () => apiClient.get<PortalCategory[]>(`${apiBase}/categories`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!tenantSlug,
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['portal', tenantSlug, 'kb', 'search', debouncedSearch],
    queryFn: () =>
      apiClient
        .get<{ data: PortalArticle[] }>(`${apiBase}/search`, { params: { q: debouncedSearch } })
        .then((r) => r.data.data),
    enabled: !!tenantSlug && debouncedSearch.trim().length > 0,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  const isSearchMode = debouncedSearch.trim().length > 0;

  if (!tenantSlug) return null;

  return (
    <Box>
      {/* Title */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1 }}>
          <BookOpen size={32} />
          <Typography variant="h4" fontWeight={700}>
            {tk?.title ?? 'Knowledge Base'}
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          {tk?.subtitle ?? 'Find answers to common questions'}
        </Typography>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder={tk?.search ?? 'Search articles...'}
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        sx={{ mb: 4, maxWidth: 600, mx: 'auto', display: 'block' }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={20} />
              </InputAdornment>
            ),
          },
        }}
      />

      {/* Search results */}
      {isSearchMode ? (
        <Box>
          {searchLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />
            ))
          ) : !searchResults?.length ? (
            <Typography color="text.secondary" textAlign="center">
              {tk?.noResults ?? 'No results found'}
            </Typography>
          ) : (
            searchResults.map((result) => (
              <Paper
                key={result.id}
                variant="outlined"
                component={NextLink}
                href={`${base}/kb/${result.slug}`}
                sx={{
                  p: 2,
                  mb: 1,
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="subtitle1" fontWeight={600}>
                  {result.title}
                </Typography>
                {result.category && (
                  <Chip label={result.category.name} size="small" variant="outlined" sx={{ mt: 0.5, mr: 1 }} />
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              </Paper>
            ))
          )}
        </Box>
      ) : (
        /* Categories grid */
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
          {catLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))
          ) : !categories?.length ? (
            <Typography color="text.secondary" sx={{ gridColumn: '1 / -1', textAlign: 'center' }}>
              {tk?.noArticles ?? 'No categories yet'}
            </Typography>
          ) : (
            categories.map((cat) => (
              <Paper
                key={cat.id}
                variant="outlined"
                component={NextLink}
                href={`${base}?category=${cat.slug}`}
                sx={{
                  p: 3,
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="h6" fontWeight={600}>
                  {cat.name}
                </Typography>
                {cat.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {cat.description}
                  </Typography>
                )}
                <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                  {(() => {
                    const n = cat._count?.articles ?? 0;
                    const tpl = n === 1
                      ? (tb?.articleCount ?? '{count} article')
                      : (tb?.articlesCount ?? '{count} articles');
                    return tpl.replace('{count}', String(n));
                  })()}
                </Typography>
              </Paper>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}
