'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  alpha,
  useTheme,
  Tabs,
  Tab,
} from '@mui/material';
import { Search, Plus, Trash2, Brain, Lightbulb, TrendingUp, MessageSquare, Users } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAllMemories, useStoreMemory, useDeleteMemory, useClearAllMemories } from '@/hooks/queries';
import type { MemoryType, StoreMemoryPayload } from '@/lib/api/ai';
import { MemoryList } from './MemoryList';
import { PatternsTab } from './PatternsTab';
import { MemoryHistoryDialog } from './MemoryHistoryDialog';

const MEMORY_TYPE_ICONS: Record<MemoryType | 'all', React.ReactNode> = {
  all: <Brain size={16} />,
  PREFERENCE: <Lightbulb size={16} />,
  FACT: <Brain size={16} />,
  PATTERN: <TrendingUp size={16} />,
  INTERACTION: <MessageSquare size={16} />,
  CONTACT_NOTE: <Users size={16} />,
};

export function MemoryBrowser() {
  const theme = useTheme();
  const t = useTranslations();

  // State
  const [activeTab, setActiveTab] = useState<'memories' | 'patterns'>('memories');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MemoryType | 'all'>('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryType, setNewMemoryType] = useState<MemoryType>('PREFERENCE');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; memoryId: string | null }>({ open: false, memoryId: null });

  // Queries & Mutations
  const { data, isLoading, error, refetch } = useAllMemories(selectedType === 'all' ? undefined : selectedType);
  const storeMemory = useStoreMemory();
  const deleteMemory = useDeleteMemory();
  const clearAllMemories = useClearAllMemories();

  // Filter memories by search
  const filteredMemories = useMemo(() => {
    if (!data?.memories) return [];
    if (!searchQuery.trim()) return data.memories;

    const query = searchQuery.toLowerCase();
    return data.memories.filter((m) => m.content.toLowerCase().includes(query));
  }, [data?.memories, searchQuery]);

  // Handlers
  const handleAddMemory = async () => {
    if (!newMemoryContent.trim()) return;

    const payload: StoreMemoryPayload = {
      type: newMemoryType,
      content: newMemoryContent.trim(),
      source: 'EXPLICIT',
    };

    try {
      await storeMemory.mutateAsync(payload);
      setAddDialogOpen(false);
      setNewMemoryContent('');
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteMemory = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMemory.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllMemories.mutateAsync();
      setClearDialogOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const memoryTypes: (MemoryType | 'all')[] = ['all', 'PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE'];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
            }}
          >
            <Brain size={24} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {t.ai.memoryBrowser.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t.ai.memoryBrowser.subtitle}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<Trash2 size={16} />}
              onClick={() => setClearDialogOpen(true)}
              disabled={!data?.memories?.length}
            >
              {t.ai.memoryBrowser.clearAll}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<Plus size={16} />}
              onClick={() => setAddDialogOpen(true)}
            >
              {t.ai.memoryBrowser.addMemory}
            </Button>
          </Box>
        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        >
          <Tab label={t.ai.memoryBrowser.tabs.memories} value="memories" />
          <Tab label={t.ai.memoryBrowser.tabs.patterns} value="patterns" />
        </Tabs>
      </Box>

      {activeTab === 'memories' ? (
        <>
          {/* Search & Filters */}
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={t.ai.memoryBrowser.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {memoryTypes.map((type) => {
                const isSelected = selectedType === type;
                const label = type === 'all' ? t.ai.memoryBrowser.categories.all : t.ai.memoryBrowser.categories[type];

                return (
                  <Chip
                    key={type}
                    icon={<Box sx={{ display: 'flex', color: 'inherit' }}>{MEMORY_TYPE_ICONS[type]}</Box>}
                    label={label}
                    onClick={() => setSelectedType(type)}
                    variant={isSelected ? 'filled' : 'outlined'}
                    color={isSelected ? 'primary' : 'default'}
                    sx={{
                      fontWeight: isSelected ? 600 : 400,
                      '& .MuiChip-icon': { color: 'inherit' },
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* Stats */}
          {data && data.total > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>{data.total}</strong> {t.ai.memoryBrowser.stats.total.toLowerCase()}
              </Typography>
            </Box>
          )}

          {/* Memory List */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <MemoryList
              memories={filteredMemories}
              isLoading={isLoading}
              error={error}
              onDelete={handleDeleteMemory}
              deletingId={deletingId}
              onRetry={() => refetch()}
              onShowHistory={(id) => setHistoryDialog({ open: true, memoryId: id })}
            />
          </Box>
        </>
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <PatternsTab />
        </Box>
      )}

      {/* Add Memory Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t.ai.memoryBrowser.addMemory}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(['PREFERENCE', 'FACT', 'PATTERN', 'INTERACTION', 'CONTACT_NOTE'] as MemoryType[]).map((type) => (
                <Chip
                  key={type}
                  icon={<Box sx={{ display: 'flex', color: 'inherit' }}>{MEMORY_TYPE_ICONS[type]}</Box>}
                  label={t.ai.memoryBrowser.categories[type]}
                  onClick={() => setNewMemoryType(type)}
                  variant={newMemoryType === type ? 'filled' : 'outlined'}
                  color={newMemoryType === type ? 'primary' : 'default'}
                  sx={{ '& .MuiChip-icon': { color: 'inherit' } }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t.ai.memoryBrowser.categoryDescriptions[newMemoryType]}
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder={t.ai.memoryBrowser.addMemoryPlaceholder}
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>{t.common.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleAddMemory}
            disabled={!newMemoryContent.trim() || storeMemory.isPending}
            startIcon={storeMemory.isPending ? <CircularProgress size={16} /> : <Plus size={16} />}
          >
            {t.ai.memoryBrowser.addMemory}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear All Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>{t.ai.memoryBrowser.clearAll}</DialogTitle>
        <DialogContent>
          <Typography>{t.ai.memoryBrowser.clearAllConfirm}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>{t.common.cancel}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleClearAll}
            disabled={clearAllMemories.isPending}
            startIcon={clearAllMemories.isPending ? <CircularProgress size={16} /> : <Trash2 size={16} />}
          >
            {t.ai.memoryBrowser.clearAll}
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <MemoryHistoryDialog
        open={historyDialog.open}
        memoryId={historyDialog.memoryId}
        onClose={() => setHistoryDialog({ ...historyDialog, open: false })}
      />
    </Box>
  );
}

export default MemoryBrowser;
