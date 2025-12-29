/**
 * Email Layout Component
 *
 * Main layout wrapper for the email module.
 * Provides the 3-panel layout: Sidebar | List | Preview
 *
 * Design inspiration: TailAdmin + Superhuman
 */

import React from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { FolderSidebar } from '../sidebar/FolderSidebar';

interface EmailLayoutProps {
  children: React.ReactNode;
}

/**
 * Email module layout with responsive 3-panel design
 *
 * - Mobile: Single panel (list or detail)
 * - Tablet: 2 panels (sidebar collapsed + content)
 * - Desktop: 3 panels (sidebar + list + preview)
 */
export function EmailLayout({ children }: EmailLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box
      sx={{
        display: 'flex',
        flex: 1,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        backgroundColor: 'background.default',
      }}
    >
      {/* Folder Sidebar - hidden on mobile */}
      {!isMobile && (
        <FolderSidebar collapsed={isTablet} />
      )}

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default EmailLayout;
