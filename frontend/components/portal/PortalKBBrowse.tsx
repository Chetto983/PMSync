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

export function PortalKBBrowse() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => setDebouncedSearch(value), 300));
  };

  // Public portal endpoints (T-1709 will add backend routes)
  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['portal', 'kb', 'categories'],
    queryFn: () => apiClient.get<PortalCategory[]>('/portal/kb/categories').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['portal', 'kb', 'search', debouncedSearch],
    queryFn: () =>
      apiClient
        .get<{ data: PortalArticle[] }>('/portal/kb/search', { params: { q: debouncedSearch } })
        .then((r) => r.data.data),
    enabled: debouncedSearch.trim().length > 0,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  const isSearchMode = debouncedSearch.trim().length > 0;

  return (
    <Box>
      {/* Title */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1 }}>
          <BookOpen size={32} />
          <Typography variant="h4" fontWeight={700}>
            Knowledge Base
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Find answers to common questions
        </Typography>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search articles..."
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
              No results found
            </Typography>
          ) : (
            searchResults.map((result) => (
              <Paper
                key={result.id}
                variant="outlined"
                component={NextLink}
                href={`/portal/kb/${result.slug}`}
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
              No categories yet
            </Typography>
          ) : (
            categories.map((cat) => (
              <Paper
                key={cat.id}
                variant="outlined"
                component={NextLink}
                href={`/portal/kb?category=${cat.slug}`}
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
                  {cat._count?.articles ?? 0} articles
                </Typography>
              </Paper>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}
