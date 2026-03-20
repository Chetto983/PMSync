import React from 'react';
import { Box, Typography } from '@mui/material';

interface PageContainerProps {
  children: React.ReactNode;
  /** Page title — rendered as h5 */
  title?: string;
  /** Subtitle below title */
  subtitle?: string;
  /** Max content width in px (default 1200, false = no limit) */
  maxWidth?: number | false;
  /** Action buttons rendered on the right side of the header */
  actions?: React.ReactNode;
}

/**
 * Shared page wrapper — standardizes padding, maxWidth, and page header
 * across all content pages. Full-bleed pages (Email, AI Chat, Calendar,
 * Contacts, Tasks, Settings) should NOT use this component.
 */
export function PageContainer({
  children,
  title,
  subtitle,
  maxWidth = 1200,
  actions,
}: PageContainerProps) {
  return (
    <Box
      sx={{
        ...(maxWidth !== false && { maxWidth, mx: 'auto' }),
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 4 },
        width: '100%',
      }}
    >
      {title && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: { xs: 3, md: 4 },
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions}
        </Box>
      )}
      {children}
    </Box>
  );
}
