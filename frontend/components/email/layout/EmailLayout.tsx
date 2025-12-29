/**
 * Email Layout Component
 *
 * Main layout wrapper for the email module.
 * Provides the 3-panel layout: Sidebar | List | Preview
 * Uses react-resizable-panels for smooth resizing.
 *
 * Design inspiration: TailAdmin + Superhuman
 * @see https://github.com/bvaughn/react-resizable-panels
 */

import React from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FolderSidebar } from '../sidebar/FolderSidebar';
import { MobileEmailNav } from './MobileEmailNav';

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

  // Mobile: bottom navigation bar + folder sheet
  if (isMobile) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: 'background.default',
          position: 'relative',
        }}
      >
        {/* Main content with bottom padding for nav bar */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            pb: '72px', // Space for bottom nav
          }}
        >
          {children}
        </Box>

        {/* Mobile bottom navigation */}
        <MobileEmailNav />
      </Box>
    );
  }

  // Tablet: same as mobile - bottom navigation with FAB, no sidebar
  if (isTablet) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: 'background.default',
          position: 'relative',
        }}
      >
        {/* Main content with bottom padding for nav bar */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            pb: '72px', // Space for bottom nav
          }}
        >
          {children}
        </Box>

        {/* Tablet bottom navigation */}
        <MobileEmailNav />
      </Box>
    );
  }

  // Desktop: resizable sidebar
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
      <PanelGroup
        direction="horizontal"
        autoSaveId="email-layout-panels"
        style={{ height: '100%' }}
      >
        {/* Sidebar Panel */}
        <Panel
          defaultSize={15}
          minSize={12}
          maxSize={25}
          style={{ display: 'flex' }}
        >
          <FolderSidebar collapsed={false} />
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle
          style={{
            width: 4,
            backgroundColor: 'transparent',
            cursor: 'col-resize',
            position: 'relative',
            transition: 'background-color 0.15s',
          }}
          className="resize-handle"
        />

        {/* Main Content Panel */}
        <Panel style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {children}
        </Panel>
      </PanelGroup>

      {/* CSS for resize handle hover effect */}
      <style jsx global>{`
        .resize-handle:hover,
        .resize-handle[data-resize-handle-active] {
          background-color: ${theme.palette.primary.main} !important;
        }
        .resize-handle::after {
          content: '';
          position: absolute;
          top: 0;
          left: -3px;
          right: -3px;
          bottom: 0;
        }
      `}</style>
    </Box>
  );
}

export default EmailLayout;
