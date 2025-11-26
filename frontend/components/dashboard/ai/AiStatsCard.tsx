'use client';

import React from 'react';
import { Box, Typography, Skeleton, alpha, useTheme, useMediaQuery } from '@mui/material';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface AiStatsCardProps {
  /** Card title */
  title: string;
  /** Main value to display */
  value: number | string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Icon component */
  icon: React.ReactNode;
  /** Color type from theme: 'primary' | 'success' | 'warning' | 'error' | 'info' */
  colorType?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  /** Trend percentage (positive = up, negative = down) */
  trend?: number;
  /** Trend label */
  trendLabel?: string;
  /** Loading state */
  loading?: boolean;
  /** Click handler */
  onClick?: () => void;
}

/**
 * AiStatsCard - Modern stats card using global theme
 * Features:
 * - Uses theme.palette colors
 * - Consistent with pmSyncColors
 * - Trend indicator
 * - Mobile responsive
 */
export function AiStatsCard({
  title,
  value,
  subtitle,
  icon,
  colorType = 'primary',
  trend,
  trendLabel,
  loading = false,
  onClick,
}: AiStatsCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Get color from theme palette
  const accentColor = theme.palette[colorType].main;

  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) return <Minus size={12} />;
    return trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />;
  };

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return theme.palette.text.secondary;
    return trend > 0 ? theme.palette.success.main : theme.palette.error.main;
  };

  if (loading) {
    return (
      <Box
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Skeleton variant="circular" width={40} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="text" width="60%" height={32} />
        <Skeleton variant="text" width="40%" height={20} />
      </Box>
    );
  }

  return (
    <Box
      onClick={onClick}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 1.5,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        // Use theme background
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: isDark
          ? `0 4px 24px ${alpha(accentColor, 0.15)}`
          : `0 2px 8px ${alpha(theme.palette.common.black, 0.08)}`,
        transition: 'all 0.2s ease-in-out',
        '&:hover': onClick
          ? {
              transform: 'translateY(-2px)',
              boxShadow: isDark
                ? `0 8px 32px ${alpha(accentColor, 0.25)}`
                : `0 4px 16px ${alpha(theme.palette.common.black, 0.12)}`,
              borderColor: alpha(accentColor, 0.3),
            }
          : {},
      }}
    >
      {/* Icon with theme gradient background */}
      <Box
        sx={{
          width: { xs: 36, sm: 44 },
          height: { xs: 36, sm: 44 },
          borderRadius: 1,
          background: `linear-gradient(135deg, ${accentColor} 0%, ${alpha(accentColor, 0.7)} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: { xs: 1.5, sm: 2 },
          boxShadow: `0 4px 14px ${alpha(accentColor, 0.4)}`,
          color: theme.palette.common.white,
          '& svg': {
            width: isMobile ? 18 : 22,
            height: isMobile ? 18 : 22,
          },
        }}
      >
        {icon}
      </Box>

      {/* Value */}
      <Typography
        variant={isMobile ? 'h5' : 'h4'}
        sx={{
          fontWeight: 700,
          mb: 0.5,
          color: 'text.primary',
        }}
      >
        {value}
      </Typography>

      {/* Title */}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          fontWeight: 500,
          mb: trend !== undefined ? 1 : 0,
          fontSize: { xs: '0.75rem', sm: '0.875rem' },
        }}
      >
        {title}
      </Typography>

      {/* Subtitle */}
      {subtitle && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', opacity: 0.7, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
        >
          {subtitle}
        </Typography>
      )}

      {/* Trend indicator */}
      {trend !== undefined && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              px: 0.75,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: alpha(
                trend > 0 ? theme.palette.success.main : trend < 0 ? theme.palette.error.main : theme.palette.grey[500],
                0.1
              ),
              color: getTrendColor(),
            }}
          >
            {getTrendIcon()}
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem' }}>
              {Math.abs(trend)}%
            </Typography>
          </Box>
          {trendLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {trendLabel}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

export default AiStatsCard;
