import React from 'react';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';

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
 * - Fullscreen detail panel over list
 */
export const ContactLayout: React.FC<ContactLayoutProps> = ({
  sidebar,
  list,
  detail,
  showDetail = false,
  sidebarOpen = false,
  onSidebarClose,
  height = '100%',
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isVerySmallMobile = useMediaQuery('(max-width:360px)');

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

      {/* Contact List - Hidden on mobile when detail shown */}
      <Box
        sx={{
          width: showDetail && !isMobile ? 400 : 'auto',
          flex: showDetail && !isMobile ? '0 0 400px' : 1,
          minWidth: showDetail && !isMobile ? 400 : 'auto',
          borderRight: { xs: 0, md: showDetail ? 1 : 0 },
          borderColor: 'divider',
          display: isMobile && showDetail ? 'none' : 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {list}
      </Box>

      {/* Contact Detail - Fullscreen on mobile, panel on desktop */}
      {showDetail && detail && (
        <Box
          sx={{
            flex: isMobile ? 'none' : '1 1 auto',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: isMobile ? 'fixed' : 'relative',
            top: isMobile ? 0 : 'auto',
            left: isMobile ? 0 : 'auto',
            right: isMobile ? 0 : 'auto',
            bottom: isMobile ? 0 : 'auto',
            width: isMobile ? '100%' : 'auto',
            height: isMobile ? '100%' : 'auto',
            zIndex: isMobile ? 1300 : 'auto',
            bgcolor: 'background.paper',
            transition: isMobile
              ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'none',
            animation: isMobile ? 'slideInRight 0.3s ease-out' : 'none',
            '@keyframes slideInRight': {
              '0%': {
                transform: 'translateX(100%)',
              },
              '100%': {
                transform: 'translateX(0)',
              },
            },
          }}
        >
          {detail}
        </Box>
      )}
    </Box>
  );
};

export default ContactLayout;
