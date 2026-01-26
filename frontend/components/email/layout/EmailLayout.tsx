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
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { FolderSidebar } from '../sidebar/FolderSidebar';
import { MobileEmailNav } from './MobileEmailNav';

interface EmailLayoutProps {
  children: React.ReactNode;
  /** Reading pane content (thread view) - shown on desktop as 3rd panel */
  readingPane?: React.ReactNode;
  /** Callback when reading pane is closed */
  onCloseReadingPane?: () => void;
}

/**
 * Email module layout with responsive 3-panel design
 *
 * - Mobile: Single panel (list or detail)
 * - Tablet: 2 panels (sidebar collapsed + content)
 * - Desktop: 3 panels (sidebar + list + preview)
 */
export function EmailLayout({ children, readingPane, onCloseReadingPane: _onCloseReadingPane }: EmailLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const layoutStorage = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        getItem: (_key: string): string | null => null,
        setItem: (_key: string, _value: string): void => {},
      };
    }

    return window.localStorage;
  }, []);
  const twoPanelLayout = useDefaultLayout({
    id: 'email-layout-2panel',
    panelIds: ['email-sidebar', 'email-list'],
    storage: layoutStorage,
  });
  const threePanelLayout = useDefaultLayout({
    id: 'email-layout-3panel',
    panelIds: ['email-sidebar', 'email-list', 'email-reading-pane'],
    storage: layoutStorage,
  });

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

  // Desktop: resizable 2 or 3 panel layout
  // Use separate autoSaveIds to preserve sizes independently
  const hasReadingPane = Boolean(readingPane);

  // 2-panel mode (no reading pane selected)
  if (!hasReadingPane) {
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
        <Group
          id="email-layout-2panel"
          orientation="horizontal"
          defaultLayout={twoPanelLayout.defaultLayout}
          onLayoutChanged={twoPanelLayout.onLayoutChanged}
          style={{ height: '100%' }}
        >
          {/* Sidebar Panel */}
          <Panel
            id="email-sidebar"
            defaultSize={15}
            minSize={12}
            maxSize={25}
            style={{ display: 'flex' }}
          >
            <FolderSidebar collapsed={false} />
          </Panel>

          {/* Resize Handle */}
          <Separator
            style={{
              width: 4,
              backgroundColor: 'transparent',
              cursor: 'col-resize',
              position: 'relative',
              transition: 'background-color 0.15s',
            }}
            className="resize-handle"
          />

          {/* Email List Panel - Full width */}
          <Panel
            id="email-list"
            defaultSize={85}
            minSize={50}
            style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
          >
            {children}
          </Panel>
        </Group>

        {/* CSS for resize handle hover effect */}
        <style jsx global>{`
          .resize-handle:hover,
          .resize-handle:focus-visible,
          .resize-handle:active {
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

  // 3-panel mode (reading pane visible)
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
      <Group
        id="email-layout-3panel"
        orientation="horizontal"
        defaultLayout={threePanelLayout.defaultLayout}
        onLayoutChanged={threePanelLayout.onLayoutChanged}
        style={{ height: '100%' }}
      >
        {/* Sidebar Panel */}
        <Panel
          id="email-sidebar"
          defaultSize={15}
          minSize={10}
          maxSize={20}
          style={{ display: 'flex' }}
        >
          <FolderSidebar collapsed={false} />
        </Panel>

        {/* Resize Handle */}
        <Separator
          style={{
            width: 4,
            backgroundColor: 'transparent',
            cursor: 'col-resize',
            position: 'relative',
            transition: 'background-color 0.15s',
          }}
          className="resize-handle"
        />

        {/* Email List Panel */}
        <Panel
          id="email-list"
          defaultSize={30}
          minSize={25}
          maxSize={45}
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
        >
          {children}
        </Panel>

        {/* Resize Handle */}
        <Separator
          style={{
            width: 4,
            backgroundColor: 'transparent',
            cursor: 'col-resize',
            position: 'relative',
            transition: 'background-color 0.15s',
          }}
          className="resize-handle"
        />

        {/* Reading Pane Panel */}
        <Panel
          id="email-reading-pane"
          defaultSize={55}
          minSize={35}
          maxSize={65}
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
        >
          {readingPane}
        </Panel>
      </Group>

      {/* CSS for resize handle hover effect */}
      <style jsx global>{`
        .resize-handle:hover,
        .resize-handle:focus-visible,
        .resize-handle:active {
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
