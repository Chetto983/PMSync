'use client';

import React, { useState } from 'react';
import { Box, Typography, Paper, Chip, Button, Skeleton, TextField, IconButton, alpha, useTheme } from '@mui/material';
import { Brain, Plus, Trash2, Search, Lightbulb, Heart, Briefcase, Users } from 'lucide-react';
import { useQuery, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { voltAgentApi, type LongTermMemoryItem } from '@/lib/api/ai';

function memoriesOptions() {
  return queryOptions({
    queryKey: ['ai', 'memories'],
    queryFn: async () => {
      const response = await voltAgentApi.listMemories({ limit: 10 });
      return response.data?.memories || [];
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

const categoryIcons: Record<string, React.ReactNode> = {
  PREFERENCE: <Heart size={12} />,
  CONTACT: <Users size={12} />,
  PROJECT: <Briefcase size={12} />,
  GENERAL: <Lightbulb size={12} />,
};

const categoryColors: Record<string, string> = {
  PREFERENCE: '#ec4899',
  CONTACT: '#0ea5e9',
  PROJECT: '#10b981',
  GENERAL: '#f59e0b',
};

export function AiMemoryWidget() {
  const theme = useTheme();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data: memories = [], isLoading } = useQuery(memoriesOptions());
  const [newFact, setNewFact] = useState('');
  const [showInput, setShowInput] = useState(false);

  const addMutation = useMutation({
    mutationFn: (fact: string) => voltAgentApi.addMemoryFact({ fact }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'memories'] });
      setNewFact('');
      setShowInput(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => voltAgentApi.deleteMemory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'memories'] });
    },
  });

  const handleAddFact = () => {
    if (newFact.trim()) {
      addMutation.mutate(newFact.trim());
    }
  };

  if (isLoading) {
    return (
      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          p: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={20} />
            <Skeleton width="70%" height={14} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, #7c3aed 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <Brain size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t.ai?.memory?.title || 'AI Memory'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t.ai?.memory?.subtitle || 'What the AI remembers about you'}
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<Plus size={14} />}
          onClick={() => setShowInput(!showInput)}
          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
        >
          {t.ai?.memory?.add || 'Add'}
        </Button>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {/* Add new fact input */}
        {showInput && (
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={t.ai?.memory?.placeholder || 'E.g.: I prefer short and concise emails'}
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddFact();
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  fontSize: '0.85rem',
                },
              }}
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleAddFact}
              disabled={!newFact.trim() || addMutation.isPending}
              sx={{ minWidth: 'auto', px: 2, borderRadius: 2 }}
            >
              <Plus size={16} />
            </Button>
          </Box>
        )}

        {memories.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 1.5,
              }}
            >
              <Search size={24} style={{ opacity: 0.5 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t.ai?.memory?.noMemories || 'No memories saved'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.memory?.noMemoriesHint || 'The AI learns from your interactions and preferences'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {memories.slice(0, 5).map((memory: LongTermMemoryItem) => {
              const category = memory.category?.toUpperCase() || 'GENERAL';
              const color = categoryColors[category] || categoryColors.GENERAL;
              const icon = categoryIcons[category] || categoryIcons.GENERAL;

              return (
                <Box
                  key={memory.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.background.default, 0.5),
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.08),
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                  }}
                >
                  <Chip
                    icon={icon as React.ReactElement}
                    label={category.toLowerCase()}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6rem',
                      bgcolor: alpha(color, 0.1),
                      color: color,
                      '& .MuiChip-icon': { fontSize: 10 },
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" sx={{ flex: 1, lineHeight: 1.4 }}>
                    {memory.memory}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => deleteMutation.mutate(memory.id)}
                    disabled={deleteMutation.isPending}
                    sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </Box>
              );
            })}

            {memories.length > 5 && (
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', mt: 1 }}>
                {(t.ai?.memory?.moreMemories || '+{count} more memories').replace('{count}', String(memories.length - 5))}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default AiMemoryWidget;
