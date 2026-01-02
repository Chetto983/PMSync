'use client';

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Skeleton,
    Button,
    Tooltip,
    alpha,
    useTheme,
} from '@mui/material';
import {
    Clock,
    ArrowRight,
    Sun,
    Moon,
    Zap,
    Target,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { focusTimeApi, type FocusTimeSlot, type FocusTimeStats } from '@/lib/api/ai';

// Query options for focus time data
function focusTimeOptions() {
    return queryOptions({
        queryKey: ['focusTime', 'dashboard'],
        queryFn: async (): Promise<{
            slots: FocusTimeSlot[];
            stats: FocusTimeStats | null;
            isInFocusBlock: boolean;
            currentBlock?: { start: string; end: string; remaining: number };
        }> => {
            try {
                const [slotsRes, statsRes, statusRes] = await Promise.allSettled([
                    focusTimeApi.getOptimalSlots({ numSlots: 3 }),
                    focusTimeApi.getStats({ days: 7 }),
                    focusTimeApi.getStatus(),
                ]);

                return {
                    slots: slotsRes.status === 'fulfilled' ? slotsRes.value.data?.slots || [] : [],
                    stats: statsRes.status === 'fulfilled' ? statsRes.value.data?.stats || null : null,
                    isInFocusBlock: statusRes.status === 'fulfilled' ? statusRes.value.data?.isInFocusBlock || false : false,
                    currentBlock: statusRes.status === 'fulfilled' ? statusRes.value.data?.currentBlock : undefined,
                };
            } catch {
                return { slots: [], stats: null, isInFocusBlock: false };
            }
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        retry: 1,
    });
}

export function FocusTimeWidget({ showHeader = true }: { showHeader?: boolean }) {
    const router = useRouter();
    const t = useTranslations();
    const theme = useTheme();
    const { data, isLoading } = useQuery(focusTimeOptions());

    const slots = data?.slots || [];
    const stats = data?.stats;
    const isInFocusBlock = data?.isInFocusBlock || false;
    const currentBlock = data?.currentBlock;

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (minutes: number | undefined | null): string => {
        if (minutes == null || !isFinite(minutes) || minutes < 0) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    const getTimeOfDay = (isoString: string) => {
        const hour = new Date(isoString).getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
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
                    borderColor: alpha(theme.palette.info.main, 0.2),
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
                            bgcolor: isInFocusBlock
                                ? alpha(theme.palette.success.main, 0.15)
                                : alpha(theme.palette.info.main, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isInFocusBlock ? 'success.main' : 'info.main',
                        }}
                    >
                        <Target size={20} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {t.ai?.focusTime?.title || 'Focus Time'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {isInFocusBlock
                                ? t.ai?.focusTime?.inFocusMode || 'In focus mode'
                                : t.ai?.focusTime?.subtitle || 'Optimal work slots'}
                        </Typography>
                    </Box>
                    {isInFocusBlock && currentBlock && (
                        <Chip
                            icon={<Zap size={12} />}
                            label={`${isFinite(currentBlock.remaining) ? Math.round(currentBlock.remaining / 60) : 0}m ${t.common?.remaining || 'left'}`}
                            size="small"
                            sx={{
                                bgcolor: 'success.main',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.7rem',
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
                                <Skeleton variant="rounded" width={44} height={44} />
                                <Box sx={{ flex: 1 }}>
                                    <Skeleton width="60%" height={18} />
                                    <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                ) : slots.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Box
                            sx={{
                                width: 64,
                                height: 64,
                                borderRadius: 3,
                                bgcolor: alpha(theme.palette.info.main, 0.08),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <Clock size={28} style={{ opacity: 0.5, color: theme.palette.info.main }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {t.ai?.focusTime?.noSlots || 'No optimal slots found'}
                        </Typography>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<Target size={16} />}
                            onClick={() => router.push('/dashboard/ai')}
                            sx={{
                                borderRadius: 2,
                                textTransform: 'none',
                                fontWeight: 600,
                                bgcolor: 'info.main',
                                '&:hover': { bgcolor: 'info.dark' },
                            }}
                        >
                            {t.ai?.focusTime?.findSlots || 'Find Focus Slots'}
                        </Button>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {/* Stats summary */}
                        {stats && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    gap: 2,
                                    p: 1.5,
                                    mb: 1,
                                    borderRadius: 2,
                                    bgcolor: alpha(theme.palette.info.main, 0.04),
                                }}
                            >
                                <Box sx={{ textAlign: 'center', flex: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.main' }}>
                                        {formatDuration(stats?.averageDailyFocus)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {t.ai?.focusTime?.avgDaily || 'avg/day'}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'center', flex: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                                        {stats?.optimalDays ?? 0}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {t.ai?.focusTime?.optimalDays || 'optimal days'}
                                    </Typography>
                                </Box>
                            </Box>
                        )}

                        {/* Slots list */}
                        {slots.map((slot, index) => {
                            const timeOfDay = getTimeOfDay(slot.start);
                            const TimeIcon = timeOfDay === 'morning' ? Sun : Moon;

                            return (
                                <Box
                                    key={index}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        p: 1.5,
                                        borderRadius: 2.5,
                                        cursor: 'pointer',
                                        border: '1px solid',
                                        borderColor: 'transparent',
                                        transition: 'all 0.15s ease',
                                        '&:hover': {
                                            bgcolor: alpha(theme.palette.info.main, 0.06),
                                            borderColor: alpha(theme.palette.info.main, 0.15),
                                        },
                                    }}
                                    onClick={() => router.push('/dashboard/ai')}
                                >
                                    <Tooltip title={timeOfDay}>
                                        <Box
                                            sx={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 2,
                                                bgcolor: alpha(theme.palette.info.main, 0.1),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'info.main',
                                            }}
                                        >
                                            <TimeIcon size={20} />
                                        </Box>
                                    </Tooltip>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 500, fontSize: '0.875rem' }}
                                        >
                                            {formatTime(slot.start)} - {formatTime(slot.end)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {formatDuration(slot.duration)}
                                            {slot.conflictCount === 0 && (
                                                <Chip
                                                    label={t.ai?.focusTime?.noConflicts || 'No conflicts'}
                                                    size="small"
                                                    sx={{
                                                        ml: 1,
                                                        height: 16,
                                                        fontSize: '0.6rem',
                                                        bgcolor: alpha(theme.palette.success.main, 0.1),
                                                        color: 'success.main',
                                                    }}
                                                />
                                            )}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label={`${(() => {
                                            if (!isFinite(slot.score)) return 0;
                                            // Handle both decimal (0-1) and percentage (0-100) formats
                                            const pct = slot.score > 1 ? slot.score : slot.score * 100;
                                            // Clamp to 0-100 range
                                            return Math.min(100, Math.max(0, Math.round(pct)));
                                        })()}%`}
                                        size="small"
                                        sx={{
                                            bgcolor: alpha(theme.palette.info.main, 0.1),
                                            color: 'info.main',
                                            fontWeight: 600,
                                            fontSize: '0.7rem',
                                        }}
                                    />
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>

            {/* Footer */}
            {slots.length > 0 && (
                <Box sx={{ px: 2.5, pb: 2 }}>
                    <Button
                        fullWidth
                        size="small"
                        endIcon={<ArrowRight size={16} />}
                        onClick={() => router.push('/dashboard/ai')}
                        sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 500,
                            color: 'info.main',
                            bgcolor: alpha(theme.palette.info.main, 0.06),
                            '&:hover': {
                                bgcolor: alpha(theme.palette.info.main, 0.12),
                            },
                        }}
                    >
                        {t.ai?.focusTime?.createBlocks || 'Create Focus Blocks'}
                    </Button>
                </Box>
            )}
        </Box>
    );
}

export default FocusTimeWidget;
