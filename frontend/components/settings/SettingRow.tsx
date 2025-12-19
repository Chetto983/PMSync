import React from 'react';
import { Box, Typography } from '@mui/material';

export interface SettingRowProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}

export function SettingRow({ icon, title, description, children, noBorder }: SettingRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        py: 2,
        px: 0,
        borderBottom: noBorder ? 0 : 1,
        borderColor: 'divider',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        {icon && (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ flexShrink: 0 }}>{children}</Box>
    </Box>
  );
}
