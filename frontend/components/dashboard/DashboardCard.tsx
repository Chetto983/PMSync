'use client';

import React from 'react';
import { Box, Typography, IconButton, alpha, useTheme, SxProps, Theme } from '@mui/material';
import { MoreVertical } from 'lucide-react';

export interface DashboardCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconColor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
  sx?: SxProps<Theme>;
}

export function DashboardCard({
  title,
  subtitle,
  icon,
  iconColor = 'primary.main',
  action,
  children,
  noPadding = false,
  sx,
}: DashboardCardProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
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
        ...sx,
      }}
    >
      {/* Header */}
      {(title || icon) && (
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
          {icon && (
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2.5,
                bgcolor: alpha(
                  typeof iconColor === 'string' && iconColor.includes('.')
                    ? theme.palette.primary.main
                    : iconColor,
                  0.1
                ),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: iconColor,
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  lineHeight: 1.3,
                  color: 'text.primary',
                }}
              >
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                  lineHeight: 1.3,
                  display: 'block',
                  mt: 0.25,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {action !== undefined ? (
            action
          ) : (
            <IconButton
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: 'primary.main',
                },
              }}
            >
              <MoreVertical size={18} />
            </IconButton>
          )}
        </Box>
      )}

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          px: noPadding ? 0 : 2.5,
          py: noPadding ? 0 : 2,
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default DashboardCard;
