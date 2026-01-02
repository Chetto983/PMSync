'use client';

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Skeleton,
    Button,
    IconButton,
    Tooltip,
    alpha,
    useTheme,
} from '@mui/material';
import {
    CheckSquare,
    ArrowRight,
    Clock,
    AlertCircle,
    CheckCircle2,
    Circle,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { voltAgentApi } from '@/lib/api/ai';

// Types for action items
interface ActionItem {
    id: string;
    title: string;
    status: 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE' | 'CANCELLED';
    priority: number;
    dueDate?: string;
    sourceType?: string;
}

// Query options for action items
function actionItemsOptions(limit = 5) {
    return queryOptions({
        queryKey: ['actionItems', 'pending', limit],
        queryFn: async (): Promise<{ items: ActionItem[]; stats: { todo: number; inProgress: number; overdue: number } }> => {
            try {
                const [itemsResponse, statsResponse] = await Promise.all([
                    voltAgentApi.getPendingActionItems(),
                    voltAgentApi.getActionItemStats(),
                ]);

                const items = (itemsResponse.data?.items || []).slice(0, limit).map((item: Record<string, unknown>) => ({
                    id: item.id as string,
                    title: item.title as string || 'Untitled',
                    status: item.status as ActionItem['status'] || 'TODO',
                    priority: item.priority as number || 0,
                    dueDate: item.dueDate as string,
                    sourceType: item.sourceType as string,
                }));

                const stats = statsResponse.data?.stats as { todo?: number; inProgress?: number; overdue?: number } || {};

                return {
                    items,
                    stats: {
                        todo: stats.todo || 0,
                        inProgress: stats.inProgress || 0,
                        overdue: stats.overdue || 0,
                    },
                };
            } catch {
                return { items: [], stats: { todo: 0, inProgress: 0, overdue: 0 } };
            }
        },
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
    });
}

export function ActionItemsWidget({ limit = 4, showHeader = true }: { limit?: number; showHeader?: boolean }) {
    const router = useRouter();
    const t = useTranslations();
    const theme = useTheme();
    const { data, isLoading } = useQuery(actionItemsOptions(limit));

    const items = data?.items || [];
    const stats = data?.stats || { todo: 0, inProgress: 0, overdue: 0 };
    const totalPending = stats.todo + stats.inProgress;

    const getPriorityColor = (priority: number) => {
        if (priority >= 3) return theme.palette.error.main;
        if (priority >= 2) return theme.palette.warning.main;
        return theme.palette.info.main;
    };

    const getStatusIcon = (status: ActionItem['status']) => {
        switch (status) {
            case 'IN_PROGRESS':
                return <Clock size={14} />;
            case 'DONE':
                return <CheckCircle2 size={14} />;
            default:
                return <Circle size={14} />;
        }
    };

    const formatDueDate = (dueDate?: string) => {
        if (!dueDate) return null;
        const date = new Date(dueDate);
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days < 0) return { text: t.common?.overdue || 'Overdue', isOverdue: true };
        if (days === 0) return { text: t.common?.today || 'Today', isOverdue: false };
        if (days === 1) return { text: t.common?.tomorrow || 'Tomorrow', isOverdue: false };
        return { text: `${days}d`, isOverdue: false };
    };

    return (
        <Box
            sx={{
                height: '100%',
                borderRadius: 4,
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.08),
                bgcolor: 'background.paper',
                overflow: 'hidden',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    borderColor: alpha(theme.palette.success.main, 0.2),
                    boxShadow: `0 8px 24px ${alpha(theme.palette.common.black, 0.06)}`,
                },
            }}
        >
            {/* Header */}
            {showHeader && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2.5,
                        py: 2,
                        borderBottom: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.06),
                    }}
                >
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2.5,
                            bgcolor: alpha(theme.palette.success.main, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'success.main',
                        }}
                    >
                        <CheckSquare size={20} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {t.ai?.actionItems?.title || 'Action Items'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {totalPending > 0
                                ? `${totalPending} ${t.ai?.actionItems?.pending || 'pending'}`
                                : t.ai?.actionItems?.allDone || 'All done!'}
                        </Typography>
                    </Box>
                    {stats.overdue > 0 && (
                        <Chip
                            icon={<AlertCircle size={12} />}
                            label={stats.overdue}
                            size="small"
                            sx={{
                                bgcolor: alpha(theme.palette.error.main, 0.1),
                                color: 'error.main',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                '& .MuiChip-icon': { color: 'inherit' },
                            }}
                        />
                    )}
                </Box>
            )}

            {/* Content */}
            <Box sx={{ p: 2 }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {[1, 2, 3].map((i) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
                                <Skeleton variant="circular" width={32} height={32} />
                                <Box sx={{ flex: 1 }}>
                                    <Skeleton width="80%" height={18} />
                                    <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                ) : items.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Box
                            sx={{
                                width: 64,
                                height: 64,
                                borderRadius: 3,
                                bgcolor: alpha(theme.palette.success.main, 0.08),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <CheckCircle2 size={28} style={{ opacity: 0.5, color: theme.palette.success.main }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {t.ai?.actionItems?.noPending || 'No pending tasks'}
                        </Typography>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<CheckSquare size={16} />}
                            onClick={() => router.push('/dashboard/ai/action-items')}
                            sx={{
                                borderRadius: 2,
                                textTransform: 'none',
                                fontWeight: 600,
                                bgcolor: 'success.main',
                                '&:hover': { bgcolor: 'success.dark' },
                            }}
                        >
                            {t.ai?.actionItems?.viewAll || 'View All Tasks'}
                        </Button>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {items.map((item) => {
                            const dueInfo = formatDueDate(item.dueDate);
                            return (
                                <Box
                                    key={item.id}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        p: 1.5,
                                        borderRadius: 2.5,
                                        cursor: 'pointer',
                                        bgcolor: dueInfo?.isOverdue ? alpha(theme.palette.error.main, 0.06) : 'transparent',
                                        border: '1px solid',
                                        borderColor: dueInfo?.isOverdue ? alpha(theme.palette.error.main, 0.15) : 'transparent',
                                        transition: 'all 0.15s ease',
                                        '&:hover': {
                                            bgcolor: alpha(theme.palette.success.main, 0.06),
                                        },
                                    }}
                                    onClick={() => router.push('/dashboard/ai/action-items')}
                                >
                                    <Tooltip title={item.status}>
                                        <IconButton
                                            size="small"
                                            sx={{
                                                width: 32,
                                                height: 32,
                                                bgcolor: alpha(getPriorityColor(item.priority), 0.1),
                                                color: getPriorityColor(item.priority),
                                                '&:hover': {
                                                    bgcolor: alpha(getPriorityColor(item.priority), 0.2),
                                                },
                                            }}
                                        >
                                            {getStatusIcon(item.status)}
                                        </IconButton>
                                    </Tooltip>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: dueInfo?.isOverdue ? 600 : 500,
                                                fontSize: '0.875rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {item.title}
                                        </Typography>
                                        {item.sourceType && (
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ textTransform: 'capitalize' }}
                                            >
                                                {item.sourceType.toLowerCase()}
                                            </Typography>
                                        )}
                                    </Box>
                                    {dueInfo && (
                                        <Chip
                                            label={dueInfo.text}
                                            size="small"
                                            sx={{
                                                bgcolor: dueInfo.isOverdue
                                                    ? 'error.main'
                                                    : alpha(theme.palette.text.secondary, 0.1),
                                                color: dueInfo.isOverdue ? 'white' : 'text.secondary',
                                                fontSize: '0.65rem',
                                                fontWeight: 600,
                                                height: 20,
                                            }}
                                        />
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>

            {/* Footer */}
            {items.length > 0 && (
                <Box sx={{ px: 2.5, pb: 2 }}>
                    <Button
                        fullWidth
                        size="small"
                        endIcon={<ArrowRight size={16} />}
                        onClick={() => router.push('/dashboard/ai/action-items')}
                        sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 500,
                            color: 'success.main',
                            bgcolor: alpha(theme.palette.success.main, 0.06),
                            '&:hover': {
                                bgcolor: alpha(theme.palette.success.main, 0.12),
                            },
                        }}
                    >
                        {t.ai?.actionItems?.viewAll || 'View All Tasks'}
                    </Button>
                </Box>
            )}
        </Box>
    );
}

export default ActionItemsWidget;
