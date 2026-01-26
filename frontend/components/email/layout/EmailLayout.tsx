/**
 * Email Layout Component
 *
 * Main layout wrapper for the email module.
 * Provides the 3-panel layout: Sidebar | List | Preview
 * Uses react-resizable-panels for smooth resizing.
 *
 * CRITICAL: Single DndContext wraps both FolderSidebar and email list
 * so drag-drop works across components (email → folder drops)
 *
 * Design inspiration: TailAdmin + Superhuman
 * @see https://github.com/bvaughn/react-resizable-panels
 * @see https://dndkit.com (dnd-kit best practices)
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Mail, Folder } from 'lucide-react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragCancelEvent,
  type Active,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { FolderSidebar } from '../sidebar/FolderSidebar';
import { MobileEmailNav } from './MobileEmailNav';

// ============================================================================
// Shared DnD Context for Email Layout
// ============================================================================

interface EmailDndContextValue {
  activeId: string | null;
  activeType: 'email' | 'folder' | null;
  activeData: Active['data']['current'] | null;
}

const EmailDndContext = createContext<EmailDndContextValue>({
  activeId: null,
  activeType: null,
  activeData: null,
});

export const useEmailDnd = () => useContext(EmailDndContext);

interface EmailLayoutProps {
  children: React.ReactNode;
  /** Reading pane content (thread view) - shown on desktop as 3rd panel */
  readingPane?: React.ReactNode;
  /** Callback when reading pane is closed */
  onCloseReadingPane?: () => void;
  /** Callback when email is dropped on folder */
  onEmailDrop?: (emailIds: string[], folderId: string, folderName: string) => void;
  /** Callback when folders are reordered (for persisting order) */
  onFolderReorder?: (providerId: string, activeId: string, overId: string) => void;
}

/**
 * Email module layout with responsive 3-panel design
 *
 * - Mobile: Single panel (list or detail)
 * - Tablet: 2 panels (sidebar collapsed + content)
 * - Desktop: 3 panels (sidebar + list + preview)
 *
 * CRITICAL: Single DndContext wraps entire layout for cross-component drag-drop
 */
export function EmailLayout({
  children,
  readingPane,
  onCloseReadingPane: _onCloseReadingPane,
  onEmailDrop,
  onFolderReorder,
}: EmailLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  // Shared DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'email' | 'folder' | null>(null);
  const [activeData, setActiveData] = useState<Active['data']['current'] | null>(null);

  // Configure shared DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Hold 250ms before drag starts on touch
        tolerance: 5, // Allow 5px movement during delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start - detect type (email or folder)
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const type = active.data.current?.type as 'email' | 'folder' | undefined;
    setActiveId(active.id as string);
    setActiveType(type || null);
    setActiveData(active.data.current || null);
  }, []);

  // Handle drag cancel - reset state immediately
  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveId(null);
    setActiveType(null);
    setActiveData(null);
  }, []);

  // Handle drag end - route to appropriate handler
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      // Reset state first (important for cancel/failed drops)
      setActiveId(null);
      setActiveType(null);
      setActiveData(null);

      if (!over) return;

      const activeType = active.data.current?.type;
      const overType = over.data.current?.type;

      // Email dropped on folder
      if (activeType === 'email' && overType === 'folder' && onEmailDrop) {
        const emailId = active.id as string;
        const folderId = over.id as string;
        const folderName = over.data.current?.folderName || 'folder';
        const emailProviderId = active.data.current?.providerId;
        const folderProviderId = over.data.current?.providerId;

        // Provider validation - only allow same-provider drops
        if (emailProviderId && folderProviderId && emailProviderId !== folderProviderId) {
          return; // Invalid cross-provider drop
        }

        onEmailDrop([emailId], folderId, folderName);
      }

      // Folder reordering (sortable folders within same provider)
      if (activeType === 'sortable-folder' && overType === 'sortable-folder' && onFolderReorder) {
        const activeProviderId = active.data.current?.providerId;
        const overProviderId = over.data.current?.providerId;

        // Only allow reordering within same provider
        if (activeProviderId === overProviderId && active.id !== over.id) {
          onFolderReorder(activeProviderId, active.id as string, over.id as string);
        }
      }
    },
    [onEmailDrop, onFolderReorder]
  );

  // DnD context value for children
  const dndContextValue = React.useMemo(
    () => ({ activeId, activeType, activeData }),
    [activeId, activeType, activeData]
  );

  // Panel layout persistence with localStorage
  // Custom storage that validates data BEFORE returning (not after in useEffect)
  const layoutStorage = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        getItem: (_key: string): string | null => null,
        setItem: (_key: string, _value: string): void => {},
      };
    }

    // Validate panel sizes before returning - prevents corrupted data from loading
    const validateAndGetItem = (key: string): string | null => {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) return null;

        const sizes = JSON.parse(stored);
        if (!Array.isArray(sizes)) {
          localStorage.removeItem(key);
          return null;
        }

        // Determine minimum sidebar size based on layout type
        const minSidebarSize = key.includes('3panel') ? 8 : 10;

        // If sidebar (first panel) is too narrow, discard corrupted data
        if (sizes[0] < minSidebarSize) {
          localStorage.removeItem(key);
          return null;
        }

        return stored;
      } catch {
        localStorage.removeItem(key);
        return null;
      }
    };

    return {
      getItem: validateAndGetItem,
      setItem: (key: string, value: string): void => {
        localStorage.setItem(key, value);
      },
    };
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
            minHeight: 0, // CRITICAL: Allow flex shrinking for scroll
            overflow: 'auto', // Allow scrolling
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
            minHeight: 0, // CRITICAL: Allow flex shrinking for scroll
            overflow: 'auto', // Allow scrolling
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <EmailDndContext.Provider value={dndContextValue}>
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

            {/* Centralized DragOverlay - handles both email and folder drags */}
            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
              {activeId && activeData ? (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                    border: '1px solid',
                    borderColor: 'divider',
                    minWidth: 200,
                    maxWidth: 300,
                  }}
                >
                  {activeData.type === 'email' ? (
                    <>
                      <Mail size={18} style={{ color: theme.palette.primary.main }} />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                        {activeData.thread?.subject || 'Email'}
                      </Typography>
                    </>
                  ) : (
                    <>
                      <Folder size={18} style={{ color: theme.palette.warning.main }} />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                        {activeData.folderName || 'Folder'}
                      </Typography>
                    </>
                  )}
                </Box>
              ) : null}
            </DragOverlay>

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
        </EmailDndContext.Provider>
      </DndContext>
    );
  }

  // 3-panel mode (reading pane visible)
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <EmailDndContext.Provider value={dndContextValue}>
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

        {/* Centralized DragOverlay - handles both email and folder drags */}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
          {activeId && activeData ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                bgcolor: 'background.paper',
                borderRadius: 1,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                border: '1px solid',
                borderColor: 'divider',
                minWidth: 200,
                maxWidth: 300,
              }}
            >
              {activeData.type === 'email' ? (
                <>
                  <Mail size={18} style={{ color: theme.palette.primary.main }} />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {activeData.thread?.subject || 'Email'}
                  </Typography>
                </>
              ) : (
                <>
                  <Folder size={18} style={{ color: theme.palette.warning.main }} />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {activeData.folderName || 'Folder'}
                  </Typography>
                </>
              )}
            </Box>
          ) : null}
        </DragOverlay>

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
      </EmailDndContext.Provider>
    </DndContext>
  );
}

export default EmailLayout;
