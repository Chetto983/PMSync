'use client';

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Skeleton,
    Button,
    Avatar,
    alpha,
    useTheme,
} from '@mui/material';
import {
    Calendar,
    ArrowRight,
    Users,
    FileText,
    Clock,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { meetingPrepApi } from '@/lib/api/ai';

// Types
interface UpcomingMeeting {
    eventId: string;
    title: string;
    startTime: string;
    attendeeCount: number;
    prepScore: number;
}

// Query options for meetings needing prep
function meetingPrepOptions() {
    return queryOptions({
        queryKey: ['meetingPrep', 'upcoming'],
        queryFn: async (): Promise<{ meetings: UpcomingMeeting[]; count: number }> => {
            try {
                const response = await meetingPrepApi.getUpcomingMeetingsNeedingPrep({ hoursAhead: 24 });
                return {
                    meetings: response.data?.meetings || [],
                    count: response.data?.count || 0,
                };
            } catch {
                return { meetings: [], count: 0 };
            }
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        retry: 1,
    });
}

export function MeetingPrepWidget({ limit = 3, showHeader = true }: { limit?: number; showHeader?: boolean }) {
    const router = useRouter();
    const t = useTranslations();
    const theme = useTheme();
    const { data, isLoading } = useQuery(meetingPrepOptions());

    const meetings = (data?.meetings || []).slice(0, limit);
    const totalCount = data?.count || 0;

    const formatMeetingTime = (isoString: string) => {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (diffHours < 0) return t.common?.started || 'Started';
        if (diffHours === 0) return `${diffMinutes}m`;
        if (diffHours < 24) return `${diffHours}h ${diffMinutes}m`;
        return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const getPrepColor = (score: number) => {
        if (score >= 80) return 'success';
        if (score >= 50) return 'warning';
        return 'error';
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
                    borderColor: alpha(theme.palette.secondary.main, 0.2),
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
                            bgcolor: alpha(theme.palette.secondary.main, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'secondary.main',
                        }}
                    >
                        <FileText size={20} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {t.ai?.meetingPrep?.title || 'Meeting Prep'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {totalCount > 0
                                ? `${totalCount} ${t.ai?.meetingPrep?.needingPrep || 'need preparation'}`
                                : t.ai?.meetingPrep?.allPrepared || 'All prepared'}
                        </Typography>
                    </Box>
                    {totalCount > 3 && (
                        <Chip
                            label={`+${totalCount - 3}`}
                            size="small"
                            sx={{
                                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                                color: 'secondary.main',
                                fontWeight: 600,
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
                                    <Skeleton width="70%" height={18} />
                                    <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
                                </Box>
                            </Box>
                        ))}
                    </Box>
                ) : meetings.length === 0 ? (
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
                            <Calendar size={28} style={{ opacity: 0.5, color: theme.palette.success.main }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            {t.ai?.meetingPrep?.noMeetings || 'No upcoming meetings'}
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {meetings.map((meeting) => {
                            const prepColor = getPrepColor(meeting.prepScore);
                            return (
                                <Box
                                    key={meeting.eventId}
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
                                            bgcolor: alpha(theme.palette.secondary.main, 0.06),
                                            borderColor: alpha(theme.palette.secondary.main, 0.15),
                                        },
                                    }}
                                    onClick={() => router.push(`/dashboard/calendar?eventId=${meeting.eventId}`)}
                                >
                                    <Avatar
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            bgcolor: alpha(theme.palette.secondary.main, 0.1),
                                            color: 'secondary.main',
                                        }}
                                    >
                                        <Calendar size={20} />
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 500,
                                                fontSize: '0.875rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {meeting.title}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Clock size={12} />
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatMeetingTime(meeting.startTime)}
                                                </Typography>
                                            </Box>
                                            {meeting.attendeeCount > 0 && (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Users size={12} />
                                                    <Typography variant="caption" color="text.secondary">
                                                        {meeting.attendeeCount}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>
                                    <Chip
                                        label={`${meeting.prepScore}%`}
                                        size="small"
                                        color={prepColor as 'success' | 'warning' | 'error'}
                                        sx={{
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
            {meetings.length > 0 && (
                <Box sx={{ px: 2.5, pb: 2 }}>
                    <Button
                        fullWidth
                        size="small"
                        endIcon={<ArrowRight size={16} />}
                        onClick={() => router.push('/dashboard/calendar')}
                        sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 500,
                            color: 'secondary.main',
                            bgcolor: alpha(theme.palette.secondary.main, 0.06),
                            '&:hover': {
                                bgcolor: alpha(theme.palette.secondary.main, 0.12),
                            },
                        }}
                    >
                        {t.ai?.meetingPrep?.viewCalendar || 'View Calendar'}
                    </Button>
                </Box>
            )}
        </Box>
    );
}

export default MeetingPrepWidget;
