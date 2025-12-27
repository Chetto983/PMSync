import React, { useCallback, useState, useEffect } from 'react';
import { Box, Drawer, useMediaQuery, useTheme, alpha } from '@mui/material';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';

/**
 * Default panel sizes (percentages)
 * - Sidebar: 15% (min 10%, max 25%)
 * - List: 30% (min 20%, max 50%)
 * - Detail: remaining space
 */
const DEFAULT_SIZES = {
  sidebar: 15,
  list: 30,
};

const STORAGE_KEY = 'mailagent-email-panel-sizes';

const clampSize = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Props for ResizableEmailLayout component
 */
interface ResizableEmailLayoutProps {
  /**
   * Sidebar component (folders, navigation)
   */
  sidebar: React.ReactNode;

  /**
   * Email list component
   */
  list: React.ReactNode;

  /**
   * Email detail panel component (optional - shown when email is selected)
   */
  detail?: React.ReactNode;

  /**
   * Whether to show the detail panel
   */
  showDetail?: boolean;

  /**
   * Whether sidebar is open on mobile
   */
  sidebarOpen?: boolean;

  /**
   * Callback to close mobile sidebar
   */
  onSidebarClose?: () => void;

  /**
   * Custom height for the layout (default: '100%')
   */
  height?: string;

  /**
   * Enable panel resize persistence to localStorage
   * @default true
   */
  persistSizes?: boolean;
}

/**
 * Custom resize handle component with visual indicator
 */
function ResizeHandle({
  id,
  orientation = 'vertical',
}: {
  id?: string;
  orientation?: 'vertical' | 'horizontal';
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (!isDragging || typeof window === 'undefined') return;

    const handlePointerUp = () => setIsDragging(false);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  return (
    <Separator
      id={id}
      onPointerDown={() => setIsDragging(true)}
      onPointerUp={() => setIsDragging(false)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: orientation === 'vertical' ? 12 : '100%',
        height: orientation === 'horizontal' ? 12 : '100%',
        backgroundColor: 'transparent',
        cursor: orientation === 'vertical' ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        zIndex: 10,
        margin: '0 -6px', // Negative margin to overlay on padding
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: orientation === 'vertical' ? 4 : 32,
          height: orientation === 'horizontal' ? 4 : 32,
          borderRadius: 2,
          backgroundColor: isDragging
            ? 'primary.main'
            : alpha(theme.palette.divider, 0.0), // Invisible by default
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'primary.main', // Visible on hover
          },
        }}
      >
        <GripVertical
          size={16}
          style={{
            opacity: isDragging || isHovered ? 1 : 0, // Only show icon on interaction
            color: 'white',
          }}
        />
      </Box>
    </Separator>
  );
}

