'use client';

import React from 'react';
import { Box, Typography, Skeleton, alpha, useTheme } from '@mui/material';
import { Mail, Calendar, CheckSquare, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDashboardStats } from '@/hooks/queries';

interface StatCardProps {
  value: number;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  trend?: number;
  isLoading?: boolean;
}

function StatCard({ value, label, icon, gradient, trend, isLoading }: StatCardProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        background: gradient,
        p: 2.5,
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 20px 40px ${alpha(theme.palette.common.black, 0.15)}`,
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          right: 0,
          width: '50%',
          height: '100%',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
        },
      }}
    >
      {/* Icon */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 3,
          bgcolor: 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          mb: 2,
        }}
      >
        {icon}
      </Box>

      {/* Value & Label */}
      <Box>
        {isLoading ? (
          <>
            <Skeleton
              width={60}
              height={36}
              sx={{ bgcolor: 'rgba(255,255,255,0.3)', borderRadius: 1 }}
            />
            <Skeleton
              width={80}
              height={18}
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 1, mt: 0.5 }}
            />
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 800,
                  color: 'white',
                  fontSize: { xs: '2rem', md: '2.5rem' },
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {value}
              </Typography>
              {trend !== undefined && trend !== 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: trend > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,100,100,0.3)',
                  }}
                >
                  {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <Typography variant="caption" sx={{ color: 'white', fontWeight: 600, fontSize: '0.65rem' }}>
                    {Math.abs(trend)}%
                  </Typography>
                </Box>
              )}
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255,255,255,0.85)',
                fontWeight: 500,
                mt: 0.5,
                fontSize: '0.85rem',
              }}
            >
              {label}
            </Typography>
          </>
        )}
      </Box>

      {/* Decorative circles */}
      <Box
        sx={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 100,
          height: 100,
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.08)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -20,
          right: 40,
          width: 60,
          height: 60,
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.05)',
        }}
      />
    </Box>
  );
}

export function StatsGrid() {
  const t = useTranslations();
  const theme = useTheme();
  const { data: stats, isLoading } = useDashboardStats();

  // Only show important stats - removed contacts as per user feedback
  const statItems = [
    {
      value: stats?.unreadEmails ?? 0,
      label: t.dashboard.home.stats.unreadEmails,
      icon: <Mail size={24} />,
      gradient: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
      trend: stats?.unreadEmails && stats.unreadEmails > 10 ? 12 : undefined,
    },
    {
      value: stats?.todayEvents ?? 0,
      label: t.dashboard.home.stats.todayEvents,
      icon: <Calendar size={24} />,
      gradient: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
    },
    {
      value: stats?.pendingTasks ?? 0,
      label: t.dashboard.home.stats.pendingTasks,
      icon: <CheckSquare size={24} />,
      gradient: `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.warning.dark} 100%)`,
    },
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gap: { xs: 2, md: 3 },
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(3, 1fr)',
        },
      }}
    >
      {statItems.map((stat) => (
        <StatCard
          key={stat.label}
          value={stat.value}
          label={stat.label}
          icon={stat.icon}
          gradient={stat.gradient}
          trend={stat.trend}
          isLoading={isLoading}
        />
      ))}
    </Box>
  );
}

export default StatsGrid;
