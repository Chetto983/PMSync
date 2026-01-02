'use client';

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Skeleton,
    Button,
    LinearProgress,
    alpha,
    useTheme,
} from '@mui/material';
import {
    TrendingUp,
    ArrowRight,
    Mail,
    Clock,
    Zap,
    BarChart2,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useTranslations } from '@/lib/hooks/use-translations';
import { voltAgentApi } from '@/lib/api/ai';

// Types for analytics data
interface DashboardAnalytics {
    totalActions?: number;
    approvalRate?: number;
    learningProgress?: number;
}

interface EmailAnalytics {
    totalEmails?: number;
    newThisWeek?: number;
    avgResponseTime?: number;
}

// Query options for AI analytics
function aiAnalyticsOptions() {
    return queryOptions({
        queryKey: ['aiAnalytics', 'dashboard'],
        queryFn: async (): Promise<{ dashboard: DashboardAnalytics | null; email: EmailAnalytics | null }> => {
            try {
                const [dashboardRes, emailRes] = await Promise.allSettled([
                    voltAgentApi.getDashboardAnalytics(),
                    voltAgentApi.getEmailAnalytics({ period: 'week' }),
                ]);

                const dashboard = dashboardRes.status === 'fulfilled'
                    ? (dashboardRes.value.data?.analytics as DashboardAnalytics)
                    : null;
                const email = emailRes.status === 'fulfilled'
                    ? (emailRes.value.data?.analytics as EmailAnalytics)
                    : null;

                return { dashboard, email };
            } catch {
                return { dashboard: null, email: null };
            }
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        retry: 1,
    });
}

interface StatCardProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    subtext?: string;
    color: string;
}

function StatCard({ icon, label, value, subtext, color }: StatCardProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: 2,
                bgcolor: alpha(color, 0.06),
                border: '1px solid',
                borderColor: alpha(color, 0.15),
            }}
        >
            <Box
                sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    bgcolor: alpha(color, 0.15),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color,
                }}
            >
                {icon}
            </Box>
            <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', color }}>
                    {value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {label}
                </Typography>
            </Box>
            {subtext && (
                <Chip
                    label={subtext}
                    size="small"
                    sx={{
                        bgcolor: alpha(color, 0.1),
                        color,
                        fontWeight: 600,
                        fontSize: '0.65rem',
                    }}
                />
            )}
        </Box>
    );
}

export function AiAnalyticsWidget({ showHeader = true }: { showHeader?: boolean }) {
    const router = useRouter();
    const t = useTranslations();
    const theme = useTheme();
    const { data, isLoading } = useQuery(aiAnalyticsOptions());

    const dashboard = data?.dashboard;
    const email = data?.email;

    const formatDuration = (minutes: number | undefined | null): string => {
        if (minutes == null || !isFinite(minutes) || minutes < 0) return '0m';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
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
                    borderColor: alpha(theme.palette.primary.main, 0.2),
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
                            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                        }}
                    >
                        <BarChart2 size={20} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {t.ai?.analytics?.title || 'AI Analytics'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t.ai?.analytics?.subtitle || 'This week\'s insights'}
                        </Typography>
                    </Box>
                </Box>
            )}

            {/* Content */}
            <Box sx={{ p: 2 }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} variant="rounded" height={60} sx={{ borderRadius: 2 }} />
                        ))}
                    </Box>
                ) : !dashboard && !email ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Box
                            sx={{
                                width: 64,
                                height: 64,
                                borderRadius: 3,
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <TrendingUp size={28} style={{ opacity: 0.5, color: theme.palette.primary.main }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {t.ai?.analytics?.noData || 'No analytics data available'}
                        </Typography>
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<BarChart2 size={16} />}
                            onClick={() => router.push('/dashboard/analytics')}
                            sx={{
                                borderRadius: 2,
                                textTransform: 'none',
                                fontWeight: 600,
                            }}
                        >
                            {t.ai?.analytics?.viewAll || 'View Analytics'}
                        </Button>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {/* Email stats */}
                        {email && (
                            <>
                                <StatCard
                                    icon={<Mail size={18} />}
                                    label={t.ai?.analytics?.emailsProcessed || 'Emails processed'}
                                    value={email.totalEmails || 0}
                                    subtext={`+${email.newThisWeek || 0} ${t.ai?.analytics?.thisWeek || 'this week'}`}
                                    color={theme.palette.primary.main}
                                />
                                <StatCard
                                    icon={<Clock size={18} />}
                                    label={t.ai?.analytics?.avgResponseTime || 'Avg response time'}
                                    value={formatDuration(email.avgResponseTime || 0)}
                                    color={theme.palette.info.main}
                                />
                            </>
                        )}

                        {/* AI performance */}
                        {dashboard && (
                            <>
                                <StatCard
                                    icon={<Zap size={18} />}
                                    label={t.ai?.analytics?.aiActions || 'AI actions'}
                                    value={dashboard.totalActions || 0}
                                    subtext={`${dashboard.approvalRate || 0}% ${t.ai?.analytics?.approved || 'approved'}`}
                                    color={theme.palette.success.main}
                                />

                                {/* Learning progress bar */}
                                <Box sx={{ mt: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                            {t.ai?.analytics?.learningProgress || 'AI Learning Progress'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {dashboard.learningProgress || 0}%
                                        </Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={dashboard.learningProgress || 0}
                                        sx={{
                                            height: 6,
                                            borderRadius: 3,
                                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                                            '& .MuiLinearProgress-bar': {
                                                borderRadius: 3,
                                                background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                                            },
                                        }}
                                    />
                                </Box>
                            </>
                        )}
                    </Box>
                )}
            </Box>

            {/* Footer */}
            {(dashboard || email) && (
                <Box sx={{ px: 2.5, pb: 2 }}>
                    <Button
                        fullWidth
                        size="small"
                        endIcon={<ArrowRight size={16} />}
                        onClick={() => router.push('/dashboard/analytics')}
                        sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 500,
                            color: 'primary.main',
                            bgcolor: alpha(theme.palette.primary.main, 0.06),
                            '&:hover': {
                                bgcolor: alpha(theme.palette.primary.main, 0.12),
                            },
                        }}
                    >
                        {t.ai?.analytics?.viewAll || 'View All Analytics'}
                    </Button>
                </Box>
            )}
        </Box>
    );
}

export default AiAnalyticsWidget;