/**
 * ResizableEmailLayout - Gmail/Outlook-style email interface with resizable panels
 *
 * Uses react-resizable-panels for smooth, accessible panel resizing.
 * Panel sizes are persisted to localStorage.
 *
 * Desktop (>= md):
 * - Resizable sidebar (default 15%, min 10%, max 25%)
 * - Resizable email list (default 30%, min 20%, max 50%)
 * - Detail panel takes remaining space
 *
 * Mobile (< md):
 * - Drawer sidebar (swipeable)
 * - Fullscreen email list
 * - Fullscreen detail panel over list
 *
 * @see https://react-resizable-panels.vercel.app/
 *
 * @example
 * ```tsx
 * <ResizableEmailLayout
 *   sidebar={<EmailSidebar />}
 *   list={<ThreadList />}
 *   detail={<ThreadDisplay />}
 *   showDetail={!!selectedEmail}
 *   sidebarOpen={mobileDrawerOpen}
 *   onSidebarClose={() => setMobileDrawerOpen(false)}
 * />
 * ```
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

  // Load persisted sizes from localStorage (SSR-safe)
  const getPersistedSizes = useCallback(() => {
    if (typeof window === 'undefined' || !persistSizes) {
      return DEFAULT_SIZES;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          sidebar: clampSize(parsed.sidebar ?? DEFAULT_SIZES.sidebar, 10, 25),
          list: clampSize(parsed.list ?? DEFAULT_SIZES.list, 20, 50),
        };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SIZES;
  }, [persistSizes]);

  // Handle panel resize - persist to localStorage
  const handlePanelResize = useCallback(
    (layout: Layout) => {
      if (typeof window === 'undefined' || !persistSizes) return;

      try {
        const newSizes = {
          sidebar: clampSize(layout.sidebar ?? DEFAULT_SIZES.sidebar, 10, 25),
          list: clampSize(layout.list ?? DEFAULT_SIZES.list, 20, 50),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSizes));
      } catch {
        // Ignore storage errors
      }
    },
    [persistSizes]
  );

  // Get initial sizes
  const [initialSizes, setInitialSizes] = useState(DEFAULT_SIZES);

  // Load sizes on mount (client-side only)
  useEffect(() => {
    setInitialSizes(getPersistedSizes());
  }, [getPersistedSizes]);

  // Mobile layout - same as before (no resizing needed)
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
            bgcolor: 'background.default',
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
              animation: 'slideInRight 0.3s ease-out',
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

  // Desktop layout with resizable panels - GLASSMORPHISM UPDATE
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
        bgcolor: 'background.default', // Ensure base background is visible through gaps
        p: 2, // Outer padding for floating effect
        gap: 2, // Gaps between glass panels
      }}
    >
      <Group
        orientation="horizontal"
        onLayoutChange={handlePanelResize}
        style={{ height: '100%', width: '100%', minHeight: 0, gap: '16px' }}
      >
        {/* Sidebar Panel - GLASS LEFT */}
        <Panel
          id="sidebar"
          defaultSize={initialSizes.sidebar}
          minSize={10}
          maxSize={25}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
              minWidth: 0,
              // Glassmorphism Container
              backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.7),
              backdropFilter: 'blur(12px)',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: (theme) => alpha(theme.palette.divider, 0.1),
              boxShadow: (theme) => `0 4px 20px ${alpha(theme.palette.common.black, 0.05)}`,
            }}
          >
            {sidebar}
          </Box>
        </Panel>

        <ResizeHandle id="sidebar-list-handle" />

        {/* List Panel - GLASS CENTER */}
        <Panel
          id="list"
          defaultSize={showDetail ? initialSizes.list : 100 - initialSizes.sidebar}
          minSize={20}
          maxSize={showDetail ? 50 : 100}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
            marginLeft: '16px',
            marginRight: showDetail ? '16px' : 0,
          }}
        >
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
              minWidth: 0,
              // Glassmorphism Container
              backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.6),
              backdropFilter: 'blur(12px)',
              borderRadius: '16px',
              border: '1px solid',
              borderColor: (theme) => alpha(theme.palette.divider, 0.1),
              boxShadow: (theme) => `0 4px 20px ${alpha(theme.palette.common.black, 0.05)}`,
            }}
          >
            {list}
          </Box>
        </Panel>

        {/* Detail Panel - GLASS RIGHT */}
        {showDetail && detail && (
          <>
            <ResizeHandle id="list-detail-handle" />
            <Panel
              id="detail"
              minSize={30}
              style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  minHeight: 0,
                  minWidth: 0,
                  // Glassmorphism Container (Paper look)
                  backgroundColor: 'background.paper',
                  borderRadius: '16px',
                  border: '1px solid',
                  borderColor: (theme) => alpha(theme.palette.divider, 0.1),
                  boxShadow: (theme) => `0 8px 30px ${alpha(theme.palette.common.black, 0.08)}`,
                }}
              >
                {detail}
              </Box>
            </Panel>
          </>
        )}
      </Group>
    </Box>
  );
};

export default ResizableEmailLayout;
