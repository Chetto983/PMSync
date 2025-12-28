import React, { useCallback, useState, useEffect } from 'react';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

/**
 * Default panel sizes (percentages)
 * Outlook-style: Sidebar ~18%, List ~35%, Detail ~47%
 */
const DEFAULT_SIZES = {
  sidebar: 18,
  list: 35,
};

// Minimum sizes to prevent collapse (percentage)
const MIN_SIZES = {
  sidebar: 12,
  list: 25,
  detail: 30,
};

const STORAGE_KEY = 'mailagent-email-panel-sizes';

/**
 * Validate and clamp sizes to prevent broken layouts
 */
const validateSizes = (sizes: { sidebar?: number; list?: number }) => {
  const sidebar = Math.max(MIN_SIZES.sidebar, Math.min(30, sizes.sidebar ?? DEFAULT_SIZES.sidebar));
  const list = Math.max(MIN_SIZES.list, Math.min(55, sizes.list ?? DEFAULT_SIZES.list));
  return { sidebar, list };
};

/**
 * Clear corrupted localStorage on load
 */
const clearCorruptedStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // If values are corrupted (too small), clear them
      if (parsed.sidebar < MIN_SIZES.sidebar || parsed.list < MIN_SIZES.list) {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  }
  return false;
};

/**
 * Props for ResizableEmailLayout component
 */
interface ResizableEmailLayoutProps {
  sidebar: React.ReactNode;
  list: React.ReactNode;
  detail?: React.ReactNode;
  showDetail?: boolean;
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
  height?: string;
  persistSizes?: boolean;
}

/**
 * Outlook-style resize handle - minimal and clean
 */
function OutlookResizeHandle({ id }: { id?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const theme = useTheme();

  const active = isHovered || isDragging;

  return (
    <PanelResizeHandle
      id={id}
      onDragging={setIsDragging}
      style={{
        width: 6,
        background: active ? theme.palette.primary.light : 'transparent',
        cursor: 'col-resize',
        transition: 'background 0.15s ease',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visual indicator line */}
      <Box
        sx={{
          width: 3,
          height: 40,
          borderRadius: 1,
          backgroundColor: active ? 'primary.main' : 'action.disabled',
          opacity: active ? 1 : 0.5,
          transition: 'all 0.15s ease',
        }}
      />
    </PanelResizeHandle>
  );
}

/**
 * ResizableEmailLayout - Outlook-style clean 3-pane email interface
 * 
 * Uses react-resizable-panels v2.x API (stable)
 */
export const ResizableEmailLayout: React.FC<ResizableEmailLayoutProps> = ({
  sidebar,
  list,
  detail,
  showDetail = false,
  sidebarOpen = false,
  onSidebarClose,
  height = '100%',
  persistSizes = true,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isVerySmallMobile = useMediaQuery('(max-width:360px)');

  // Clear corrupted storage on first load
  useEffect(() => {
    clearCorruptedStorage();
  }, []);
  // Handle panel resize - v2 API passes array of sizes
  const handlePanelResize = useCallback(
    (sizes: number[]) => {
      if (typeof window === 'undefined' || !persistSizes) return;

      try {
        // v2 API: sizes is array [sidebar%, list%, detail%?]
        const validated = validateSizes({
          sidebar: sizes[0],
          list: sizes[1],
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      } catch {
        // Ignore storage errors
      }
    },
    [persistSizes]
  );
  const [initialSizes] = useState(() => {
    if (typeof window === 'undefined' || !persistSizes) {
      return DEFAULT_SIZES;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return validateSizes(parsed);
      }
    } catch {
      // Ignore
    }
    return DEFAULT_SIZES;
  });

  // Mobile layout
  if (isMobile) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
          minHeight: 0,
          minWidth: 0,
          bgcolor: 'background.default',
        }}
      >
        {/* Mobile Sidebar - Drawer */}
        <Drawer
          variant="temporary"
          open={sidebarOpen}
          onClose={onSidebarClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: isVerySmallMobile ? 'calc(100vw - 56px)' : 280,
              maxWidth: 280,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              bgcolor: 'background.paper',
            },
          }}
        >
          {sidebar}
        </Drawer>

        {/* Email List - Hidden on mobile when detail shown */}
        <Box
          sx={{
            flex: 1,
            display: showDetail ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
            bgcolor: 'background.paper',
          }}
        >
          {list}
        </Box>

        {/* Email Detail - Fullscreen on mobile */}
        {showDetail && detail && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              zIndex: 1300,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.2s ease-out',
              '@keyframes slideInRight': {
                '0%': { transform: 'translateX(100%)' },
                '100%': { transform: 'translateX(0)' },
              },
            }}
          >
            {detail}
          </Box>
        )}
      </Box>
    );
  }

  // Desktop layout - Outlook-style clean design with v2.x API
  return (
    <Box
      sx={{
        height,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        minHeight: 0,
        minWidth: 0,
        bgcolor: 'background.default',
      }}
    >
      <PanelGroup
        direction="horizontal"
        onLayout={handlePanelResize}
        style={{ height: '100%', width: '100%' }}
      >
        {/* Sidebar Panel */}
        <Panel
          id="sidebar"
          order={1}
          defaultSize={initialSizes.sidebar}
          minSize={MIN_SIZES.sidebar}
          maxSize={30}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
            }}
          >
            {sidebar}
          </Box>
        </Panel>

        <OutlookResizeHandle id="sidebar-list-handle" />

        {/* List Panel */}
        <Panel
          id="list"
          order={2}
          defaultSize={showDetail ? initialSizes.list : 100 - initialSizes.sidebar}
          minSize={MIN_SIZES.list}
          maxSize={showDetail ? 55 : 100}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              bgcolor: 'background.paper',
              borderRight: showDetail ? 1 : 0,
              borderColor: 'divider',
            }}
          >
            {list}
          </Box>
        </Panel>

        {/* Detail Panel */}
        {showDetail && detail && (
          <>
            <OutlookResizeHandle id="list-detail-handle" />
            <Panel
              id="detail"
              order={3}
              minSize={MIN_SIZES.detail}
              style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  bgcolor: 'background.paper',
                }}
              >
                {detail}
              </Box>
            </Panel>
          </>
        )}
      </PanelGroup>
    </Box>
  );
};

export default ResizableEmailLayout;
