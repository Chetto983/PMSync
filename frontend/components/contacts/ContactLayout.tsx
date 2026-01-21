import React from 'react';
import { Box, Drawer, SwipeableDrawer, useMediaQuery, useTheme, alpha } from '@mui/material';

/**
 * Props for ContactLayout component
 */
interface ContactLayoutProps {
  /**
   * Sidebar component (filters, sync button)
   */
  sidebar: React.ReactNode;

  /**
   * Contact list component
   */
  list: React.ReactNode;

  /**
   * Contact detail panel component (optional - shown when contact is selected)
   */
  detail?: React.ReactNode;

  /**
   * Whether to show the detail panel
   */
  showDetail?: boolean;

  /**
   * Callback to close detail panel (for mobile swipe dismiss)
   */
  onDetailClose?: () => void;

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
}

/**
 * ContactLayout - 3-panel layout for contacts (similar to EmailLayout)
 *
 * Desktop (>= md):
 * - Fixed sidebar (220px)
 * - Contact list (400px when detail shown, flex otherwise)
 * - Detail panel (flex) when contact selected
 *
 * Mobile (< md):
 * - Drawer sidebar (swipeable)
 * - Fullscreen contact list
 * - Bottom sheet detail panel (swipeable, expandable card)
 */
export const ContactLayout: React.FC<ContactLayoutProps> = ({
  sidebar,
  list,
  detail,
  showDetail = false,
  onDetailClose,
  sidebarOpen = false,
  onSidebarClose,
  height = '100%',
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isVerySmallMobile = useMediaQuery('(max-width:360px)');

  // Prevent body scroll when drawer is open
  const handleOpen = () => {
    // No-op, controlled by parent
  };

  return (
    <Box
      sx={{
        height,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Desktop Sidebar - Fixed */}
      {!isMobile && (
        <Box
          sx={{
            width: 220,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
            bgcolor: 'background.paper',
          }}
        >
          {sidebar}
        </Box>
      )}

      {/* Mobile Sidebar - Drawer */}
      {isMobile && (
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
      )}

      {/* Contact List - Always visible */}
      <Box
        sx={{
          width: showDetail && !isMobile ? 400 : 'auto',
          flex: showDetail && !isMobile ? '0 0 400px' : 1,
          minWidth: showDetail && !isMobile ? 400 : 'auto',
          borderRight: { xs: 0, md: showDetail ? 1 : 0 },
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {list}
      </Box>

      {/* Contact Detail - Bottom Sheet on mobile, panel on desktop */}
      {isMobile ? (
        <SwipeableDrawer
          anchor="bottom"
          open={showDetail && !!detail}
          onClose={onDetailClose || (() => {})}
          onOpen={handleOpen}
          disableSwipeToOpen
          swipeAreaWidth={0}
          ModalProps={{
            keepMounted: true,
          }}
          PaperProps={{
            sx: {
              height: 'calc(100% - 56px)',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: 'hidden',
              bgcolor: 'background.paper',
              boxShadow: `0 -8px 32px ${alpha(theme.palette.common.black, 0.15)}`,
            },
          }}
          sx={{
            '& .MuiDrawer-paper': {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            },
            '& .MuiBackdrop-root': {
              bgcolor: alpha(theme.palette.common.black, 0.4),
            },
          }}
        >
          {/* Drag Handle */}
          <Box
            sx={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              pt: 1.5,
              pb: 1,
              cursor: 'grab',
              '&:active': {
                cursor: 'grabbing',
              },
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 4,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.text.primary, 0.2),
              }}
            />
          </Box>

          {/* Detail Content */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {detail}
          </Box>
        </SwipeableDrawer>
      ) : (
        // Desktop: Side panel
        showDetail && detail && (
          <Box
            sx={{
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            {detail}
          </Box>
        )
      )}
    </Box>
  );
};

export default ContactLayout;
