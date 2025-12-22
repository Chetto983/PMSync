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

  // Extract the main color from the gradient approach (simplified)
  // We'll use the first color of the gradient logic typically, but here we can rely on passed props or infer.
  // Actually, let's just use the gradients as accents or text gradients.

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        p: 2.5,
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: alpha(theme.palette.primary.main, 0.2), // Default hover
          boxShadow: `0 20px 40px ${alpha(theme.palette.common.black, 0.06)}`,
        },
      }}
    >
      {/* Icon */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 3,
          background: gradient, // Use gradient for icon background
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          mb: 2,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
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
              sx={{ borderRadius: 1 }}
            />
            <Skeleton
              width={80}
              height={18}
              sx={{ borderRadius: 1, mt: 0.5 }}
            />
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 800,
                  color: 'text.primary',
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
                    bgcolor: trend > 0 ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.error.main, 0.1),
                    color: trend > 0 ? 'success.main' : 'error.main',
                  }}
                >
                  {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem' }}>
                    {Math.abs(trend)}%
                  </Typography>
                </Box>
              )}
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
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
    </Box>
  );
}

import { brand } from '@/theme/tokens';

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
      // Primary (Cyan)
      gradient: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
      trend: stats?.unreadEmails && stats.unreadEmails > 10 ? 12 : undefined,
    },
    {
      value: stats?.todayEvents ?? 0,
      label: t.dashboard.home.stats.todayEvents,
      icon: <Calendar size={24} />,
      // Brand Purple for Events
      gradient: `linear-gradient(135deg, ${brand.purple} 0%, ${brand.purpleDeep} 100%)`,
    },
    {
      value: stats?.pendingTasks ?? 0,
      label: t.dashboard.home.stats.pendingTasks,
      icon: <CheckSquare size={24} />,
      // Brand Magenta for Tasks
      gradient: `linear-gradient(135deg, ${brand.magenta} 0%, ${brand.magentaBright} 100%)`,
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
