'use client';

import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { Mail, Calendar, CheckSquare, Users } from 'lucide-react';
import { DashboardCard } from '../DashboardCard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDashboardStats } from '@/hooks/queries';

export function StatsGrid() {
  const t = useTranslations();
  const { data: stats, isLoading } = useDashboardStats();

  const statItems = [
    {
      value: stats?.unreadEmails ?? 0,
      label: t.dashboard.home.stats.unreadEmails,
      icon: <Mail size={20} color="white" />,
      color: 'primary.main',
    },
    {
      value: stats?.todayEvents ?? 0,
      label: t.dashboard.home.stats.todayEvents,
      icon: <Calendar size={20} color="white" />,
      color: 'success.main',
    },
    {
      value: stats?.pendingTasks ?? 0,
      label: t.dashboard.home.stats.pendingTasks,
      icon: <CheckSquare size={20} color="white" />,
      color: 'warning.main',
    },
    {
      value: stats?.totalContacts ?? 0,
      label: t.dashboard.home.stats.contacts,
      icon: <Users size={20} color="white" />,
      color: 'info.main',
    },
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(4, minmax(0, 1fr))',
        },
      }}
    >
      {statItems.map((stat) => (
        <DashboardCard key={stat.label}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                bgcolor: stat.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {stat.icon}
            </Box>
            <Box>
              {isLoading ? (
                <>
                  <Skeleton width={40} height={28} />
                  <Skeleton width={80} height={16} />
                </>
              ) : (
                <>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stat.label}
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        </DashboardCard>
      ))}
    </Box>
  );
}

export default StatsGrid;
