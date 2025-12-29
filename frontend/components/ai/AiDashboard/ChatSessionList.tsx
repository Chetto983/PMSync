'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Button,
  Skeleton,
  Divider,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  alpha,
  useTheme,
  Collapse,
  Checkbox,
  Tooltip,
} from '@mui/material';
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit3,
  History,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { voltAgentApi, type ConversationSummary } from '@/lib/api/ai';
import logger from '@/lib/logger';

// Query options for conversations
function conversationsOptions() {
  return queryOptions({
    queryKey: ['ai', 'conversations'],
    queryFn: async () => {
      const response = await voltAgentApi.listConversations({ limit: 50 });
      return response.data?.conversations || [];
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Group conversations by date
function groupConversations(
  conversations: ConversationSummary[],
  t: ReturnType<typeof useTranslations>
) {
  const groups: { key: string; label: string; conversations: ConversationSummary[] }[] = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayConvs: ConversationSummary[] = [];
  const yesterdayConvs: ConversationSummary[] = [];
  const weekConvs: ConversationSummary[] = [];
  const olderConvs: ConversationSummary[] = [];

  conversations.forEach((conv) => {
    const date = new Date(conv.lastActiveAt);
    if (date.toDateString() === today.toDateString()) {
      todayConvs.push(conv);
    } else if (date.toDateString() === yesterday.toDateString()) {
      yesterdayConvs.push(conv);
    } else if (date > weekAgo) {
      weekConvs.push(conv);
    } else {
      olderConvs.push(conv);
    }
  });

  if (todayConvs.length)
    groups.push({ key: 'today', label: t.ai?.sessions?.today || 'Today', conversations: todayConvs });
  if (yesterdayConvs.length)
    groups.push({
      key: 'yesterday',
      label: t.ai?.sessions?.yesterday || 'Yesterday',
      conversations: yesterdayConvs,
    });
  if (weekConvs.length)
    groups.push({
      key: 'thisWeek',
      label: t.ai?.sessions?.thisWeek || 'This week',
      conversations: weekConvs,
    });
  if (olderConvs.length)
    groups.push({ key: 'older', label: t.ai?.sessions?.older || 'Older', conversations: olderConvs });

  return groups;
}

interface ChatSessionListProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onNewChat: () => void;
}

export function ChatSessionList({
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: ChatSessionListProps) {
  const theme = useTheme();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data: conversations = [], isLoading } = useQuery(conversationsOptions());

  const [renameDialog, setRenameDialog] = useState<{ id: string; title: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);

  // Collapsible state for each group
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Track which conversations are auto-generating titles
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  // Mutations
  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      voltAgentApi.updateConversation(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      setRenameDialog(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => voltAgentApi.deleteConversation(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      if (activeConversationId === deletedId) {
        onSelectConversation(null);
      }
      setDeleteDialog(null);
    },
  });

  // Bulk delete mutation - uses allSettled for partial success handling
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {

      // Use allSettled to handle partial failures gracefully
      const results = await Promise.allSettled(
        ids.map((id) => {
          return voltAgentApi.deleteConversation(id);
        })
      );


      // Collect successful deletions
      const deletedIds: string[] = [];
      const failedIds: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          deletedIds.push(ids[index]);
        } else {
          failedIds.push(ids[index]);
          logger.error(`Failed to delete conversation ${ids[index]}:`, result.reason);
        }
      });



      if (failedIds.length > 0 && deletedIds.length === 0) {
        throw new Error(`Failed to delete conversations: ${failedIds.length} errors`);
      }

      return { deletedIds, failedIds };
    },
    onSuccess: ({ deletedIds, failedIds }) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      if (activeConversationId && deletedIds.includes(activeConversationId)) {
        onSelectConversation(null);
      }
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setBulkDeleteDialog(false);

      // Log partial success if some failed
      if (failedIds.length > 0) {
        logger.warn(`Partial delete: ${deletedIds.length} succeeded, ${failedIds.length} failed`);
      }
    },
    onError: () => {
      // Refresh anyway to show current state
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
  });

  const generateTitleMutation = useMutation({
    mutationFn: (id: string) => voltAgentApi.generateConversationTitle(id, t.locale),
    onMutate: (id) => {
      setGeneratingIds((prev) => new Set([...prev, id]));
    },
    onSettled: (_, __, id) => {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
  });

  // Auto-generate titles for untitled conversations with messages
  useEffect(() => {
    if (!conversations.length) return;

    // Find untitled conversations with at least 6 messages that aren't already generating
    const untitledWithMessages = conversations.filter(
      (conv) =>
        !conv.title &&
        conv.messageCount >= 6 &&
        !generatingIds.has(conv.id) &&
        !generateTitleMutation.isPending
    );

    // Auto-generate for the first untitled conversation (to avoid too many parallel requests)
    if (untitledWithMessages.length > 0) {
      const first = untitledWithMessages[0];
      generateTitleMutation.mutate(first.id);
    }
  }, [conversations, generatingIds, generateTitleMutation]);

  const groups = useMemo(() => groupConversations(conversations, t), [conversations, t]);

  // Toggle group collapse
  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  // Toggle individual selection
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all in a group
  const toggleGroupSelection = (group: { conversations: ConversationSummary[] }) => {
    const groupIds = group.conversations.map((c) => c.id);
    const allSelected = groupIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Exit select mode
  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return (
      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          p: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={20} />
            <Skeleton width="70%" height={14} sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        <Skeleton variant="rounded" height={150} sx={{ borderRadius: 2 }} />
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
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha(theme.palette.primary.main, 0.3),
          boxShadow: (theme) => `0 10px 30px ${alpha(theme.palette.common.black, 0.08)}`,
        },
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
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <History size={20} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t.ai?.sessions?.title || 'Chat History'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isSelectMode && selectedIds.size > 0
              ? (t.ai?.sessions?.selectedCount || '{count} selected').replace(
                '{count}',
                selectedIds.size.toString()
              )
              : (conversations.length === 1
                  ? t.ai?.sessions?.conversationCount || '{count} conversation'
                  : t.ai?.sessions?.conversationCountPlural || '{count} conversations'
                ).replace('{count}', conversations.length.toString())}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {isSelectMode ? (
            <>
              <Button
                size="small"
                color="error"
                startIcon={<Trash2 size={14} />}
                onClick={() => setBulkDeleteDialog(true)}
                disabled={selectedIds.size === 0}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {t.ai?.sessions?.deleteSelected || 'Delete'}
              </Button>
              <Button
                size="small"
                onClick={exitSelectMode}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {t.common?.cancel || 'Cancel'}
              </Button>
            </>
          ) : (
            <>
              {conversations.length > 0 && (
                <Tooltip title={t.ai?.sessions?.selectAll || 'Select'}>
                  <IconButton size="small" onClick={() => setIsSelectMode(true)} sx={{ p: 0.5 }}>
                    <Checkbox sx={{ p: 0 }} size="small" checked={false} />
                  </IconButton>
                </Tooltip>
              )}
              <Button
                size="small"
                startIcon={<Plus size={14} />}
                onClick={onNewChat}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                {t.ai?.sessions?.newChat || 'New Chat'}
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
        {conversations.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 1.5,
              }}
            >
              <MessageSquare size={24} style={{ opacity: 0.5 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t.ai?.sessions?.noSessions || 'No previous conversations'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.ai?.sessions?.noSessionsHint || 'Start a conversation to see it here'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {groups.map((group, groupIdx) => {
              const isCollapsed = collapsedGroups[group.key] ?? false;
              const groupIds = group.conversations.map((c) => c.id);
              const allGroupSelected = groupIds.every((id) => selectedIds.has(id));
              const someGroupSelected =
                groupIds.some((id) => selectedIds.has(id)) && !allGroupSelected;

              return (
                <React.Fragment key={group.key}>
                  {/* Group Header - Collapsible */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: 1,
                      py: 0.75,
                      cursor: 'pointer',
                      bgcolor: alpha(theme.palette.action.hover, 0.03),
                      '&:hover': {
                        bgcolor: alpha(theme.palette.action.hover, 0.08),
                      },
                    }}
                    onClick={() => toggleGroup(group.key)}
                  >
                    {isSelectMode && (
                      <Checkbox
                        size="small"
                        checked={allGroupSelected}
                        indeterminate={someGroupSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupSelection(group);
                        }}
                        sx={{ p: 0.5, mr: 0.5 }}
                      />
                    )}
                    <IconButton size="small" sx={{ p: 0.25, mr: 0.5 }}>
                      {isCollapsed ? (
                        <ChevronRight size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </IconButton>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, flex: 1 }}
                    >
                      {group.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontSize: '0.7rem', mr: 1 }}
                    >
                      {group.conversations.length}
                    </Typography>
                  </Box>

                  {/* Group Content - Collapsible */}
                  <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
                    {group.conversations.map((conv) => {
                      const isGenerating = generatingIds.has(conv.id);
                      return (
                        <ListItemButton
                          key={conv.id}
                          selected={conv.id === activeConversationId}
                          onClick={() => {
                            if (isSelectMode) {
                              toggleSelection(conv.id);
                            } else {
                              onSelectConversation(conv.id);
                            }
                          }}
                          sx={{
                            py: 1,
                            px: 2,
                            pl: isSelectMode ? 1 : 2,
                            '&.Mui-selected': {
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                            },
                            // Show action icons only on hover (2025 clean UI)
                            '& .action-icons': {
                              opacity: 0,
                              transition: 'opacity 0.2s ease',
                            },
                            '&:hover .action-icons': {
                              opacity: 1,
                            },
                          }}
                        >
                          {isSelectMode && (
                            <Checkbox
                              size="small"
                              checked={selectedIds.has(conv.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleSelection(conv.id)}
                              sx={{ p: 0.5, mr: 1 }}
                            />
                          )}
                          <ListItemText
                            primary={
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: conv.id === activeConversationId ? 600 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: isGenerating ? 'text.secondary' : 'text.primary',
                                }}
                              >
                                {isGenerating
                                  ? t.ai?.sessions?.autoGeneratingTitle || 'Generating title...'
                                  : conv.title || t.ai?.sessions?.untitled || 'Untitled chat'}
                              </Typography>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {(conv.messageCount === 1
                                  ? t.ai?.sessions?.messageCount || '{count} message'
                                  : t.ai?.sessions?.messageCountPlural || '{count} messages'
                                ).replace('{count}', conv.messageCount.toString())}
                              </Typography>
                            }
                          />
                          {!isSelectMode && (
                            <Box className="action-icons" sx={{ display: 'flex', gap: 0.25, ml: 1 }}>
                              {!conv.title && !isGenerating && (
                                <Tooltip title={t.ai?.sessions?.generating || 'Generate title'} arrow>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      generateTitleMutation.mutate(conv.id);
                                    }}
                                    disabled={generateTitleMutation.isPending}
                                    sx={{
                                      p: 0.5,
                                      color: 'text.secondary',
                                      '&:hover': {
                                        color: 'warning.main',
                                        bgcolor: alpha(theme.palette.warning.main, 0.1),
                                      },
                                    }}
                                  >
                                    <Sparkles size={14} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title={t.ai?.sessions?.renameSession || 'Rename'} arrow>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenameDialog({ id: conv.id, title: conv.title || '' });
                                  }}
                                  sx={{
                                    p: 0.5,
                                    color: 'text.secondary',
                                    '&:hover': {
                                      color: 'primary.main',
                                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                                    },
                                  }}
                                >
                                  <Edit3 size={14} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={t.ai?.sessions?.deleteSession || 'Delete'} arrow>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteDialog(conv.id);
                                  }}
                                  sx={{
                                    p: 0.5,
                                    color: 'text.secondary',
                                    '&:hover': {
                                      color: 'error.main',
                                      bgcolor: alpha(theme.palette.error.main, 0.1),
                                    },
                                  }}
                                >
                                  <Trash2 size={14} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </ListItemButton>
                      );
                    })}
                  </Collapse>

                  {groupIdx < groups.length - 1 && !isCollapsed && <Divider sx={{ my: 0.5 }} />}
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>

      {/* Rename Dialog */}
      <Dialog open={!!renameDialog} onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t.ai?.sessions?.renameSession || 'Rename'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={renameDialog?.title || ''}
            onChange={(e) =>
              setRenameDialog((prev) => (prev ? { ...prev, title: e.target.value } : null))
            }
            placeholder={t.ai?.sessions?.untitled || 'Untitled chat'}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog(null)} size="small">
            {t.common?.cancel || 'Cancel'}
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              if (renameDialog) {
                renameMutation.mutate({ id: renameDialog.id, title: renameDialog.title });
              }
            }}
            disabled={renameMutation.isPending}
          >
            {t.common?.save || 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t.ai?.sessions?.deleteSession || 'Delete'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t.ai?.sessions?.confirmDelete || 'Delete this conversation?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)} size="small">
            {t.common?.cancel || 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={() => {
              if (deleteDialog) {
                deleteMutation.mutate(deleteDialog);
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {t.common?.delete || 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={bulkDeleteDialog}
        onClose={() => setBulkDeleteDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t.ai?.sessions?.deleteSelected || 'Delete Selected'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {(t.ai?.sessions?.confirmBulkDelete || 'Delete {count} conversations?').replace(
              '{count}',
              selectedIds.size.toString()
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialog(false)} size="small">
            {t.common?.cancel || 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={() => {
              bulkDeleteMutation.mutate([...selectedIds]);
            }}
            disabled={bulkDeleteMutation.isPending}
          >
            {bulkDeleteMutation.isPending
              ? t.common?.processing || 'Processing...'
              : t.common?.delete || 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default ChatSessionList;
