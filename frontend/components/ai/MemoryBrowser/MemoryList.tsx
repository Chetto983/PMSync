'use client';

import React from 'react';
import { Box, Typography, Skeleton, Button, alpha, useTheme } from '@mui/material';
import { Brain, RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { MemoryCard } from './MemoryCard';
import type { Memory } from '@/hooks/queries';

interface MemoryListProps {
  memories: Memory[];
  isLoading?: boolean;
  error?: Error | null;
  onDelete?: (id: string) => void;
  deletingId?: string | null;
  onShowHistory?: (id: string) => void;
  onRetry?: () => void;
}

function MemorySkeleton() {
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Skeleton variant="rounded" width={80} height={24} />
        <Skeleton variant="text" width={60} />
      </Box>
      <Skeleton variant="text" width="100%" />
      <Skeleton variant="text" width="80%" />
    </Box>
  );
}

export function MemoryList({ memories, isLoading, error, onDelete, deletingId, onRetry, onShowHistory }: MemoryListProps) {
  const theme = useTheme();
  const t = useTranslations();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <MemorySkeleton key={i} />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 4,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.error.main, 0.04),
          border: '1px solid',
          borderColor: alpha(theme.palette.error.main, 0.1),
        }}
      >
        <Typography variant="body1" color="error.main" sx={{ mb: 2 }}>
          {t.ai.memoryBrowser.error}
        </Typography>
        {onRetry && (
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={onRetry}
          >
            {t.ai.memoryBrowser.retry}
          </Button>
        )}
      </Box>
    );
  }

  if (memories.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          px: 4,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          border: '1px dashed',
          borderColor: alpha(theme.palette.primary.main, 0.2),
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <Brain size={28} style={{ color: theme.palette.primary.main, opacity: 0.6 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {t.ai.memoryBrowser.noMemories}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mx: 'auto' }}>
          {t.ai.memoryBrowser.noMemoriesDescription}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {memories.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          onDelete={onDelete}
          isDeleting={deletingId === memory.id}
          onShowHistory={onShowHistory}
        />
      ))}
    </Box>
  );
}

export default MemoryList;
