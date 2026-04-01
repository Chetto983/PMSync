'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Skeleton,
  InputAdornment,
  IconButton,
  Breadcrumbs,
  Link as MuiLink,
  MenuItem,
} from '@mui/material';
import { Search, Plus, Edit2, Trash2, BookOpen } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useKBArticles,
  useKBCategories,
  useKBSearch,
  useDeleteKBArticle,
} from '@/hooks/queries/use-crm-kb';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'default'> = {
  published: 'success',
  draft: 'warning',
  archived: 'default',
};

export function KBBrowsePage() {
  const router = useRouter();
  const t = useTranslations();
  const tk = t.kb;
  const tf = tk?.form;
  const tb = tk?.browse;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Debounce search
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => setDebouncedSearch(value), 300));
  };

  const isSearchMode = debouncedSearch.trim().length > 0;

  // Data queries
  const { data: articlesData, isLoading: articlesLoading } = useKBArticles({
    status: statusFilter || undefined,
    categoryId: categoryFilter || undefined,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });
  const { data: searchData, isLoading: searchLoading } = useKBSearch(debouncedSearch);
  const { data: categories } = useKBCategories();
  const deleteMutation = useDeleteKBArticle();

  const articles = articlesData?.data ?? [];
  const totalArticles = articlesData?.total ?? 0;
  const searchResults = searchData?.data ?? [];

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    await deleteMutation.mutateAsync(id);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={NextLink} href="/dashboard" underline="hover" color="text.secondary">
          Dashboard
        </MuiLink>
        <MuiLink component={NextLink} href="/dashboard/crm/kb" underline="hover" color="text.secondary">
          CRM
        </MuiLink>
        <Typography color="text.primary">{tk?.title ?? 'Knowledge Base'}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BookOpen size={28} />
            <Typography variant="h5" fontWeight={600}>
              {tk?.title ?? 'Knowledge Base'}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {tk?.subtitle ?? 'Articles and documentation'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          component={NextLink}
          href="/dashboard/crm/kb/articles/new"
          sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          {tk?.newArticle ?? 'New Article'}
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder={tk?.search ?? 'Search articles...'}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 140 }}
          label={tf?.status ?? 'Status'}
        >
          <MenuItem value="">—</MenuItem>
          <MenuItem value="draft">{tf?.statusDraft ?? 'Draft'}</MenuItem>
          <MenuItem value="published">{tf?.statusPublished ?? 'Published'}</MenuItem>
          <MenuItem value="archived">{tf?.statusArchived ?? 'Archived'}</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 160 }}
          label={tf?.category ?? 'Category'}
        >
          <MenuItem value="">—</MenuItem>
          {categories?.map((cat) => (
            <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Search results mode */}
      {isSearchMode ? (
        <Paper variant="outlined">
          {searchLoading ? (
            <Box sx={{ p: 2 }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={60} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : searchResults.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">{tk?.noResults ?? 'No results found'}</Typography>
            </Box>
          ) : (
            <Box sx={{ p: 1 }}>
              {searchResults.map((result) => (
                <Paper
                  key={result.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    mb: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  onClick={() => router.push(`/dashboard/crm/kb/articles/${result.id}/edit`)}
                >
                  <Typography variant="subtitle1" fontWeight={600}>
                    {result.title}
                  </Typography>
                  {result.category && (
                    <Chip label={result.category.name} size="small" variant="outlined" sx={{ mr: 1, mt: 0.5 }} />
                  )}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
      ) : (
        /* Articles table */
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{tf?.title ?? 'Title'}</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>{tf?.category ?? 'Category'}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{tf?.status ?? 'Status'}</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>{tb?.publishedOn ?? 'Published'}</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 80, display: { xs: 'none', sm: 'table-cell' } }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {articlesLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton variant="text" /></TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell><Skeleton variant="text" width={70} /></TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Skeleton variant="text" width={80} /></TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Skeleton variant="text" width={60} /></TableCell>
                  </TableRow>
                ))
              ) : articles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {tk?.noArticles ?? 'No articles yet'}
                    </Typography>
                    <Button
                      size="small"
                      component={NextLink}
                      href="/dashboard/crm/kb/articles/new"
                      sx={{ mt: 1 }}
                    >
                      {tk?.newArticle ?? 'New Article'}
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                articles.map((article) => (
                  <TableRow
                    key={article.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/dashboard/crm/kb/articles/${article.id}/edit`)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {article.title}
                      </Typography>
                      {article.tags.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          {article.tags.slice(0, 3).map((tag) => (
                            <Chip key={tag} label={tag} size="small" variant="outlined" />
                          ))}
                          {article.tags.length > 3 && (
                            <Chip label={`+${article.tags.length - 3}`} size="small" />
                          )}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {article.category ? (
                        <Chip label={article.category.name} size="small" variant="outlined" />
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tf?.[`status${article.status.charAt(0).toUpperCase() + article.status.slice(1)}` as keyof typeof tf] ?? article.status}
                        size="small"
                        color={STATUS_COLORS[article.status] ?? 'default'}
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{formatDate(article.publishedAt)}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }} onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          component={NextLink}
                          href={`/dashboard/crm/kb/articles/${article.id}/edit`}
                        >
                          <Edit2 size={16} />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteConfirmId(article.id)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!isSearchMode && totalArticles > 0 && (
            <TablePagination
              component="div"
              count={totalArticles}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25]}
            />
          )}
        </TableContainer>
      )}

      <ConfirmDialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDeleteConfirm}
        variant="danger"
        title={tf?.confirmDeleteTitle ?? 'Delete article'}
        message={tf?.confirmDelete ?? 'Are you sure you want to delete this article?'}
        confirmText={t.common?.delete ?? 'Delete'}
        isLoading={deleteMutation.isPending}
      />
    </Box>
  );
}
