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

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Mail, Folder } from 'lucide-react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
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
import { isFolderReorderDropTarget, resolveFolderReorderTargetId } from '../utils/folder-targets';

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
        const emailIds =
          Array.isArray(active.data.current?.emailIds) &&
          active.data.current.emailIds.every((value) => typeof value === 'string')
            ? active.data.current.emailIds
            : [emailId];
        const targetFolder =
          over.data.current?.targetFolder ||
          over.data.current?.folderPath ||
          (over.id as string);
        const folderName = over.data.current?.folderName || 'folder';
        const emailProviderId = active.data.current?.providerId;
        const folderProviderId = over.data.current?.providerId;

        // Provider validation - only allow same-provider drops
        if (emailProviderId && folderProviderId && emailProviderId !== folderProviderId) {
          return; // Invalid cross-provider drop
        }

        onEmailDrop(emailIds, targetFolder, folderName);
      }

      // Folder reordering (sortable folders within same provider)
      if (isFolderReorderDropTarget(activeType, overType) && onFolderReorder) {
        const activeProviderId = active.data.current?.providerId;
        const overProviderId = over.data.current?.providerId;
        const activeFolderId =
          typeof active.data.current?.folderId === 'string'
            ? active.data.current.folderId
            : (active.id as string);
        const overFolderId = resolveFolderReorderTargetId(
          over.id,
          over.data.current?.folderId,
        );

        // Only allow reordering within same provider
        if (
          activeProviderId &&
          activeProviderId === overProviderId &&
          overFolderId &&
          activeFolderId !== overFolderId
        ) {
          onFolderReorder(activeProviderId, activeFolderId, overFolderId);
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

  // ==========================================================================
  // Layout persistence with Allotment (simpler, more robust)
  // ==========================================================================
  const STORAGE_KEY_2PANEL = 'email-layout-2panel';
  const STORAGE_KEY_3PANEL = 'email-layout-3panel';
  // Default sizes in pixels (will be scaled proportionally)
  const DEFAULT_2PANEL = [200, 800]; // sidebar, list
  const DEFAULT_3PANEL = [200, 400, 600]; // sidebar, list, reading-pane

  // Track if user has interacted (to avoid saving initial render values)
  const hasUserResized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved layout from localStorage
  const loadLayout = useCallback((key: string, defaultSizes: number[]): number[] => {
    if (typeof window === 'undefined') return defaultSizes;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return defaultSizes;
      const sizes = JSON.parse(stored) as number[];
      // Validate: must be array with correct length and reasonable sidebar size
      if (!Array.isArray(sizes) || sizes.length !== defaultSizes.length) {
        localStorage.removeItem(key);
        return defaultSizes;
      }
      // Validate sidebar is at least 100px
      if (sizes[0] < 100) {
        localStorage.removeItem(key);
        return defaultSizes;
      }
      return sizes;
    } catch {
      return defaultSizes;
    }
  }, []);

  // Save layout to localStorage (debounced)
  const saveLayout = useCallback((key: string, sizes: number[]) => {
    if (typeof window === 'undefined') return;
    if (!hasUserResized.current) return;
    // Validate sidebar is reasonable (at least 100px)
    if (sizes[0] < 100) return;
    // Debounce saves
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(sizes));
    }, 300);
  }, []);

  // Initial layouts from storage
  const [twoPanelSizes] = useState<number[]>(() =>
    loadLayout(STORAGE_KEY_2PANEL, DEFAULT_2PANEL)
  );
  const [threePanelSizes] = useState<number[]>(() =>
    loadLayout(STORAGE_KEY_3PANEL, DEFAULT_3PANEL)
  );

  // Handle layout changes (called during resize)
  const handleTwoPanelChange = useCallback((sizes: number[]) => {
    hasUserResized.current = true;
    saveLayout(STORAGE_KEY_2PANEL, sizes);
  }, [saveLayout]);

  const handleThreePanelChange = useCallback((sizes: number[]) => {
    hasUserResized.current = true;
    saveLayout(STORAGE_KEY_3PANEL, sizes);
  }, [saveLayout]);

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
            <Allotment
              defaultSizes={twoPanelSizes}
              onChange={handleTwoPanelChange}
              onDragEnd={() => { hasUserResized.current = true; }}
            >
              {/* Sidebar Pane */}
              <Allotment.Pane minSize={150} maxSize={350}>
                <Box sx={{ height: '100%', display: 'flex' }}>
                  <FolderSidebar collapsed={false} />
                </Box>
              </Allotment.Pane>

              {/* Email List Pane */}
              <Allotment.Pane minSize={300}>
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  {children}
                </Box>
              </Allotment.Pane>
            </Allotment>

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
                        {activeData.emailCount && activeData.emailCount > 1
                          ? `${activeData.emailCount} emails`
                          : activeData.thread?.subject || 'Email'}
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

            {/* Allotment sash styling */}
            <style jsx global>{`
              .split-view-view {
                overflow: hidden !important;
              }
              [data-allotment-sash] {
                --focus-border: ${theme.palette.primary.main};
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
      <Allotment
        defaultSizes={threePanelSizes}
        onChange={handleThreePanelChange}
        onDragEnd={() => { hasUserResized.current = true; }}
      >
        {/* Sidebar Pane */}
        <Allotment.Pane minSize={150} maxSize={280}>
          <Box sx={{ height: '100%', display: 'flex' }}>
            <FolderSidebar collapsed={false} />
          </Box>
        </Allotment.Pane>

        {/* Email List Pane */}
        <Allotment.Pane minSize={250} maxSize={500}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {children}
          </Box>
        </Allotment.Pane>

        {/* Reading Pane */}
        <Allotment.Pane minSize={350}>
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {readingPane}
          </Box>
        </Allotment.Pane>
      </Allotment>

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
                    {activeData.emailCount && activeData.emailCount > 1
                      ? `${activeData.emailCount} emails`
                      : activeData.thread?.subject || 'Email'}
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

        {/* Allotment sash styling */}
        <style jsx global>{`
          .split-view-view {
            overflow: hidden !important;
          }
          [data-allotment-sash] {
            --focus-border: ${theme.palette.primary.main};
          }
        `}</style>
        </Box>
      </EmailDndContext.Provider>
    </DndContext>
  );
}

export default EmailLayout;
