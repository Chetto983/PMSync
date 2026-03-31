'use client';

import { useState, useCallback, useEffect, type KeyboardEvent } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Paper,
  Chip,
  Grid,
  Tabs,
  Tab,
  Skeleton,
  Alert,
  Breadcrumbs,
  Link as MuiLink,
  IconButton,
} from '@mui/material';
import { ArrowLeft, Save, Send } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useKBCategories,
  useCreateKBArticle,
  useUpdateKBArticle,
} from '@/hooks/queries/use-crm-kb';
import { crmKBApi } from '@/lib/api/crm-kb';
import { useQuery } from '@tanstack/react-query';

interface KBArticleEditorProps {
  articleId?: string;
}

export function KBArticleEditor({ articleId }: KBArticleEditorProps) {
  const router = useRouter();
  const t = useTranslations();
  const tk = t.kb;
  const tf = tk?.form;

  const isEdit = !!articleId;

  // Fetch article if editing
  const { data: article, isLoading: articleLoading } = useQuery({
    queryKey: ['crm-kb', 'article', articleId],
    queryFn: () => crmKBApi.listArticles().then((r) => r.data.data.find((a) => a.id === articleId)),
    enabled: isEdit,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: categories } = useKBCategories();
  const createMutation = useCreateKBArticle();
  const updateMutation = useUpdateKBArticle();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState('draft');
  const [tab, setTab] = useState(0); // 0 = editor, 1 = preview

  // Populate form when article loads
  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setBody(article.body);
      setCategoryId(article.categoryId ?? '');
      setTags(article.tags);
      setStatus(article.status);
    }
  }, [article]);

  const handleAddTag = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags((prev) => [...prev, newTag]);
      }
      setTagInput('');
    }
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  const handleSave = useCallback(async (publishNow?: boolean) => {
    const dto = {
      title,
      body,
      categoryId: categoryId || undefined,
      tags,
      status: publishNow ? 'published' : status,
    };

    if (isEdit && articleId) {
      await updateMutation.mutateAsync({ id: articleId, dto });
    } else {
      await createMutation.mutateAsync(dto);
    }
    router.push('/dashboard/crm/kb');
  }, [title, body, categoryId, tags, status, isEdit, articleId, updateMutation, createMutation, router]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  if (isEdit && articleLoading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="rounded" height={400} sx={{ mt: 2 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={NextLink} href="/dashboard" underline="hover" color="text.secondary">
          Dashboard
        </MuiLink>
        <MuiLink component={NextLink} href="/dashboard/crm/kb" underline="hover" color="text.secondary">
          {tk?.title ?? 'Knowledge Base'}
        </MuiLink>
        <Typography color="text.primary">
          {isEdit ? (tf?.title ?? 'Edit Article') : (tk?.newArticle ?? 'New Article')}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton size="small" component={NextLink} href="/dashboard/crm/kb">
          <ArrowLeft size={20} />
        </IconButton>
        <Typography variant="h5" fontWeight={600}>
          {isEdit ? (tk?.editArticle ?? 'Edit Article') : (tk?.newArticle ?? 'New Article')}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Main content */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            {/* Title */}
            <TextField
              fullWidth
              size="small"
              label={tf?.title ?? 'Title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              sx={{ mb: 2 }}
            />

            {/* Editor / Preview tabs */}
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
            >
              <Tab label={tf?.editor ?? 'Editor'} />
              <Tab label={tf?.preview ?? 'Preview'} />
            </Tabs>

            {tab === 0 ? (
              <TextField
                fullWidth
                multiline
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your article content here... (Markdown supported)"
                sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: '0.875rem' } }}
              />
            ) : (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  minHeight: 384,
                  '& p': { mb: 1 },
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  fontSize: '0.875rem',
                  lineHeight: 1.7,
                }}
              >
                {body || (
                  <Typography color="text.secondary" fontStyle="italic">
                    {tk?.noArticles ?? 'No content'}
                  </Typography>
                )}
              </Paper>
            )}
          </Paper>
        </Grid>

        {/* Sidebar */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            {/* Status */}
            <TextField
              select
              fullWidth
              size="small"
              label={tf?.status ?? 'Status'}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              sx={{ mb: 2 }}
            >
              <MenuItem value="draft">{tf?.statusDraft ?? 'Draft'}</MenuItem>
              <MenuItem value="published">{tf?.statusPublished ?? 'Published'}</MenuItem>
              <MenuItem value="archived">{tf?.statusArchived ?? 'Archived'}</MenuItem>
            </TextField>

            {/* Category */}
            <TextField
              select
              fullWidth
              size="small"
              label={tf?.category ?? 'Category'}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              sx={{ mb: 2 }}
            >
              <MenuItem value="">—</MenuItem>
              {categories?.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </TextField>

            {/* Tags */}
            <TextField
              fullWidth
              size="small"
              label={tf?.tags ?? 'Tags'}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              helperText={tf?.tagsHelp ?? 'Press Enter to add a tag'}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
              {tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  onDelete={() => handleRemoveTag(tag)}
                />
              ))}
            </Box>
          </Paper>

          {/* Actions */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<Save size={16} />}
              onClick={() => handleSave()}
              disabled={!title.trim() || !body.trim() || isSaving}
              fullWidth
            >
              {tf?.save ?? 'Save'}
            </Button>
            {status !== 'published' && (
              <Button
                variant="outlined"
                startIcon={<Send size={16} />}
                onClick={() => handleSave(true)}
                disabled={!title.trim() || !body.trim() || isSaving}
                fullWidth
              >
                {tf?.publish ?? 'Publish'}
              </Button>
            )}
            <Button
              variant="text"
              component={NextLink}
              href="/dashboard/crm/kb"
              fullWidth
            >
              {tf?.cancel ?? 'Cancel'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
